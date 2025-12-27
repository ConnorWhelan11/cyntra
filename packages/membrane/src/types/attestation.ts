import { z } from "zod";

/**
 * EAS Schema for RunReceipt attestations
 *
 * Schema string for EAS registration:
 * "string universeId,string worldId,string runId,bytes32 manifestHash,bytes32 artifactsCid,bool passed"
 */
export const EAS_SCHEMA_STRING =
  "string universeId,string worldId,string runId,bytes32 manifestHash,bytes32 artifactsCid,bool passed";

/**
 * Encoded attestation data matching EAS schema
 */
export const AttestationDataSchema = z.object({
  universeId: z.string(),
  worldId: z.string(),
  runId: z.string(),
  manifestHash: z
    .string()
    .regex(/^0x[a-f0-9]{64}$/)
    .describe("SHA256 hash of manifest"),
  artifactsCid: z.string().describe("IPFS CID as string (will be hashed)"),
  passed: z.boolean(),
});

export type AttestationData = z.infer<typeof AttestationDataSchema>;

/**
 * Chain configuration for EAS
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  easContractAddress: string;
  schemaRegistryAddress: string;
  explorerUrl: string;
}

/**
 * Supported chains
 */
export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  "base-sepolia": {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    easContractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    explorerUrl: "https://base-sepolia.easscan.org",
  },
  base: {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    easContractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    explorerUrl: "https://base.easscan.org",
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    rpcUrl: "https://mainnet.optimism.io",
    easContractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    explorerUrl: "https://optimism.easscan.org",
  },
  "optimism-sepolia": {
    chainId: 11155420,
    name: "Optimism Sepolia",
    rpcUrl: "https://sepolia.optimism.io",
    easContractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    explorerUrl: "https://optimism-sepolia.easscan.org",
  },
};

/**
 * Attestation status from EAS
 */
export interface AttestationStatus {
  uid: string;
  schema: string;
  refUID: string;
  time: bigint;
  expirationTime: bigint;
  revocationTime: bigint;
  recipient: string;
  attester: string;
  revocable: boolean;
  data: string;
}
