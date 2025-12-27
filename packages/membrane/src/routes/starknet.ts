/**
 * Starknet Signature Verification Routes
 *
 * Provides signature verification for Starknet accounts.
 * Supports both Argent and Braavos wallet signatures.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { RpcProvider, typedData, constants, shortString, hash, ec, num } from "starknet";
import {
  saveNonce,
  getNonce,
  deleteNonce,
  deleteExpiredNonces,
} from "../lib/database.js";
import { sha256 } from "../lib/canonical.js";

const app = new Hono();

// Chain configuration
const CHAIN_CONFIGS: Record<string, { rpcUrl: string; chainId: string }> = {
  "SN_MAIN": {
    rpcUrl: "https://starknet-mainnet.public.blastapi.io",
    chainId: constants.StarknetChainId.SN_MAIN,
  },
  "SN_SEPOLIA": {
    rpcUrl: "https://starknet-sepolia.public.blastapi.io",
    chainId: constants.StarknetChainId.SN_SEPOLIA,
  },
};

// Schema definitions
const NonceRequestSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid Starknet address"),
  chainId: z.enum(["SN_MAIN", "SN_SEPOLIA"]).default("SN_SEPOLIA"),
});

const VerifySignatureSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]+$/),
  signature: z.array(z.string()).min(2, "Signature must have at least 2 elements"),
  message: z.string(),
  typedData: z.object({
    types: z.record(z.array(z.object({ name: z.string(), type: z.string() }))),
    primaryType: z.string(),
    domain: z.object({
      name: z.string(),
      version: z.string(),
      chainId: z.string(),
      revision: z.string().optional(),
    }),
    message: z.record(z.unknown()),
  }).optional(),
  chainId: z.enum(["SN_MAIN", "SN_SEPOLIA"]).default("SN_SEPOLIA"),
});

/**
 * POST /starknet/nonce
 *
 * Generate a nonce for Starknet signature verification.
 */
app.post("/nonce", zValidator("json", NonceRequestSchema), async (c) => {
  const { address, chainId } = c.req.valid("json");

  // Generate random nonce
  const nonce = `fab_starknet_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes

  // Store nonce
  saveNonce({
    address: address.toLowerCase(),
    nonce,
    type: "starknet",
    createdAt: now,
    expiresAt,
  });

  // Clean up expired nonces
  deleteExpiredNonces();

  // Hash the nonce string to get a valid felt
  const nonceHash = await sha256(nonce);
  // Truncate to 251 bits (Starknet field element max)
  const nonceFelt = num.toHex(BigInt(nonceHash) & ((1n << 251n) - 1n));

  // Create typed data for signing
  const messageTypedData = {
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
      ],
      FabAuth: [
        { name: "action", type: "shortstring" },
        { name: "nonce", type: "felt" },
        { name: "timestamp", type: "felt" },
      ],
    },
    primaryType: "FabAuth",
    domain: {
      name: "Fab",
      version: "1",
      chainId,
    },
    message: {
      action: shortString.encodeShortString("authenticate"),
      nonce: nonceFelt,
      timestamp: Math.floor(Date.now() / 1000).toString(),
    },
  };

  return c.json({
    nonce,
    typedData: messageTypedData,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
});

/**
 * POST /starknet/verify
 *
 * Verify a Starknet signature against a message.
 */
app.post("/verify", zValidator("json", VerifySignatureSchema), async (c) => {
  const { address, signature, message, typedData: msgTypedData, chainId } = c.req.valid("json");

  try {
    const chainConfig = CHAIN_CONFIGS[chainId];
    if (!chainConfig) {
      return c.json({ valid: false, error: "Unsupported chain" }, 400);
    }

    // Validate nonce if message contains expected pattern
    if (message.startsWith("fab_starknet_")) {
      const storedNonce = getNonce(address.toLowerCase(), "starknet");
      if (!storedNonce || storedNonce.nonce !== message) {
        return c.json({ valid: false, error: "Invalid or expired nonce" }, 400);
      }
      if (Date.now() > storedNonce.expiresAt) {
        deleteNonce(address.toLowerCase(), "starknet");
        return c.json({ valid: false, error: "Nonce expired" }, 400);
      }
    }

    // Create provider
    const provider = new RpcProvider({ nodeUrl: chainConfig.rpcUrl });

    // Verify signature using account
    // Starknet accounts implement SNIP-12 signature verification
    let isValid = false;

    if (msgTypedData) {
      // Verify typed data signature
      const messageHash = typedData.getMessageHash(msgTypedData, address);
      isValid = await verifyStarknetSignature(
        provider,
        address,
        messageHash,
        signature
      );
    } else {
      // Verify raw message signature
      const messageHash = hash.computeHashOnElements([message]);
      isValid = await verifyStarknetSignature(
        provider,
        address,
        messageHash,
        signature
      );
    }

    if (isValid) {
      // Clear used nonce
      deleteNonce(address.toLowerCase(), "starknet");

      return c.json({
        valid: true,
        address,
        chainId,
        verifiedAt: new Date().toISOString(),
      });
    }

    return c.json({ valid: false, error: "Invalid signature" }, 401);
  } catch (error) {
    console.error("Signature verification error:", error);
    return c.json(
      { valid: false, error: error instanceof Error ? error.message : "Verification failed" },
      500
    );
  }
});

/**
 * Verify Starknet signature using account's is_valid_signature
 */
async function verifyStarknetSignature(
  provider: RpcProvider,
  address: string,
  messageHash: string,
  signature: string[]
): Promise<boolean> {
  try {
    // Call is_valid_signature on the account contract
    // This works for Argent, Braavos, and other standard accounts
    const result = await provider.callContract({
      contractAddress: address,
      entrypoint: "is_valid_signature",
      calldata: [
        messageHash,
        signature.length.toString(),
        ...signature,
      ],
    });

    // is_valid_signature returns 1 (VALID) for valid signatures
    // Following SNIP-12 standard
    return result[0] === "0x1" || result[0] === "1";
  } catch (error) {
    // If the account doesn't implement is_valid_signature or call fails,
    // try EC verification for EOA-like behavior
    console.warn("is_valid_signature call failed, trying EC verification:", error);

    try {
      // Fallback: EC signature verification
      // This works for accounts with standard ECDSA keys
      const pubKey = await getAccountPublicKey(provider, address);
      if (!pubKey) return false;

      const [r, s] = signature;
      // Use starknet's verify function with proper signature format
      const sig = new ec.starkCurve.Signature(BigInt(r), BigInt(s));
      return ec.starkCurve.verify(sig, messageHash, pubKey);
    } catch {
      return false;
    }
  }
}

/**
 * Try to get public key from account
 */
async function getAccountPublicKey(
  provider: RpcProvider,
  address: string
): Promise<string | null> {
  try {
    // Try get_owner (Argent) or get_public_key (Braavos)
    for (const entrypoint of ["get_owner", "get_public_key", "getSigner"]) {
      try {
        const result = await provider.callContract({
          contractAddress: address,
          entrypoint,
          calldata: [],
        });
        if (result && result[0]) {
          return result[0];
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /starknet/status
 *
 * Check if Starknet verification is available.
 */
app.get("/status", async (c) => {
  const statuses: Record<string, boolean> = {};

  for (const [chainId, config] of Object.entries(CHAIN_CONFIGS)) {
    try {
      const provider = new RpcProvider({ nodeUrl: config.rpcUrl });
      await provider.getChainId();
      statuses[chainId] = true;
    } catch {
      statuses[chainId] = false;
    }
  }

  return c.json({
    available: Object.values(statuses).some(Boolean),
    chains: statuses,
  });
});

export default app;
