/**
 * Tableland Routes for Run Indices
 *
 * Provides API for querying and indexing runs on Tableland.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getDatabase,
  getSignerDatabase,
  createRunsTable,
  createFrontiersTable,
  createPatternsTable,
  insertRun,
  insertRunsBatch,
  queryRunsByWorld,
  queryRunByAttestation,
  updateFrontier,
  getLatestFrontier,
  insertPattern,
  queryPatternsByConfidence,
  getTableNames,
  setTableNames,
} from "../lib/tableland.js";

const app = new Hono();

// Schemas
const ChainSchema = z.enum(["base-sepolia", "base"]).default("base-sepolia");

const RunRecordSchema = z.object({
  runId: z.string(),
  worldId: z.string(),
  commitHash: z.string(),
  artifactsCid: z.string(),
  verdictHash: z.string(),
  attestationUid: z.string(),
  passed: z.boolean(),
  createdAt: z.number(),
  metrics: z.record(z.number()).optional(),
});

const FrontierRecordSchema = z.object({
  worldId: z.string(),
  generation: z.number(),
  paretoFront: z.string(),
  updatedAt: z.number(),
});

const PatternRecordSchema = z.object({
  patternId: z.string(),
  name: z.string(),
  supportingRuns: z.string(),
  confidence: z.number(),
  createdAt: z.number(),
});

const TableConfigSchema = z.object({
  runs: z.string().optional(),
  frontiers: z.string().optional(),
  patterns: z.string().optional(),
});

/**
 * GET /tableland/status
 *
 * Get current table configuration
 */
app.get("/status", (c) => {
  const tables = getTableNames();
  return c.json({
    configured: Boolean(tables.runs || tables.frontiers || tables.patterns),
    tables,
  });
});

/**
 * POST /tableland/config
 *
 * Set table names from existing tables
 */
app.post("/config", zValidator("json", TableConfigSchema), (c) => {
  const config = c.req.valid("json");
  setTableNames(config);
  return c.json({ success: true, tables: getTableNames() });
});

/**
 * POST /tableland/tables/create
 *
 * Create new tables (requires private key)
 */
app.post(
  "/tables/create",
  zValidator(
    "json",
    z.object({
      chain: ChainSchema,
      types: z.array(z.enum(["runs", "frontiers", "patterns"])),
    })
  ),
  async (c) => {
    const { chain, types } = c.req.valid("json");
    const privateKey = process.env.TABLELAND_PRIVATE_KEY;

    if (!privateKey) {
      return c.json({ error: "TABLELAND_PRIVATE_KEY not configured" }, 500);
    }

    try {
      const db = await getSignerDatabase(privateKey, chain);
      const created: Record<string, string> = {};

      if (types.includes("runs")) {
        created.runs = await createRunsTable(db, chain);
      }
      if (types.includes("frontiers")) {
        created.frontiers = await createFrontiersTable(db, chain);
      }
      if (types.includes("patterns")) {
        created.patterns = await createPatternsTable(db, chain);
      }

      setTableNames(created);
      return c.json({ success: true, tables: created });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to create tables" },
        500
      );
    }
  }
);

/**
 * POST /tableland/runs
 *
 * Index a new run
 */
app.post("/runs", zValidator("json", RunRecordSchema), async (c) => {
  const run = c.req.valid("json");
  const tables = getTableNames();
  const privateKey = process.env.TABLELAND_PRIVATE_KEY;

  if (!tables.runs) {
    return c.json({ error: "Runs table not configured" }, 400);
  }

  if (!privateKey) {
    return c.json({ error: "TABLELAND_PRIVATE_KEY not configured" }, 500);
  }

  try {
    const db = await getSignerDatabase(privateKey);
    await insertRun(db, tables.runs, run);
    return c.json({ success: true, runId: run.runId });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to index run" },
      500
    );
  }
});

/**
 * POST /tableland/runs/batch
 *
 * Index multiple runs
 */
app.post(
  "/runs/batch",
  zValidator("json", z.object({ runs: z.array(RunRecordSchema) })),
  async (c) => {
    const { runs } = c.req.valid("json");
    const tables = getTableNames();
    const privateKey = process.env.TABLELAND_PRIVATE_KEY;

    if (!tables.runs) {
      return c.json({ error: "Runs table not configured" }, 400);
    }

    if (!privateKey) {
      return c.json({ error: "TABLELAND_PRIVATE_KEY not configured" }, 500);
    }

    try {
      const db = await getSignerDatabase(privateKey);
      await insertRunsBatch(db, tables.runs, runs);
      return c.json({ success: true, count: runs.length });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to index runs" },
        500
      );
    }
  }
);

/**
 * GET /tableland/runs/world/:worldId
 *
 * Query runs by world
 */
app.get("/runs/world/:worldId", async (c) => {
  const worldId = c.req.param("worldId");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const passedOnly = c.req.query("passed") === "true";
  const tables = getTableNames();

  if (!tables.runs) {
    return c.json({ error: "Runs table not configured" }, 400);
  }

  try {
    const db = getDatabase();
    const runs = await queryRunsByWorld(db, tables.runs, worldId, limit, passedOnly);
    return c.json({ worldId, runs, count: runs.length });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      500
    );
  }
});

/**
 * GET /tableland/runs/attestation/:uid
 *
 * Query run by attestation UID
 */
app.get("/runs/attestation/:uid", async (c) => {
  const uid = c.req.param("uid");
  const tables = getTableNames();

  if (!tables.runs) {
    return c.json({ error: "Runs table not configured" }, 400);
  }

  try {
    const db = getDatabase();
    const run = await queryRunByAttestation(db, tables.runs, uid);

    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }

    return c.json(run);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      500
    );
  }
});

/**
 * POST /tableland/frontiers
 *
 * Update frontier for a world
 */
app.post("/frontiers", zValidator("json", FrontierRecordSchema), async (c) => {
  const frontier = c.req.valid("json");
  const tables = getTableNames();
  const privateKey = process.env.TABLELAND_PRIVATE_KEY;

  if (!tables.frontiers) {
    return c.json({ error: "Frontiers table not configured" }, 400);
  }

  if (!privateKey) {
    return c.json({ error: "TABLELAND_PRIVATE_KEY not configured" }, 500);
  }

  try {
    const db = await getSignerDatabase(privateKey);
    await updateFrontier(db, tables.frontiers, frontier);
    return c.json({ success: true, worldId: frontier.worldId, generation: frontier.generation });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to update frontier" },
      500
    );
  }
});

/**
 * GET /tableland/frontiers/:worldId
 *
 * Get latest frontier for a world
 */
app.get("/frontiers/:worldId", async (c) => {
  const worldId = c.req.param("worldId");
  const tables = getTableNames();

  if (!tables.frontiers) {
    return c.json({ error: "Frontiers table not configured" }, 400);
  }

  try {
    const db = getDatabase();
    const frontier = await getLatestFrontier(db, tables.frontiers, worldId);

    if (!frontier) {
      return c.json({ error: "Frontier not found" }, 404);
    }

    return c.json(frontier);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      500
    );
  }
});

/**
 * POST /tableland/patterns
 *
 * Add pattern evidence
 */
app.post("/patterns", zValidator("json", PatternRecordSchema), async (c) => {
  const pattern = c.req.valid("json");
  const tables = getTableNames();
  const privateKey = process.env.TABLELAND_PRIVATE_KEY;

  if (!tables.patterns) {
    return c.json({ error: "Patterns table not configured" }, 400);
  }

  if (!privateKey) {
    return c.json({ error: "TABLELAND_PRIVATE_KEY not configured" }, 500);
  }

  try {
    const db = await getSignerDatabase(privateKey);
    await insertPattern(db, tables.patterns, pattern);
    return c.json({ success: true, patternId: pattern.patternId });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to add pattern" },
      500
    );
  }
});

/**
 * GET /tableland/patterns
 *
 * Query high-confidence patterns
 */
app.get("/patterns", async (c) => {
  const minConfidence = parseFloat(c.req.query("minConfidence") || "0.7");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const tables = getTableNames();

  if (!tables.patterns) {
    return c.json({ error: "Patterns table not configured" }, 400);
  }

  try {
    const db = getDatabase();
    const patterns = await queryPatternsByConfidence(db, tables.patterns, minConfidence, limit);
    return c.json({ patterns, count: patterns.length });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      500
    );
  }
});

export default app;
