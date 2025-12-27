import { Hono } from "hono";
import { getConfig, VERSION } from "../lib/config.js";
import type { HealthResponse } from "../types/api.js";

const startTime = Date.now();

/**
 * Base routes including health check
 */
export const baseRoutes = new Hono();

/**
 * GET / - Health check endpoint
 */
baseRoutes.get("/", (c) => {
  const config = getConfig();
  const response: HealthResponse = {
    status: "ok",
    version: VERSION,
    chain: config.chain,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
  return c.json(response);
});

/**
 * GET /health - Alternative health check
 */
baseRoutes.get("/health", (c) => {
  return c.json({ status: "ok" });
});

/**
 * GET /config - Return current configuration (non-sensitive)
 */
baseRoutes.get("/config", (c) => {
  const config = getConfig();
  return c.json({
    chain: config.chain,
    chainId: config.chainConfig.chainId,
    easExplorer: config.chainConfig.explorerUrl,
    ipfsGateway: config.ipfsGatewayUrl,
    schemaConfigured: !!config.schemaUid,
    w3upConfigured: !!config.w3upSpaceDid,
  });
});
