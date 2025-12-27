/**
 * Membrane HTTP Server
 *
 * Hono-based HTTP server that handles Web3 interactions:
 * - IPFS uploads via web3.storage
 * - EAS attestations
 * - SIWE authentication
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";

import { baseRoutes } from "./routes/index.js";
import { uploadRoutes } from "./routes/upload.js";
import { attestRoutes } from "./routes/attest.js";
import { publishRoutes } from "./routes/publish.js";
import { verifyRoutes } from "./routes/verify.js";
import { authRoutes } from "./routes/auth.js";
import crosschainRoutes from "./routes/crosschain.js";
import identityRoutes from "./routes/identity.js";
import controllerRoutes from "./routes/controller.js";
import starknetRoutes from "./routes/starknet.js";
import tablelandRoutes from "./routes/tableland.js";
import ensRoutes from "./routes/ens.js";
import litRoutes from "./routes/lit.js";
import bacalhauRoutes from "./routes/bacalhau.js";
import { getConfig, validateProductionConfig, VERSION } from "./lib/config.js";
import { initDatabase, cleanupExpiredRecords, getDatabaseStats, closeDatabase } from "./lib/database.js";
import { rateLimit } from "./middleware/rateLimit.js";

/**
 * Create and configure the Hono app
 */
export function createApp() {
  const config = getConfig();
  const app = new Hono();

  // Middleware
  if (config.verbose) {
    app.use("*", logger());
  }
  app.use("*", prettyJSON());
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: config.cors.origins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: config.cors.credentials,
    })
  );

  // Rate limiting - skip for health checks
  const skipHealthCheck = (c: { req: { path: string } }) =>
    c.req.path === "/" || c.req.path === "/db/stats";

  // Create rate limiters from config
  const generalRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: config.rateLimit.general,
    keyPrefix: "rl:general:",
  });

  const authRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: config.rateLimit.auth,
    keyPrefix: "rl:auth:",
    message: "Too many authentication attempts, please try again later",
  });

  const nonceRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: config.rateLimit.nonce,
    keyPrefix: "rl:nonce:",
    message: "Too many nonce requests, please try again later",
  });

  const executeRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: config.rateLimit.execute,
    keyPrefix: "rl:execute:",
    message: "Too many transaction requests, please try again later",
  });

  const uploadRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: config.rateLimit.upload,
    keyPrefix: "rl:upload:",
    message: "Too many upload requests, please try again later",
  });

  // Apply general rate limit to all routes
  app.use("*", (c, next) => {
    if (skipHealthCheck(c)) return next();
    return generalRateLimit(c, next);
  });

  // Stricter limits for sensitive endpoints
  app.use("/auth/*", authRateLimit);
  app.use("/identity/nonce", nonceRateLimit);
  app.use("/identity/verify-siwe", authRateLimit);
  app.use("/starknet/nonce", nonceRateLimit);
  app.use("/starknet/verify", authRateLimit);
  app.use("/controller/connect", nonceRateLimit);
  app.use("/controller/execute", executeRateLimit);
  app.use("/upload", uploadRateLimit);
  app.use("/publish", uploadRateLimit);

  // Mount routes
  app.route("/", baseRoutes);
  app.route("/", uploadRoutes);
  app.route("/", attestRoutes);
  app.route("/", publishRoutes);
  app.route("/", verifyRoutes);
  app.route("/", authRoutes);
  app.route("/crosschain", crosschainRoutes);
  app.route("/identity", identityRoutes);
  app.route("/controller", controllerRoutes);
  app.route("/starknet", starknetRoutes);
  app.route("/tableland", tablelandRoutes);
  app.route("/ens", ensRoutes);
  app.route("/lit", litRoutes);
  app.route("/bacalhau", bacalhauRoutes);

  // Database stats endpoint
  app.get("/db/stats", (c) => {
    const stats = getDatabaseStats();
    return c.json(stats);
  });

  // Database cleanup endpoint (for manual triggering)
  app.post("/db/cleanup", (c) => {
    const cleaned = cleanupExpiredRecords();
    return c.json({ cleaned });
  });

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: "Not Found",
        code: "NOT_FOUND",
        path: c.req.path,
      },
      404
    );
  });

  // Error handler
  app.onError((err, c) => {
    console.error("Unhandled error:", err);
    return c.json(
      {
        error: err.message || "Internal Server Error",
        code: "INTERNAL_ERROR",
      },
      500
    );
  });

  return app;
}

/**
 * Start the server
 */
export async function startServer(port?: number) {
  const config = getConfig();
  const serverPort = port ?? config.port;

  // Validate production config
  const configErrors = validateProductionConfig(config);
  if (configErrors.length > 0) {
    console.warn("\n  Configuration warnings:");
    configErrors.forEach((err) => console.warn(`    - ${err}`));
  }

  // Initialize database
  initDatabase();
  console.log("  Database initialized");

  // Set up periodic cleanup (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const cleaned = cleanupExpiredRecords();
    if (cleaned.sessions > 0 || cleaned.nonces > 0 || cleaned.pending > 0) {
      console.log(`  Cleanup: ${cleaned.sessions} sessions, ${cleaned.nonces} nonces, ${cleaned.pending} pending`);
    }
  }, 5 * 60 * 1000);

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\n  Shutting down...");
    clearInterval(cleanupInterval);
    closeDatabase();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(cleanupInterval);
    closeDatabase();
    process.exit(0);
  });

  const app = createApp();

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███╗   ███╗███████╗███╗   ███╗██████╗ ██████╗           ║
║   ████╗ ████║██╔════╝████╗ ████║██╔══██╗██╔══██╗          ║
║   ██╔████╔██║█████╗  ██╔████╔██║██████╔╝██████╔╝          ║
║   ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══██╗██╔══██╗          ║
║   ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║██████╔╝██║  ██║          ║
║   ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝          ║
║                                                           ║
║   Web3 Integration Layer for Cyntra                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

  Version:     ${VERSION}
  Environment: ${config.env}
  Port:        ${serverPort}
  Chain:       ${config.chain} (${config.chainConfig.chainId})
  Starknet:    ${config.starknet.defaultChainId}
  CORS:        ${config.cors.origins.length} origins
  Rate Limits: ${config.rateLimit.general}/min (general), ${config.rateLimit.auth}/min (auth)

  Endpoints:
    GET  /              Health check
    POST /publish       Upload + Attest
    POST /upload        IPFS upload
    POST /attest        EAS attestation
    GET  /verify/:uid   Verify attestation
    POST /auth/nonce    SIWE nonce
    POST /auth/verify   SIWE verify

  Cross-Chain (Phase 3):
    POST /crosschain/proof/request    Request Herodotus proof
    GET  /crosschain/proof/status/:id Get proof status
    POST /crosschain/verify           Full verification flow

  Identity:
    POST /identity/nonce              Generate SIWE nonce
    POST /identity/verify-siwe        Verify SIWE signature
    POST /identity/link               Link Starknet + EVM identity
    GET  /identity/lookup/:addr       Look up linked identities

  Cartridge Controller:
    POST /controller/connect          Initiate wallet connection
    GET  /controller/callback         OAuth callback handler
    GET  /controller/session/:id      Get session status
    POST /controller/execute          Execute transaction
    GET  /controller/transaction/:id  Get transaction status
    GET  /controller/session/:id/transactions  Transaction history
    POST /controller/disconnect       End session
    GET  /controller/policies/default Default game policies

  Starknet:
    POST /starknet/nonce              Generate signing nonce
    POST /starknet/verify             Verify Starknet signature
    GET  /starknet/status             Check chain availability

  Tableland (Phase 2):
    GET  /tableland/status            Get table configuration
    POST /tableland/config            Set table names
    POST /tableland/runs              Index a new run
    GET  /tableland/runs/world/:id    Query runs by world
    POST /tableland/frontiers         Update world frontier
    GET  /tableland/patterns          Query patterns

  ENS (Phase 3):
    GET  /ens/resolve/:name           Resolve ENS name
    GET  /ens/universe/:name          Fetch universe metadata
    GET  /ens/address/:name           Resolve to address
    GET  /ens/records/:name           Get text records
    POST /ens/parse                   Parse universe name

  Lit Protocol (Phase 3):
    GET  /lit/status                  Check Lit connection
    POST /lit/encrypt                 Encrypt with access control
    POST /lit/decrypt                 Decrypt data
    POST /lit/check-access            Check access conditions
    POST /lit/conditions/build        Build conditions preview

  Bacalhau (Phase 3):
    GET  /bacalhau/status             Check Bacalhau status
    POST /bacalhau/jobs/gate          Submit gate job
    POST /bacalhau/jobs/render        Submit render job
    POST /bacalhau/jobs/critic        Submit critic job
    POST /bacalhau/pipeline           Run full gate pipeline
    GET  /bacalhau/jobs/:id           Get job status
`);

  // Start server
  const server = Bun.serve({
    port: serverPort,
    fetch: app.fetch,
  });

  console.log(`  Listening on http://localhost:${serverPort}\n`);

  return server;
}

export { VERSION };
