/**
 * SQLite Database for Membrane Service
 *
 * Provides persistent storage for sessions, nonces, and linked identities.
 * Uses Bun's built-in SQLite for fast, embedded storage.
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync } from "node:fs";

// Types for stored data
export interface StoredSession {
  id: string;
  address: string;
  chainId: string;
  policies: string; // JSON stringified
  createdAt: number;
  expiresAt: number;
}

export interface StoredPendingConnection {
  id: string;
  policies: string; // JSON stringified
  redirectUrl: string;
  createdAt: number;
}

export interface StoredNonce {
  address: string;
  nonce: string;
  type: "siwe" | "starknet";
  createdAt: number;
  expiresAt: number;
}

export interface StoredLinkedIdentity {
  id: string;
  starknetAddress: string;
  evmAddress: string;
  linkedAt: number;
  signature: string;
}

/**
 * Get database path from config or default
 */
function getDatabasePath(): string {
  const customPath = process.env.MEMBRANE_DB_PATH;
  if (customPath) return customPath;

  const configDir = join(homedir(), ".config", "membrane");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  return join(configDir, "membrane.db");
}

/**
 * Database singleton
 */
let db: Database | null = null;

/**
 * Initialize database with schema
 */
export function initDatabase(): Database {
  if (db) return db;

  const dbPath = getDatabasePath();
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      chain_id TEXT NOT NULL,
      policies TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pending_connections (
      id TEXT PRIMARY KEY,
      policies TEXT NOT NULL,
      redirect_url TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nonces (
      address TEXT NOT NULL,
      nonce TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (address, type)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS linked_identities (
      id TEXT PRIMARY KEY,
      starknet_address TEXT NOT NULL,
      evm_address TEXT NOT NULL,
      linked_at INTEGER NOT NULL,
      signature TEXT NOT NULL
    )
  `);

  // Create indexes for common queries
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_address ON sessions(address)");
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_nonces_expires ON nonces(expires_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_linked_starknet ON linked_identities(starknet_address)");
  db.run("CREATE INDEX IF NOT EXISTS idx_linked_evm ON linked_identities(evm_address)");

  return db;
}

/**
 * Get database instance (initializes if needed)
 */
export function getDatabase(): Database {
  return db || initDatabase();
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================================
// Session Operations
// ============================================================================

export function saveSession(session: StoredSession): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (id, address, chain_id, policies, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    session.id,
    session.address,
    session.chainId,
    session.policies,
    session.createdAt,
    session.expiresAt
  );
}

export function getSession(id: string): StoredSession | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, address, chain_id as chainId, policies, created_at as createdAt, expires_at as expiresAt
    FROM sessions WHERE id = ?
  `);
  return stmt.get(id) as StoredSession | null;
}

export function deleteSession(id: string): void {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM sessions WHERE id = ?");
  stmt.run(id);
}

export function deleteExpiredSessions(): number {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM sessions WHERE expires_at < ?");
  const result = stmt.run(Date.now());
  return result.changes;
}

// ============================================================================
// Pending Connection Operations
// ============================================================================

export function savePendingConnection(conn: StoredPendingConnection): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO pending_connections (id, policies, redirect_url, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(conn.id, conn.policies, conn.redirectUrl, conn.createdAt);
}

export function getPendingConnection(id: string): StoredPendingConnection | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, policies, redirect_url as redirectUrl, created_at as createdAt
    FROM pending_connections WHERE id = ?
  `);
  return stmt.get(id) as StoredPendingConnection | null;
}

export function deletePendingConnection(id: string): void {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM pending_connections WHERE id = ?");
  stmt.run(id);
}

export function deleteOldPendingConnections(maxAgeMs: number = 10 * 60 * 1000): number {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM pending_connections WHERE created_at < ?");
  const result = stmt.run(Date.now() - maxAgeMs);
  return result.changes;
}

// ============================================================================
// Nonce Operations
// ============================================================================

export function saveNonce(nonce: StoredNonce): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO nonces (address, nonce, type, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    nonce.address.toLowerCase(),
    nonce.nonce,
    nonce.type,
    nonce.createdAt,
    nonce.expiresAt
  );
}

export function getNonce(address: string, type: "siwe" | "starknet"): StoredNonce | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT address, nonce, type, created_at as createdAt, expires_at as expiresAt
    FROM nonces WHERE address = ? AND type = ?
  `);
  return stmt.get(address.toLowerCase(), type) as StoredNonce | null;
}

export function deleteNonce(address: string, type: "siwe" | "starknet"): void {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM nonces WHERE address = ? AND type = ?");
  stmt.run(address.toLowerCase(), type);
}

export function deleteExpiredNonces(): number {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM nonces WHERE expires_at < ?");
  const result = stmt.run(Date.now());
  return result.changes;
}

// ============================================================================
// Linked Identity Operations
// ============================================================================

export function saveLinkedIdentity(identity: StoredLinkedIdentity): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO linked_identities (id, starknet_address, evm_address, linked_at, signature)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    identity.id,
    identity.starknetAddress.toLowerCase(),
    identity.evmAddress.toLowerCase(),
    identity.linkedAt,
    identity.signature
  );
}

export function getLinkedIdentityById(id: string): StoredLinkedIdentity | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, starknet_address as starknetAddress, evm_address as evmAddress,
           linked_at as linkedAt, signature
    FROM linked_identities WHERE id = ?
  `);
  return stmt.get(id) as StoredLinkedIdentity | null;
}

export function getLinkedIdentitiesByAddress(address: string): StoredLinkedIdentity[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, starknet_address as starknetAddress, evm_address as evmAddress,
           linked_at as linkedAt, signature
    FROM linked_identities
    WHERE starknet_address = ? OR evm_address = ?
  `);
  const addr = address.toLowerCase();
  return stmt.all(addr, addr) as StoredLinkedIdentity[];
}

export function getLinkedIdentityByStarknet(starknetAddress: string): StoredLinkedIdentity | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, starknet_address as starknetAddress, evm_address as evmAddress,
           linked_at as linkedAt, signature
    FROM linked_identities WHERE starknet_address = ?
  `);
  return stmt.get(starknetAddress.toLowerCase()) as StoredLinkedIdentity | null;
}

export function deleteLinkedIdentity(id: string): void {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM linked_identities WHERE id = ?");
  stmt.run(id);
}

// ============================================================================
// Maintenance
// ============================================================================

/**
 * Clean up all expired records
 */
export function cleanupExpiredRecords(): { sessions: number; nonces: number; pending: number } {
  return {
    sessions: deleteExpiredSessions(),
    nonces: deleteExpiredNonces(),
    pending: deleteOldPendingConnections(),
  };
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
  sessions: number;
  pendingConnections: number;
  nonces: number;
  linkedIdentities: number;
  transactions?: number;
} {
  const db = getDatabase();

  const sessions = db.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number };
  const pending = db.prepare("SELECT COUNT(*) as count FROM pending_connections").get() as { count: number };
  const nonces = db.prepare("SELECT COUNT(*) as count FROM nonces").get() as { count: number };
  const linked = db.prepare("SELECT COUNT(*) as count FROM linked_identities").get() as { count: number };

  // Check if transactions table exists (created lazily by transactions module)
  let transactions = 0;
  try {
    const txResult = db.prepare("SELECT COUNT(*) as count FROM transactions").get() as { count: number };
    transactions = txResult.count;
  } catch {
    // Table doesn't exist yet
  }

  return {
    sessions: sessions.count,
    pendingConnections: pending.count,
    nonces: nonces.count,
    linkedIdentities: linked.count,
    transactions,
  };
}
