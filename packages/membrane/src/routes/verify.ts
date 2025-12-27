import { Hono } from "hono";
import type { VerifyResponse, ErrorResponse } from "../types/api.js";
import { verifyAttestation, isConfigured as isEasConfigured } from "../lib/eas.js";

export const verifyRoutes = new Hono();

/**
 * GET /verify/:uid - Verify an EAS attestation
 *
 * Response: { valid: boolean, receipt?: object, attestedAt?: string, attester?: string, error?: string }
 */
verifyRoutes.get("/verify/:uid", async (c) => {
  const uid = c.req.param("uid");

  if (!uid || !/^0x[a-fA-F0-9]{64}$/.test(uid)) {
    const error: ErrorResponse = {
      error: "Invalid attestation UID format",
      code: "INVALID_UID",
      details: "UID must be a 0x-prefixed 64-character hex string",
    };
    return c.json(error, 400);
  }

  if (!isEasConfigured()) {
    const error: ErrorResponse = {
      error: "EAS not configured",
      code: "EAS_NOT_CONFIGURED",
    };
    return c.json(error, 500);
  }

  try {
    const result = await verifyAttestation(uid);

    if (!result.valid) {
      const response: VerifyResponse = {
        valid: false,
        error: result.error,
      };
      return c.json(response);
    }

    const response: VerifyResponse = {
      valid: true,
      receipt: result.receipt,
      attestedAt: result.attestedAt,
      attester: result.attester,
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      error: error instanceof Error ? error.message : "Verification failed",
      code: "VERIFICATION_FAILED",
    };
    return c.json(errorResponse, 500);
  }
});
