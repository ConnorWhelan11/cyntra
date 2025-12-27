/**
 * Membrane Service - Web3 integration layer management
 *
 * Manages the membrane HTTP service that handles:
 * - IPFS uploads (web3.storage)
 * - EAS attestations
 * - SIWE authentication
 * - Cartridge Controller bridge
 */

import { invoke } from "@tauri-apps/api/core";

export interface MembraneStatus {
  running: boolean;
  port: number;
  version?: string;
  uptime?: number;
  pid?: number;
}

export interface ControllerSession {
  sessionId: string;
  address: string;
  chainId: string;
  expiresAt: string;
  valid: boolean;
}

export interface ControllerConnectResponse {
  connectionId: string;
  keychainUrl: string;
  expiresAt: string;
}

export interface SessionPolicies {
  contracts: Record<
    string,
    {
      name?: string;
      description?: string;
      methods: Array<{
        name: string;
        entrypoint: string;
        description?: string;
        amount?: string;
      }>;
    }
  >;
  messages?: Array<{
    name?: string;
    description?: string;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    domain: {
      name: string;
      version: string;
      chainId: string;
      revision?: string;
    };
  }>;
}

const MEMBRANE_URL = "http://localhost:7331";

/**
 * Start the membrane service
 */
export async function startMembrane(): Promise<MembraneStatus> {
  return invoke<MembraneStatus>("membrane_start");
}

/**
 * Stop the membrane service
 */
export async function stopMembrane(): Promise<void> {
  return invoke("membrane_stop");
}

/**
 * Get membrane service status
 */
export async function getMembraneStatus(): Promise<MembraneStatus> {
  return invoke<MembraneStatus>("membrane_status");
}

/**
 * Ensure membrane is running, starting it if needed
 */
export async function ensureMembraneRunning(): Promise<MembraneStatus> {
  return invoke<MembraneStatus>("membrane_ensure");
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller Bridge (HTTP calls to membrane)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiate wallet connection with Cartridge Controller
 */
export async function connectController(params: {
  policies: SessionPolicies;
  chainId?: string;
  redirectUrl: string;
  preset?: string;
}): Promise<ControllerConnectResponse> {
  const response = await fetch(`${MEMBRANE_URL}/controller/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      policies: params.policies,
      chainId: params.chainId ?? "SN_SEPOLIA",
      redirectUrl: params.redirectUrl,
      preset: params.preset,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to initiate connection");
  }

  return response.json();
}

/**
 * Get session status
 */
export async function getControllerSession(sessionId: string): Promise<ControllerSession> {
  const response = await fetch(`${MEMBRANE_URL}/controller/session/${sessionId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Session not found");
  }

  return response.json();
}

/**
 * Execute a transaction using an active session
 */
export interface TransactionStatus {
  id: string;
  sessionId: string;
  transactionHash: string | null;
  status: "pending" | "submitted" | "accepted_on_l2" | "accepted_on_l1" | "rejected" | "failed";
  calls: Array<{
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface TransactionListItem {
  id: string;
  transactionHash: string | null;
  status: string;
  callCount: number;
  createdAt: string;
  error?: string;
}

export async function executeTransaction(params: {
  sessionId: string;
  calls: Array<{
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }>;
}): Promise<{ transactionId: string; transactionHash: string; status: string }> {
  const response = await fetch(`${MEMBRANE_URL}/controller/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Transaction failed");
  }

  return response.json();
}

/**
 * Disconnect and invalidate a session
 */
export async function disconnectController(sessionId: string): Promise<void> {
  const response = await fetch(`${MEMBRANE_URL}/controller/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to disconnect");
  }
}

/**
 * Get transaction status by ID
 */
export async function getTransactionStatus(transactionId: string): Promise<TransactionStatus> {
  const response = await fetch(`${MEMBRANE_URL}/controller/transaction/${transactionId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Transaction not found");
  }

  return response.json();
}

/**
 * Get transaction history for a session
 */
export async function getSessionTransactions(
  sessionId: string,
  limit?: number
): Promise<{ sessionId: string; transactions: TransactionListItem[]; count: number }> {
  const url = new URL(`${MEMBRANE_URL}/controller/session/${sessionId}/transactions`);
  if (limit) {
    url.searchParams.set("limit", limit.toString());
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch transactions");
  }

  return response.json();
}

/**
 * Get default Fab game policies
 */
export async function getDefaultPolicies(worldAddress?: string): Promise<SessionPolicies> {
  const url = new URL(`${MEMBRANE_URL}/controller/policies/default`);
  if (worldAddress) {
    url.searchParams.set("world", worldAddress);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Failed to fetch default policies");
  }

  return response.json();
}

/**
 * Check connection status for a pending connection
 */
export async function getConnectionStatus(
  connectionId: string
): Promise<{ status: "pending" | "completed" | "unknown"; createdAt?: string }> {
  const response = await fetch(`${MEMBRANE_URL}/controller/status/${connectionId}`);

  if (!response.ok) {
    throw new Error("Failed to check connection status");
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// IPFS & Attestations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload artifacts to IPFS
 */
export async function uploadToIpfs(artifactsDir: string): Promise<{ cid: string }> {
  const response = await fetch(`${MEMBRANE_URL}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactsDir }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Upload failed");
  }

  return response.json();
}

/**
 * Publish a run (upload + attest)
 */
export async function publishRun(runDir: string): Promise<{ cid: string; attestationUid: string }> {
  const response = await fetch(`${MEMBRANE_URL}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runDir }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Publish failed");
  }

  return response.json();
}

/**
 * Verify an attestation
 */
export async function verifyAttestation(
  uid: string
): Promise<{ valid: boolean; receipt?: unknown; attestedAt?: string }> {
  const response = await fetch(`${MEMBRANE_URL}/verify/${uid}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Verification failed");
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// ENS - Universe Discovery
// ─────────────────────────────────────────────────────────────────────────────

export interface UniverseResolution {
  name: string;
  contentHash: string | null;
  ipfsCid: string | null;
  address: string | null;
  resolver: string | null;
}

export interface UniverseParsed {
  world?: string;
  universe: string;
  domain: string;
  isWorld: boolean;
}

/**
 * Resolve an ENS name to universe metadata
 */
export async function resolveUniverse(
  ensName: string,
  chain: "mainnet" | "sepolia" = "mainnet"
): Promise<UniverseResolution> {
  const response = await fetch(`${MEMBRANE_URL}/ens/resolve/${ensName}?chain=${chain}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Resolution failed");
  }

  return response.json();
}

/**
 * Fetch universe metadata from IPFS via ENS
 */
export async function fetchUniverseMetadata(
  ensName: string,
  chain: "mainnet" | "sepolia" = "mainnet"
): Promise<{
  resolution: UniverseResolution;
  metadata: Record<string, unknown> | null;
  error?: string;
}> {
  const response = await fetch(`${MEMBRANE_URL}/ens/universe/${ensName}?chain=${chain}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Fetch failed");
  }

  return response.json();
}

/**
 * Parse a universe ENS name into components
 */
export async function parseUniverseName(name: string): Promise<UniverseParsed> {
  const response = await fetch(`${MEMBRANE_URL}/ens/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Parse failed");
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tableland - Run Indices
// ─────────────────────────────────────────────────────────────────────────────

export interface TablelandStatus {
  configured: boolean;
  tables: {
    runs: string | null;
    frontiers: string | null;
    patterns: string | null;
  };
}

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

export interface FrontierRecord {
  worldId: string;
  generation: number;
  paretoFront: string;
  updatedAt: number;
}

/**
 * Get Tableland configuration status
 */
export async function getTablelandStatus(): Promise<TablelandStatus> {
  const response = await fetch(`${MEMBRANE_URL}/tableland/status`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Status check failed");
  }

  return response.json();
}

/**
 * Query runs by world ID
 */
export async function queryRunsByWorld(
  worldId: string,
  limit: number = 50,
  passedOnly: boolean = false
): Promise<{ worldId: string; runs: RunRecord[]; count: number }> {
  const url = new URL(`${MEMBRANE_URL}/tableland/runs/world/${worldId}`);
  url.searchParams.set("limit", limit.toString());
  if (passedOnly) url.searchParams.set("passed", "true");

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Query failed");
  }

  return response.json();
}

/**
 * Get latest frontier for a world
 */
export async function getLatestFrontier(worldId: string): Promise<FrontierRecord | null> {
  const response = await fetch(`${MEMBRANE_URL}/tableland/frontiers/${worldId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Query failed");
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Lit Protocol - Access Control
// ─────────────────────────────────────────────────────────────────────────────

export interface LitStatus {
  connected: boolean;
  network: string;
  error?: string;
}

export interface AccessCondition {
  type: "nft-ownership" | "erc1155" | "token-balance" | "address-list" | "universe-access";
  contractAddress?: string;
  tokenId?: string;
  minBalance?: string;
  addresses?: string[];
  nftContract?: string;
  attestationSchema?: string;
  chain?: string;
}

export interface EncryptedData {
  ciphertext: string;
  dataToEncryptHash: string;
  accessControlConditions: unknown[];
  chain: string;
}

/**
 * Get Lit Protocol connection status
 */
export async function getLitStatus(): Promise<LitStatus> {
  const response = await fetch(`${MEMBRANE_URL}/lit/status`);
  return response.json();
}

/**
 * Encrypt data with access conditions
 */
export async function encryptWithLit(
  data: string,
  conditions: AccessCondition[],
  combineWith: "and" | "or" = "or"
): Promise<{ success: boolean; encryptedData: EncryptedData }> {
  const response = await fetch(`${MEMBRANE_URL}/lit/encrypt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, conditions, combineWith }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Encryption failed");
  }

  return response.json();
}

/**
 * Build access conditions without encrypting (preview)
 */
export async function buildAccessConditions(
  conditions: AccessCondition[],
  combineWith: "and" | "or" = "or"
): Promise<{ accessControlConditions: unknown[]; conditionCount: number; operator: string }> {
  const response = await fetch(`${MEMBRANE_URL}/lit/conditions/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conditions, combineWith }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Build failed");
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Bacalhau - Distributed Compute
// ─────────────────────────────────────────────────────────────────────────────

export interface BacalhauStatus {
  connected: boolean;
  network: string;
  apiKeyConfigured: boolean;
}

export interface JobStatus {
  id: string;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  outputs?: Array<{ name: string; cid: string; size: number }>;
}

/**
 * Get Bacalhau connection status
 */
export async function getBacalhauStatus(): Promise<BacalhauStatus> {
  const response = await fetch(`${MEMBRANE_URL}/bacalhau/status`);
  return response.json();
}

/**
 * Submit a quality gate job
 */
export async function submitGateJob(params: {
  assetCid: string;
  gateConfigCid: string;
  worldId: string;
  gateName?: string;
}): Promise<{ success: boolean; jobId: string; type: string }> {
  const response = await fetch(`${MEMBRANE_URL}/bacalhau/jobs/gate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Job submission failed");
  }

  return response.json();
}

/**
 * Submit a render job
 */
export async function submitRenderJob(params: {
  blendFileCid: string;
  camera: string;
  resolution: { width: number; height: number };
  samples?: number;
  frame?: number;
}): Promise<{ success: boolean; jobId: string; type: string }> {
  const response = await fetch(`${MEMBRANE_URL}/bacalhau/jobs/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Job submission failed");
  }

  return response.json();
}

/**
 * Get job status
 */
export async function getBacalhauJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${MEMBRANE_URL}/bacalhau/jobs/${jobId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Status check failed");
  }

  return response.json();
}

/**
 * Run complete gate pipeline (render → critics → gate)
 */
export async function runGatePipeline(params: {
  assetCid: string;
  gateConfigCid: string;
  criticConfigCid: string;
  lookdevCid: string;
  worldId: string;
}): Promise<{
  success: boolean;
  renderCid: string;
  criticScoresCid: string;
  verdictCid: string;
  passed: boolean;
}> {
  const response = await fetch(`${MEMBRANE_URL}/bacalhau/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Pipeline failed");
  }

  return response.json();
}
