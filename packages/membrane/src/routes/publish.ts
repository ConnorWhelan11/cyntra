import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PublishRequestSchema, type PublishResponse, type ErrorResponse } from "../types/api.js";
import { getConfig, getIpfsGatewayUrl, getEasExplorerUrl } from "../lib/config.js";
import { uploadDirectory, isConfigured as isIpfsConfigured } from "../lib/ipfs.js";
import { createAttestation, isConfigured as isEasConfigured } from "../lib/eas.js";
import { RunReceiptSchema } from "../types/receipt.js";

export const publishRoutes = new Hono();

/**
 * POST /publish - Upload artifacts to IPFS and create EAS attestation
 *
 * This is the main endpoint that combines upload + attest.
 * Expects a run directory containing receipt.json.
 *
 * Request: { runDir: string }
 * Response: { cid: string, attestationUid: string, explorerUrl?: string, ipfsGatewayUrl?: string }
 */
publishRoutes.post("/publish", zValidator("json", PublishRequestSchema), async (c) => {
  const { runDir } = c.req.valid("json");
  const config = getConfig();

  // Validate directory exists
  if (!existsSync(runDir)) {
    const error: ErrorResponse = {
      error: `Run directory not found: ${runDir}`,
      code: "DIR_NOT_FOUND",
    };
    return c.json(error, 400);
  }

  // Load receipt.json
  const receiptPath = join(runDir, "receipt.json");
  if (!existsSync(receiptPath)) {
    const error: ErrorResponse = {
      error: `receipt.json not found in ${runDir}`,
      code: "RECEIPT_NOT_FOUND",
      details: "Generate receipt using cyntra membrane prepare <run_id>",
    };
    return c.json(error, 400);
  }

  let receipt;
  try {
    const receiptContent = await readFile(receiptPath, "utf-8");
    receipt = JSON.parse(receiptContent);
  } catch (e) {
    const error: ErrorResponse = {
      error: "Failed to parse receipt.json",
      code: "INVALID_RECEIPT_JSON",
      details: e instanceof Error ? e.message : undefined,
    };
    return c.json(error, 400);
  }

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

  // Check IPFS configuration
  if (!isIpfsConfigured()) {
    const error: ErrorResponse = {
      error: "IPFS not configured",
      code: "IPFS_NOT_CONFIGURED",
      details: "Run 'membrane setup' to configure web3.storage credentials",
    };
    return c.json(error, 500);
  }

  // Check EAS configuration
  if (!isEasConfigured()) {
    const error: ErrorResponse = {
      error: "EAS not configured",
      code: "EAS_NOT_CONFIGURED",
      details: "Set MEMBRANE_SCHEMA_UID and provide a signing key",
    };
    return c.json(error, 500);
  }

  try {
    // Step 1: Upload artifacts to IPFS
    const cid = await uploadDirectory(runDir);

    // Step 2: Create EAS attestation
    const { uid } = await createAttestation(receiptResult.data, cid);

    const response: PublishResponse = {
      cid,
      attestationUid: uid,
      explorerUrl: getEasExplorerUrl(uid, config),
      ipfsGatewayUrl: getIpfsGatewayUrl(cid, config),
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      error: error instanceof Error ? error.message : "Publish failed",
      code: "PUBLISH_FAILED",
    };
    return c.json(errorResponse, 500);
  }
});
