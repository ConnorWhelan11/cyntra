/**
 * Lit Protocol Routes for Access Control
 *
 * Provides API for encrypting and decrypting gated content.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  LitAccessControl,
  createNftOwnershipCondition,
  createErc1155OwnershipCondition,
  createTokenBalanceCondition,
  createAddressListCondition,
  createUniverseAccessConditions,
  combineConditions,
  type EncryptedData,
} from "../lib/lit.js";

const app = new Hono();

// Global Lit client instance
let litClient: LitAccessControl | null = null;

// Schemas
const ChainSchema = z.enum([
  "ethereum",
  "base",
  "base-sepolia",
  "optimism",
  "polygon",
]).default("base-sepolia");

const AccessConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("nft-ownership"),
    contractAddress: z.string(),
    chain: ChainSchema,
  }),
  z.object({
    type: z.literal("erc1155"),
    contractAddress: z.string(),
    tokenId: z.string(),
    minBalance: z.string().default("1"),
    chain: ChainSchema,
  }),
  z.object({
    type: z.literal("token-balance"),
    contractAddress: z.string(),
    minBalance: z.string(),
    chain: ChainSchema,
  }),
  z.object({
    type: z.literal("address-list"),
    addresses: z.array(z.string()),
    chain: ChainSchema,
  }),
  z.object({
    type: z.literal("universe-access"),
    nftContract: z.string(),
    attestationSchema: z.string().optional(),
    chain: ChainSchema,
  }),
]);

const EncryptRequestSchema = z.object({
  data: z.string(),
  conditions: z.array(AccessConditionSchema),
  combineWith: z.enum(["and", "or"]).default("or"),
  chain: ChainSchema,
});

const DecryptRequestSchema = z.object({
  encryptedData: z.object({
    ciphertext: z.string(),
    dataToEncryptHash: z.string(),
    accessControlConditions: z.array(z.unknown()),
    chain: z.string(),
  }),
  authSig: z.object({
    sig: z.string(),
    derivedVia: z.string(),
    signedMessage: z.string(),
    address: z.string(),
  }),
});

/**
 * Get or create Lit client
 */
async function getLitClient(): Promise<LitAccessControl> {
  if (!litClient) {
    const network = (process.env.LIT_NETWORK as "datil" | "datil-dev" | "datil-test") || "datil-test";
    litClient = new LitAccessControl(network);
    await litClient.connect();
  }
  return litClient;
}

/**
 * Build access conditions from schema
 */
function buildAccessConditions(
  conditions: z.infer<typeof AccessConditionSchema>[]
): ReturnType<typeof createNftOwnershipCondition>[] {
  return conditions.map((cond) => {
    switch (cond.type) {
      case "nft-ownership":
        return createNftOwnershipCondition(cond.contractAddress, cond.chain);
      case "erc1155":
        return createErc1155OwnershipCondition(
          cond.contractAddress,
          cond.tokenId,
          cond.minBalance,
          cond.chain
        );
      case "token-balance":
        return createTokenBalanceCondition(
          cond.contractAddress,
          cond.minBalance,
          cond.chain
        );
      case "address-list":
        return createAddressListCondition(cond.addresses, cond.chain);
      case "universe-access":
        return createUniverseAccessConditions(
          cond.nftContract,
          cond.attestationSchema,
          cond.chain
        );
      default:
        throw new Error(`Unknown condition type`);
    }
  });
}

/**
 * GET /lit/status
 *
 * Check Lit Protocol connection status
 */
app.get("/status", async (c) => {
  try {
    // Verify client can connect
    await getLitClient();
    return c.json({
      connected: true,
      network: process.env.LIT_NETWORK || "datil-test",
    });
  } catch (error) {
    return c.json({
      connected: false,
      error: error instanceof Error ? error.message : "Connection failed",
    });
  }
});

/**
 * POST /lit/encrypt
 *
 * Encrypt data with access conditions
 */
app.post("/encrypt", zValidator("json", EncryptRequestSchema), async (c) => {
  const { data, conditions, combineWith, chain } = c.req.valid("json");

  try {
    const client = await getLitClient();
    const accessConditions = buildAccessConditions(conditions);
    const combined = combineConditions(accessConditions, combineWith);

    const encrypted = await client.encrypt(data, combined, chain);

    return c.json({
      success: true,
      encryptedData: encrypted,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Encryption failed" },
      500
    );
  }
});

/**
 * POST /lit/decrypt
 *
 * Decrypt data (requires wallet signature)
 */
app.post("/decrypt", zValidator("json", DecryptRequestSchema), async (c) => {
  const { encryptedData, authSig } = c.req.valid("json");

  try {
    const client = await getLitClient();
    const decrypted = await client.decrypt(
      encryptedData as EncryptedData,
      authSig
    );

    return c.json({
      success: true,
      data: decrypted,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Decryption failed" },
      500
    );
  }
});

/**
 * POST /lit/check-access
 *
 * Check if a user meets access conditions
 */
app.post(
  "/check-access",
  zValidator(
    "json",
    z.object({
      conditions: z.array(AccessConditionSchema),
      combineWith: z.enum(["and", "or"]).default("or"),
      authSig: z.object({
        sig: z.string(),
        derivedVia: z.string(),
        signedMessage: z.string(),
        address: z.string(),
      }),
      chain: ChainSchema,
    })
  ),
  async (c) => {
    const { conditions, combineWith, authSig, chain } = c.req.valid("json");

    try {
      const client = await getLitClient();
      const accessConditions = buildAccessConditions(conditions);
      const combined = combineConditions(accessConditions, combineWith);

      const hasAccess = await client.checkAccess(combined, authSig, chain);

      return c.json({
        hasAccess,
        address: authSig.address,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Check failed" },
        500
      );
    }
  }
);

/**
 * POST /lit/conditions/build
 *
 * Build access conditions without encrypting (for preview)
 */
app.post(
  "/conditions/build",
  zValidator(
    "json",
    z.object({
      conditions: z.array(AccessConditionSchema),
      combineWith: z.enum(["and", "or"]).default("or"),
    })
  ),
  (c) => {
    const { conditions, combineWith } = c.req.valid("json");

    try {
      const accessConditions = buildAccessConditions(conditions);
      const combined = combineConditions(accessConditions, combineWith);

      return c.json({
        accessControlConditions: combined,
        conditionCount: conditions.length,
        operator: combineWith,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Build failed" },
        400
      );
    }
  }
);

/**
 * POST /lit/disconnect
 *
 * Disconnect Lit client
 */
app.post("/disconnect", async (c) => {
  if (litClient) {
    await litClient.disconnect();
    litClient = null;
  }
  return c.json({ disconnected: true });
});

export default app;
