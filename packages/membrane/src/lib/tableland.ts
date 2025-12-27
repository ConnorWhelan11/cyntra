/**
 * Tableland Integration for Run Indices
 *
 * Provides decentralized SQL tables for querying:
 * - Run records (run_id, world_id, commit_hash, artifact_cid, verdict_hash)
 * - Frontier updates (world_id, generation, pareto_front)
 * - Pattern evidence (pattern_id, supporting_runs, confidence)
 *
 * Tables are stored on Tableland (Base Sepolia) and queryable via SQL.
 */

import { Database } from "@tableland/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

// Tableland chain configurations
const TABLELAND_CHAINS = {
  "base-sepolia": {
    chain: baseSepolia,
    tablePrefix: "fab_runs_84532",
  },
  base: {
    chain: base,
    tablePrefix: "fab_runs_8453",
  },
};

/**
 * Run record for indexing
 */
export interface RunRecord {
  runId: string;
  worldId: string;
  commitHash: string;
  artifactsCid: string;
  verdictHash: string;
  attestationUid: string;
  passed: boolean;
  createdAt: number;
  metrics?: Record<string, number>;
}

/**
 * Frontier record
 */
export interface FrontierRecord {
  worldId: string;
  generation: number;
  paretoFront: string; // JSON array of run IDs
  updatedAt: number;
}

/**
 * Pattern evidence record
 */
export interface PatternRecord {
  patternId: string;
  name: string;
  supportingRuns: string; // JSON array of run IDs
  confidence: number;
  createdAt: number;
}

/**
 * Table names (set after creation)
 */
let runsTableName: string | null = null;
let frontiersTableName: string | null = null;
let patternsTableName: string | null = null;

/**
 * Get or create a Tableland database instance
 */
export function getDatabase(
  chain: keyof typeof TABLELAND_CHAINS = "base-sepolia"
): Database {
  return new Database({ baseUrl: `https://${chain}.tableland.network` });
}

/**
 * Get a signer-enabled database for write operations
 */
export async function getSignerDatabase(
  privateKey: string,
  chain: keyof typeof TABLELAND_CHAINS = "base-sepolia"
): Promise<Database> {
  const config = TABLELAND_CHAINS[chain];
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(),
  });

  // @ts-expect-error - Tableland SDK types may not match exactly
  return new Database({ signer: walletClient });
}

/**
 * Create the runs table
 */
export async function createRunsTable(
  db: Database,
  chain: keyof typeof TABLELAND_CHAINS = "base-sepolia"
): Promise<string> {
  const prefix = TABLELAND_CHAINS[chain].tablePrefix;

  const { meta } = await db.prepare(`
    CREATE TABLE ${prefix}_runs (
      id INTEGER PRIMARY KEY,
      run_id TEXT UNIQUE NOT NULL,
      world_id TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      artifacts_cid TEXT NOT NULL,
      verdict_hash TEXT NOT NULL,
      attestation_uid TEXT NOT NULL,
      passed INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      metrics TEXT
    )
  `).run();

  const tableName = meta.txn?.name;
  if (!tableName) throw new Error("Failed to get table name");

  runsTableName = tableName;
  return tableName;
}

/**
 * Create the frontiers table
 */
export async function createFrontiersTable(
  db: Database,
  chain: keyof typeof TABLELAND_CHAINS = "base-sepolia"
): Promise<string> {
  const prefix = TABLELAND_CHAINS[chain].tablePrefix;

  const { meta } = await db.prepare(`
    CREATE TABLE ${prefix}_frontiers (
      id INTEGER PRIMARY KEY,
      world_id TEXT NOT NULL,
      generation INTEGER NOT NULL,
      pareto_front TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(world_id, generation)
    )
  `).run();

  const tableName = meta.txn?.name;
  if (!tableName) throw new Error("Failed to get table name");

  frontiersTableName = tableName;
  return tableName;
}

/**
 * Create the patterns table
 */
export async function createPatternsTable(
  db: Database,
  chain: keyof typeof TABLELAND_CHAINS = "base-sepolia"
): Promise<string> {
  const prefix = TABLELAND_CHAINS[chain].tablePrefix;

  const { meta } = await db.prepare(`
    CREATE TABLE ${prefix}_patterns (
      id INTEGER PRIMARY KEY,
      pattern_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      supporting_runs TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();

  const tableName = meta.txn?.name;
  if (!tableName) throw new Error("Failed to get table name");

  patternsTableName = tableName;
  return tableName;
}

/**
 * Insert a run record
 */
export async function insertRun(
  db: Database,
  tableName: string,
  run: RunRecord
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${tableName} (
      run_id, world_id, commit_hash, artifacts_cid, verdict_hash,
      attestation_uid, passed, created_at, metrics
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    run.runId,
    run.worldId,
    run.commitHash,
    run.artifactsCid,
    run.verdictHash,
    run.attestationUid,
    run.passed ? 1 : 0,
    run.createdAt,
    run.metrics ? JSON.stringify(run.metrics) : null
  ).run();
}

/**
 * Insert multiple runs in a batch
 */
export async function insertRunsBatch(
  db: Database,
  tableName: string,
  runs: RunRecord[]
): Promise<void> {
  const statements = runs.map((run) =>
    db.prepare(`
      INSERT INTO ${tableName} (
        run_id, world_id, commit_hash, artifacts_cid, verdict_hash,
        attestation_uid, passed, created_at, metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      run.runId,
      run.worldId,
      run.commitHash,
      run.artifactsCid,
      run.verdictHash,
      run.attestationUid,
      run.passed ? 1 : 0,
      run.createdAt,
      run.metrics ? JSON.stringify(run.metrics) : null
    )
  );

  await db.batch(statements);
}

/**
 * Query runs by world ID
 */
export async function queryRunsByWorld(
  db: Database,
  tableName: string,
  worldId: string,
  limit: number = 50,
  passedOnly: boolean = false
): Promise<RunRecord[]> {
  let query = `SELECT * FROM ${tableName} WHERE world_id = ?`;
  if (passedOnly) {
    query += " AND passed = 1";
  }
  query += " ORDER BY created_at DESC LIMIT ?";

  const { results } = await db.prepare(query).bind(worldId, limit).all();

  return (results as Array<Record<string, unknown>>).map((row) => ({
    runId: row.run_id as string,
    worldId: row.world_id as string,
    commitHash: row.commit_hash as string,
    artifactsCid: row.artifacts_cid as string,
    verdictHash: row.verdict_hash as string,
    attestationUid: row.attestation_uid as string,
    passed: Boolean(row.passed),
    createdAt: row.created_at as number,
    metrics: row.metrics ? JSON.parse(row.metrics as string) : undefined,
  }));
}

/**
 * Query runs by attestation UID
 */
export async function queryRunByAttestation(
  db: Database,
  tableName: string,
  attestationUid: string
): Promise<RunRecord | null> {
  const { results } = await db
    .prepare(`SELECT * FROM ${tableName} WHERE attestation_uid = ?`)
    .bind(attestationUid)
    .all();

  if (results.length === 0) return null;

  const row = results[0] as Record<string, unknown>;
  return {
    runId: row.run_id as string,
    worldId: row.world_id as string,
    commitHash: row.commit_hash as string,
    artifactsCid: row.artifacts_cid as string,
    verdictHash: row.verdict_hash as string,
    attestationUid: row.attestation_uid as string,
    passed: Boolean(row.passed),
    createdAt: row.created_at as number,
    metrics: row.metrics ? JSON.parse(row.metrics as string) : undefined,
  };
}

/**
 * Update frontier for a world
 */
export async function updateFrontier(
  db: Database,
  tableName: string,
  frontier: FrontierRecord
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${tableName} (world_id, generation, pareto_front, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(world_id, generation) DO UPDATE SET
      pareto_front = excluded.pareto_front,
      updated_at = excluded.updated_at
  `).bind(
    frontier.worldId,
    frontier.generation,
    frontier.paretoFront,
    frontier.updatedAt
  ).run();
}

/**
 * Get latest frontier for a world
 */
export async function getLatestFrontier(
  db: Database,
  tableName: string,
  worldId: string
): Promise<FrontierRecord | null> {
  const { results } = await db
    .prepare(
      `SELECT * FROM ${tableName} WHERE world_id = ? ORDER BY generation DESC LIMIT 1`
    )
    .bind(worldId)
    .all();

  if (results.length === 0) return null;

  const row = results[0] as Record<string, unknown>;
  return {
    worldId: row.world_id as string,
    generation: row.generation as number,
    paretoFront: row.pareto_front as string,
    updatedAt: row.updated_at as number,
  };
}

/**
 * Insert pattern evidence
 */
export async function insertPattern(
  db: Database,
  tableName: string,
  pattern: PatternRecord
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${tableName} (pattern_id, name, supporting_runs, confidence, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(pattern_id) DO UPDATE SET
      supporting_runs = excluded.supporting_runs,
      confidence = excluded.confidence
  `).bind(
    pattern.patternId,
    pattern.name,
    pattern.supportingRuns,
    pattern.confidence,
    pattern.createdAt
  ).run();
}

/**
 * Query patterns by confidence threshold
 */
export async function queryPatternsByConfidence(
  db: Database,
  tableName: string,
  minConfidence: number = 0.7,
  limit: number = 20
): Promise<PatternRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM ${tableName} WHERE confidence >= ? ORDER BY confidence DESC LIMIT ?`
    )
    .bind(minConfidence, limit)
    .all();

  return (results as Array<Record<string, unknown>>).map((row) => ({
    patternId: row.pattern_id as string,
    name: row.name as string,
    supportingRuns: row.supporting_runs as string,
    confidence: row.confidence as number,
    createdAt: row.created_at as number,
  }));
}

/**
 * Get table names for configuration storage
 */
export function getTableNames(): {
  runs: string | null;
  frontiers: string | null;
  patterns: string | null;
} {
  return {
    runs: runsTableName,
    frontiers: frontiersTableName,
    patterns: patternsTableName,
  };
}

/**
 * Set table names from configuration
 */
export function setTableNames(names: {
  runs?: string;
  frontiers?: string;
  patterns?: string;
}): void {
  if (names.runs) runsTableName = names.runs;
  if (names.frontiers) frontiersTableName = names.frontiers;
  if (names.patterns) patternsTableName = names.patterns;
}
