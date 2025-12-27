import { SUPPORTED_CHAINS, type ChainConfig } from "../types/attestation.js";

/**
 * Environment mode
 */
export type Environment = "development" | "production" | "test";

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** General API rate limit (requests per minute) */
  general: number;
  /** Auth endpoint rate limit (requests per minute) */
  auth: number;
  /** Nonce generation rate limit (requests per minute) */
  nonce: number;
  /** Transaction execution rate limit (requests per minute) */
  execute: number;
  /** Upload rate limit (requests per minute) */
  upload: number;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  /** Allowed origins */
  origins: string[];
  /** Allow credentials */
  credentials: boolean;
}

/**
 * Starknet configuration
 */
export interface StarknetConfig {
  /** Default chain ID */
  defaultChainId: "SN_MAIN" | "SN_SEPOLIA";
  /** Mainnet RPC URL */
  mainnetRpcUrl: string;
  /** Sepolia RPC URL */
  sepoliaRpcUrl: string;
  /** Keychain URL */
  keychainUrl: string;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Session duration in milliseconds */
  durationMs: number;
  /** Nonce expiration in milliseconds */
  nonceExpirationMs: number;
}

/**
 * Membrane service configuration
 */
export interface MembraneConfig {
  /** Environment mode */
  env: Environment;

  /** Port to listen on */
  port: number;

  /** Chain to use for attestations */
  chain: string;

  /** Chain configuration */
  chainConfig: ChainConfig;

  /** EAS schema UID for RunReceipt attestations */
  schemaUid: string | null;

  /** w3up space DID */
  w3upSpaceDid: string | null;

  /** IPFS gateway URL template */
  ipfsGatewayUrl: string;

  /** Database path (null for default) */
  dbPath: string | null;

  /** Rate limit configuration */
  rateLimit: RateLimitConfig;

  /** CORS configuration */
  cors: CorsConfig;

  /** Starknet configuration */
  starknet: StarknetConfig;

  /** Session configuration */
  session: SessionConfig;

  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Parse boolean environment variable
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Parse integer environment variable
 */
function parseInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse comma-separated list
 */
function parseList(value: string | undefined, defaultValue: string[]): string[] {
  if (value === undefined || value === "") return defaultValue;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Default CORS origins for development
 */
const DEV_CORS_ORIGINS = [
  "http://localhost:1420",
  "http://localhost:5173",
  "http://localhost:3000",
  "tauri://localhost",
];

/**
 * Get configuration from environment variables
 */
export function getConfig(): MembraneConfig {
  const env = (process.env.NODE_ENV || "development") as Environment;
  const chain = process.env.MEMBRANE_CHAIN || "base-sepolia";
  const chainConfig = SUPPORTED_CHAINS[chain];

  if (!chainConfig) {
    throw new Error(
      `Unsupported chain: ${chain}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`
    );
  }

  // In production, require explicit CORS origins
  const defaultOrigins = env === "production" ? [] : DEV_CORS_ORIGINS;

  return {
    env,
    port: parseInt(process.env.MEMBRANE_PORT, 7331),
    chain,
    chainConfig,
    schemaUid: process.env.MEMBRANE_SCHEMA_UID || null,
    w3upSpaceDid: process.env.MEMBRANE_W3UP_SPACE_DID || null,
    ipfsGatewayUrl: process.env.MEMBRANE_IPFS_GATEWAY || "https://w3s.link/ipfs/{cid}",
    dbPath: process.env.MEMBRANE_DB_PATH || null,
    verbose: parseBool(process.env.MEMBRANE_VERBOSE, env === "development"),

    rateLimit: {
      general: parseInt(process.env.MEMBRANE_RATE_LIMIT_GENERAL, 100),
      auth: parseInt(process.env.MEMBRANE_RATE_LIMIT_AUTH, 10),
      nonce: parseInt(process.env.MEMBRANE_RATE_LIMIT_NONCE, 20),
      execute: parseInt(process.env.MEMBRANE_RATE_LIMIT_EXECUTE, 30),
      upload: parseInt(process.env.MEMBRANE_RATE_LIMIT_UPLOAD, 5),
    },

    cors: {
      origins: parseList(process.env.MEMBRANE_CORS_ORIGINS, defaultOrigins),
      credentials: parseBool(process.env.MEMBRANE_CORS_CREDENTIALS, true),
    },

    starknet: {
      defaultChainId: (process.env.MEMBRANE_STARKNET_CHAIN || "SN_SEPOLIA") as "SN_MAIN" | "SN_SEPOLIA",
      mainnetRpcUrl: process.env.MEMBRANE_STARKNET_MAINNET_RPC || "https://starknet-mainnet.public.blastapi.io",
      sepoliaRpcUrl: process.env.MEMBRANE_STARKNET_SEPOLIA_RPC || "https://starknet-sepolia.public.blastapi.io",
      keychainUrl: process.env.MEMBRANE_KEYCHAIN_URL || "https://x.cartridge.gg",
    },

    session: {
      durationMs: parseInt(process.env.MEMBRANE_SESSION_DURATION_MS, 24 * 60 * 60 * 1000),
      nonceExpirationMs: parseInt(process.env.MEMBRANE_NONCE_EXPIRATION_MS, 10 * 60 * 1000),
    },
  };
}

/**
 * Validate configuration for production
 */
export function validateProductionConfig(config: MembraneConfig): string[] {
  const errors: string[] = [];

  if (config.env === "production") {
    if (config.cors.origins.length === 0) {
      errors.push("MEMBRANE_CORS_ORIGINS must be set in production");
    }

    if (!config.schemaUid) {
      errors.push("MEMBRANE_SCHEMA_UID should be set for EAS attestations");
    }

    if (!config.w3upSpaceDid) {
      errors.push("MEMBRANE_W3UP_SPACE_DID should be set for IPFS uploads");
    }
  }

  return errors;
}

/**
 * Get IPFS gateway URL for a CID
 */
export function getIpfsGatewayUrl(cid: string, config: MembraneConfig = getConfig()): string {
  return config.ipfsGatewayUrl.replace("{cid}", cid);
}

/**
 * Get EAS explorer URL for an attestation
 */
export function getEasExplorerUrl(
  attestationUid: string,
  config: MembraneConfig = getConfig()
): string {
  return `${config.chainConfig.explorerUrl}/attestation/view/${attestationUid}`;
}

/**
 * Version string for health checks
 */
export const VERSION = "0.1.0";
