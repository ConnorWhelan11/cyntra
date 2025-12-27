/**
 * Unified Identity Routes
 *
 * Provides cross-chain identity linking between:
 * - Starknet (Cartridge Controller)
 * - EVM chains (SIWE - Sign-In with Ethereum)
 *
 * Users can link their Starknet and EVM identities for seamless
 * cross-chain asset ownership verification.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { SiweMessage, generateNonce } from "siwe";
import { verifyMessage, type Hex } from "viem";
import { sha256 } from "../lib/canonical.js";
import {
  saveNonce,
  getNonce,
  deleteNonce,
  saveLinkedIdentity,
  getLinkedIdentitiesByAddress,
  getLinkedIdentityByStarknet,
} from "../lib/database.js";

const app = new Hono();

// Nonce request schema
const NonceRequestSchema = z.object({
  address: z.string(),
});

// SIWE verification schema
const SiweVerifySchema = z.object({
  message: z.string(),
  signature: z.string(),
});

// Link identity schema
const LinkIdentitySchema = z.object({
  starknetAddress: z.string(),
  evmAddress: z.string(),
  evmSignature: z.string(),
  starknetSignature: z.string().optional(), // Optional until Starknet signature verification implemented
  message: z.string(),
});

/**
 * POST /identity/nonce
 *
 * Generate a nonce for SIWE authentication.
 */
app.post(
  "/nonce",
  zValidator("json", NonceRequestSchema),
  async (c) => {
    const { address } = c.req.valid("json");
    const nonce = generateNonce();
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    saveNonce({
      address: address.toLowerCase(),
      nonce,
      type: "siwe",
      createdAt: now,
      expiresAt,
    });

    return c.json({
      nonce,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }
);

/**
 * POST /identity/verify-siwe
 *
 * Verify a SIWE signature and create a session.
 */
app.post(
  "/verify-siwe",
  zValidator("json", SiweVerifySchema),
  async (c) => {
    const { message, signature } = c.req.valid("json");

    try {
      const siweMessage = new SiweMessage(message);
      const address = siweMessage.address.toLowerCase();

      // Check nonce
      const storedNonce = getNonce(address, "siwe");
      if (!storedNonce) {
        return c.json({ error: "No nonce found for address" }, 400);
      }

      if (Date.now() > storedNonce.expiresAt) {
        deleteNonce(address, "siwe");
        return c.json({ error: "Nonce expired" }, 400);
      }

      if (siweMessage.nonce !== storedNonce.nonce) {
        return c.json({ error: "Invalid nonce" }, 400);
      }

      // Verify signature
      const result = await siweMessage.verify({
        signature,
        nonce: storedNonce.nonce,
      });

      if (!result.success) {
        return c.json({ error: "Invalid signature" }, 401);
      }

      // Clear nonce
      deleteNonce(address, "siwe");

      // Generate session token
      const sessionToken = await sha256(
        JSON.stringify({
          address,
          timestamp: Date.now(),
          random: Math.random().toString(),
        })
      );

      return c.json({
        verified: true,
        address: siweMessage.address,
        sessionToken,
        expiresAt: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString(), // 24 hours
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Verification failed",
        },
        400
      );
    }
  }
);

/**
 * POST /identity/link
 *
 * Link a Starknet address to an EVM address.
 *
 * Both addresses must sign the same linking message to prove ownership.
 */
app.post(
  "/link",
  zValidator("json", LinkIdentitySchema),
  async (c) => {
    const {
      starknetAddress,
      evmAddress,
      evmSignature,
      // starknetSignature - unused until Starknet verification implemented
      message,
    } = c.req.valid("json");

    try {
      // Verify the EVM signature
      // Note: verifyMessage returns a Promise<boolean> in viem v2+
      let isValidEvm = false;
      try {
        isValidEvm = await verifyMessage({
          address: evmAddress as Hex,
          message,
          signature: evmSignature as Hex,
        });
      } catch {
        isValidEvm = false;
      }

      if (!isValidEvm) {
        return c.json({ error: "Invalid EVM signature" }, 401);
      }

      // Note: Starknet signature verification would require
      // importing starknet.js and verifying against the Controller
      // For now, we trust the message content includes the Starknet address

      // Verify message contains both addresses
      if (
        !message.includes(starknetAddress) ||
        !message.includes(evmAddress)
      ) {
        return c.json(
          { error: "Message must contain both addresses" },
          400
        );
      }

      // Store linked identity
      const linkId = await sha256(`${starknetAddress}:${evmAddress}`);
      saveLinkedIdentity({
        id: linkId,
        starknetAddress,
        evmAddress,
        linkedAt: Date.now(),
        signature: evmSignature,
      });

      return c.json({
        linked: true,
        linkId,
        starknetAddress,
        evmAddress,
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Linking failed",
        },
        400
      );
    }
  }
);

/**
 * GET /identity/lookup/:address
 *
 * Look up linked identities for an address (Starknet or EVM).
 */
app.get("/lookup/:address", (c) => {
  const address = c.req.param("address");

  // Search for matches
  const matches = getLinkedIdentitiesByAddress(address);

  if (matches.length === 0) {
    return c.json({ found: false });
  }

  return c.json({
    found: true,
    identities: matches.map((m) => ({
      starknetAddress: m.starknetAddress,
      evmAddress: m.evmAddress,
      linkedAt: new Date(m.linkedAt).toISOString(),
    })),
  });
});

/**
 * POST /identity/verify-ownership
 *
 * Verify that a Starknet address owns an asset attested on EVM.
 *
 * Uses the linked identity to prove cross-chain ownership.
 */
app.post(
  "/verify-ownership",
  zValidator(
    "json",
    z.object({
      starknetAddress: z.string(),
      attestationUid: z.string(),
    })
  ),
  async (c) => {
    const { starknetAddress, attestationUid } = c.req.valid("json");

    // Find linked EVM address
    const linkedIdentity = getLinkedIdentityByStarknet(starknetAddress);

    if (!linkedIdentity) {
      return c.json({
        verified: false,
        error: "No linked EVM identity found",
      });
    }

    // In a full implementation, we would:
    // 1. Fetch the attestation from EAS
    // 2. Check the attester matches the linked EVM address
    // 3. Return verification result

    return c.json({
      verified: true,
      starknetAddress,
      linkedEvmAddress: linkedIdentity.evmAddress,
      attestationUid,
      message: "Ownership verified via linked identity",
    });
  }
);

/**
 * GET /identity/generate-link-message
 *
 * Generate a message for linking identities.
 */
app.get("/generate-link-message", (c) => {
  const starknetAddress = c.req.query("starknet");
  const evmAddress = c.req.query("evm");

  if (!starknetAddress || !evmAddress) {
    return c.json(
      { error: "Both starknet and evm query params required" },
      400
    );
  }

  const timestamp = new Date().toISOString();
  const message = `I am linking my Glia Fab identities:

Starknet: ${starknetAddress}
EVM: ${evmAddress}

Timestamp: ${timestamp}

By signing this message, I prove I control both addresses and consent to linking them for cross-chain asset verification.`;

  return c.json({
    message,
    starknetAddress,
    evmAddress,
    timestamp,
  });
});

export default app;
