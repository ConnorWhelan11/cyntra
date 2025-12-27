import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { AttestRequestSchema, type AttestResponse, type ErrorResponse } from "../types/api.js";
import { getConfig, getEasExplorerUrl } from "../lib/config.js";
import { createAttestation, isConfigured as isEasConfigured } from "../lib/eas.js";
import { RunReceiptSchema } from "../types/receipt.js";

export const attestRoutes = new Hono();

/**
 * POST /attest - Create an EAS attestation for a receipt
 *
 * Request: { receipt: RunReceiptInput, cid: string }
 * Response: { attestationUid: string, signature: string, explorerUrl?: string }
 */
attestRoutes.post("/attest", zValidator("json", AttestRequestSchema), async (c) => {
  const { receipt, cid } = c.req.valid("json");
  const config = getConfig();

  // Validate receipt structure
  const receiptResult = RunReceiptSchema.omit({ attestation: true }).safeParse(receipt);
  if (!receiptResult.success) {
    const error: ErrorResponse = {
      error: "Invalid receipt format",
      code: "INVALID_RECEIPT",
      details: receiptResult.error.issues,
    };
    return c.json(error, 400);
  }

  // Check if EAS is configured
  if (!isEasConfigured()) {
    const error: ErrorResponse = {
      error: "EAS not configured",
      code: "EAS_NOT_CONFIGURED",
      details: "Set MEMBRANE_SCHEMA_UID and provide a signing key",
    };
    return c.json(error, 500);
  }

  try {
    const { uid, signature } = await createAttestation(receiptResult.data, cid);

    const response: AttestResponse = {
      attestationUid: uid,
      signature,
      explorerUrl: getEasExplorerUrl(uid, config),
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      error: error instanceof Error ? error.message : "Attestation failed",
      code: "ATTESTATION_FAILED",
    };
    return c.json(errorResponse, 500);
  }
});
