import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { generateNonce, SiweMessage } from "siwe";
import {
  AuthNonceRequestSchema,
  AuthVerifyRequestSchema,
  type AuthNonceResponse,
  type AuthVerifyResponse,
  type ErrorResponse,
} from "../types/api.js";
import { getConfig } from "../lib/config.js";

export const authRoutes = new Hono();

// In-memory nonce store (use Redis in production)
const nonceStore = new Map<string, { nonce: string; createdAt: number }>();

// Clean up expired nonces (older than 5 minutes)
const NONCE_TTL_MS = 5 * 60 * 1000;

function cleanupNonces() {
  const now = Date.now();
  for (const [address, data] of nonceStore) {
    if (now - data.createdAt > NONCE_TTL_MS) {
      nonceStore.delete(address);
    }
  }
}

/**
 * POST /auth/nonce - Generate a nonce for SIWE authentication
 *
 * Request: { address: string }
 * Response: { nonce: string }
 */
authRoutes.post("/auth/nonce", zValidator("json", AuthNonceRequestSchema), async (c) => {
  cleanupNonces();

  const { address } = c.req.valid("json");
  const nonce = generateNonce();

  nonceStore.set(address.toLowerCase(), {
    nonce,
    createdAt: Date.now(),
  });

  const response: AuthNonceResponse = { nonce };
  return c.json(response);
});

/**
 * POST /auth/verify - Verify a SIWE signature
 *
 * Request: { message: string, signature: string }
 * Response: { session: { address: string, chainId: number, expiresAt: string } }
 */
authRoutes.post("/auth/verify", zValidator("json", AuthVerifyRequestSchema), async (c) => {
  cleanupNonces();

  const { message, signature } = c.req.valid("json");
  const config = getConfig();

  try {
    const siweMessage = new SiweMessage(message);

    // Verify the stored nonce matches
    const storedData = nonceStore.get(siweMessage.address.toLowerCase());
    if (!storedData) {
      const error: ErrorResponse = {
        error: "No nonce found for address",
        code: "NONCE_NOT_FOUND",
        details: "Request a new nonce first",
      };
      return c.json(error, 400);
    }

    if (storedData.nonce !== siweMessage.nonce) {
      const error: ErrorResponse = {
        error: "Invalid nonce",
        code: "INVALID_NONCE",
      };
      return c.json(error, 400);
    }

    // Verify the signature
    const { success, error, data } = await siweMessage.verify({
      signature,
      nonce: storedData.nonce,
    });

    if (!success || !data) {
      const errorResponse: ErrorResponse = {
        error: error?.type || "Signature verification failed",
        code: "INVALID_SIGNATURE",
      };
      return c.json(errorResponse, 400);
    }

    // Clear the used nonce
    nonceStore.delete(siweMessage.address.toLowerCase());

    // Create session (in production, use iron-session or similar)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const response: AuthVerifyResponse = {
      session: {
        address: data.address,
        chainId: data.chainId || config.chainConfig.chainId,
        expiresAt,
      },
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      error: error instanceof Error ? error.message : "SIWE verification failed",
      code: "SIWE_ERROR",
    };
    return c.json(errorResponse, 400);
  }
});
