/**
 * @glia/membrane
 *
 * Web3 Integration Layer for Cyntra
 *
 * This package provides:
 * - IPFS uploads via web3.storage (w3up)
 * - EAS attestations for run receipts
 * - SIWE authentication
 */

// Server
export { createApp, startServer, VERSION } from "./server.js";

// Types
export type { RunReceipt, RunReceiptInput } from "./types/receipt.js";
export { RunReceiptSchema } from "./types/receipt.js";

export type {
  PublishRequest,
  PublishResponse,
  UploadRequest,
  UploadResponse,
  AttestRequest,
  AttestResponse,
  VerifyResponse,
  HealthResponse,
  ErrorResponse,
} from "./types/api.js";

export type { AttestationData, ChainConfig, AttestationStatus } from "./types/attestation.js";
export { SUPPORTED_CHAINS, EAS_SCHEMA_STRING } from "./types/attestation.js";

// Library functions
export { canonicalize, hashObject, sha256, verifyHash } from "./lib/canonical.js";
export { getConfig, getIpfsGatewayUrl, getEasExplorerUrl } from "./lib/config.js";
export type { MembraneConfig } from "./lib/config.js";

// IPFS
export {
  isConfigured as isIpfsConfigured,
  uploadFile,
  uploadDirectory,
  checkAvailability,
} from "./lib/ipfs.js";

// EAS
export {
  isConfigured as isEasConfigured,
  createAttestation,
  createOnchainAttestation,
  verifyAttestation,
} from "./lib/eas.js";

// Signing
export {
  getWalletClient,
  getPublicClient,
  signMessage,
  verifySignedMessage,
  getSignerAddress,
} from "./lib/signing.js";
