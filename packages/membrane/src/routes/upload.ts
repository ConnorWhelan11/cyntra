import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { UploadRequestSchema, type UploadResponse, type ErrorResponse } from "../types/api.js";
import { getConfig, getIpfsGatewayUrl } from "../lib/config.js";
import { uploadDirectory, isConfigured as isIpfsConfigured } from "../lib/ipfs.js";

export const uploadRoutes = new Hono();

/**
 * POST /upload - Upload a directory to IPFS
 *
 * Request: { artifactsDir: string }
 * Response: { cid: string, gatewayUrl: string }
 */
uploadRoutes.post("/upload", zValidator("json", UploadRequestSchema), async (c) => {
  const { artifactsDir } = c.req.valid("json");
  const config = getConfig();

  // Check if IPFS is configured
  if (!isIpfsConfigured()) {
    const error: ErrorResponse = {
      error: "IPFS not configured",
      code: "IPFS_NOT_CONFIGURED",
      details: "Run 'membrane setup' to configure web3.storage credentials",
    };
    return c.json(error, 500);
  }

  try {
    // Upload directory to IPFS
    const cid = await uploadDirectory(artifactsDir);

    const response: UploadResponse = {
      cid,
      gatewayUrl: getIpfsGatewayUrl(cid, config),
    };

    return c.json(response);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      error: error instanceof Error ? error.message : "Upload failed",
      code: "UPLOAD_FAILED",
    };
    return c.json(errorResponse, 500);
  }
});
