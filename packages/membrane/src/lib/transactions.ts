/**
 * Transaction Tracking
 *
 * Tracks transaction status for the controller bridge.
 *
 * Note: Real transaction execution requires the Cartridge Controller SDK
 * running in a browser/webview context, or Cartridge's server-side infrastructure.
 *
 * This module provides:
 * - Transaction status tracking
 * - Transaction history per session
 * - Mock transaction simulation for development
 */

import { getDatabase } from "./database.js";

export type TransactionStatus =
  | "pending"
  | "submitted"
  | "accepted_on_l2"
  | "accepted_on_l1"
  | "rejected"
  | "failed";

export interface Transaction {
  id: string;
  sessionId: string;
  transactionHash: string | null;
  status: TransactionStatus;
  calls: TransactionCall[];
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface TransactionCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

// Initialize transaction table
let tableInitialized = false;

function ensureTable() {
  if (tableInitialized) return;

  const db = getDatabase();
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      transaction_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      calls TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      error TEXT
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_tx_session ON transactions(session_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tx_hash ON transactions(transaction_hash)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status)");
  tableInitialized = true;
}

/**
 * Create a new transaction record
 */
export function createTransaction(
  sessionId: string,
  calls: TransactionCall[]
): Transaction {
  ensureTable();
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = Date.now();

  const tx: Transaction = {
    id,
    sessionId,
    transactionHash: null,
    status: "pending",
    calls,
    createdAt: now,
    updatedAt: now,
  };

  const stmt = db.prepare(`
    INSERT INTO transactions (id, session_id, transaction_hash, status, calls, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, sessionId, null, "pending", JSON.stringify(calls), now, now);

  return tx;
}

/**
 * Get transaction by ID
 */
export function getTransaction(id: string): Transaction | null {
  ensureTable();
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, session_id as sessionId, transaction_hash as transactionHash,
           status, calls, created_at as createdAt, updated_at as updatedAt, error
    FROM transactions WHERE id = ?
  `);
  const row = stmt.get(id) as {
    id: string;
    sessionId: string;
    transactionHash: string | null;
    status: TransactionStatus;
    calls: string;
    createdAt: number;
    updatedAt: number;
    error?: string;
  } | null;

  if (!row) return null;

  return {
    ...row,
    calls: JSON.parse(row.calls),
  };
}

/**
 * Get transaction by hash
 */
export function getTransactionByHash(hash: string): Transaction | null {
  ensureTable();
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, session_id as sessionId, transaction_hash as transactionHash,
           status, calls, created_at as createdAt, updated_at as updatedAt, error
    FROM transactions WHERE transaction_hash = ?
  `);
  const row = stmt.get(hash) as {
    id: string;
    sessionId: string;
    transactionHash: string | null;
    status: TransactionStatus;
    calls: string;
    createdAt: number;
    updatedAt: number;
    error?: string;
  } | null;

  if (!row) return null;

  return {
    ...row,
    calls: JSON.parse(row.calls),
  };
}

/**
 * Get transactions for a session
 */
export function getSessionTransactions(
  sessionId: string,
  limit: number = 50
): Transaction[] {
  ensureTable();
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, session_id as sessionId, transaction_hash as transactionHash,
           status, calls, created_at as createdAt, updated_at as updatedAt, error
    FROM transactions WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(sessionId, limit) as Array<{
    id: string;
    sessionId: string;
    transactionHash: string | null;
    status: TransactionStatus;
    calls: string;
    createdAt: number;
    updatedAt: number;
    error?: string;
  }>;

  return rows.map((row) => ({
    ...row,
    calls: JSON.parse(row.calls),
  }));
}

/**
 * Update transaction status
 */
export function updateTransactionStatus(
  id: string,
  status: TransactionStatus,
  transactionHash?: string,
  error?: string
): boolean {
  ensureTable();
  const db = getDatabase();
  const now = Date.now();

  let sql = "UPDATE transactions SET status = ?, updated_at = ?";
  const params: (string | number)[] = [status, now];

  if (transactionHash) {
    sql += ", transaction_hash = ?";
    params.push(transactionHash);
  }

  if (error) {
    sql += ", error = ?";
    params.push(error);
  }

  sql += " WHERE id = ?";
  params.push(id);

  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return result.changes > 0;
}

/**
 * Simulate transaction execution (for development)
 *
 * In production, this would:
 * 1. Use Controller SDK to sign and submit the transaction
 * 2. Or redirect to keychain for user approval
 * 3. Or use Cartridge's server-side infrastructure
 */
export async function simulateTransactionExecution(
  tx: Transaction
): Promise<{ transactionHash: string; status: TransactionStatus }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Generate a mock transaction hash
  const hash = `0x${crypto.randomUUID().replace(/-/g, "")}`;

  // Simulate ~90% success rate
  const success = Math.random() > 0.1;

  if (success) {
    updateTransactionStatus(tx.id, "submitted", hash);

    // Simulate L2 acceptance after a delay
    setTimeout(() => {
      updateTransactionStatus(tx.id, "accepted_on_l2");
    }, 2000);

    return { transactionHash: hash, status: "submitted" };
  } else {
    updateTransactionStatus(tx.id, "rejected", undefined, "Simulated rejection");
    return { transactionHash: hash, status: "rejected" };
  }
}

/**
 * Get pending transactions count
 */
export function getPendingTransactionsCount(): number {
  ensureTable();
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE status IN ('pending', 'submitted')"
  );
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Clean up old transactions (older than 7 days)
 */
export function cleanupOldTransactions(): number {
  ensureTable();
  const db = getDatabase();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stmt = db.prepare("DELETE FROM transactions WHERE created_at < ?");
  const result = stmt.run(cutoff);
  return result.changes;
}
