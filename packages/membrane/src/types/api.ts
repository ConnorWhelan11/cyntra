import { z } from "zod";

// ============================================================================
// Request Schemas
// ============================================================================

export const PublishRequestSchema = z.object({
  /** Path to the run directory containing receipt.json and artifacts */
  runDir: z.string().describe("Absolute path to run directory"),
});

export const UploadRequestSchema = z.object({
  /** Path to directory of artifacts to upload */
  artifactsDir: z.string().describe("Absolute path to artifacts directory"),
});

export const AttestRequestSchema = z.object({
  /** The receipt to attest */
  receipt: z.any(), // Will be validated as RunReceiptInput
  /** IPFS CID of uploaded artifacts */
  cid: z.string().describe("IPFS CID of artifacts"),
});

export const AuthNonceRequestSchema = z.object({
  /** Ethereum address requesting nonce */
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe("Ethereum address"),
});

export const AuthVerifyRequestSchema = z.object({
  /** SIWE message that was signed */
  message: z.string().describe("SIWE message"),
  /** Signature from wallet */
  signature: z.string().describe("Hex-encoded signature"),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  chain: z.string(),
  uptime: z.number().describe("Uptime in seconds"),
});

export const PublishResponseSchema = z.object({
  cid: z.string().describe("IPFS CID of uploaded artifacts"),
  attestationUid: z.string().describe("EAS attestation UID"),
  explorerUrl: z.string().optional().describe("Link to EAS explorer"),
  ipfsGatewayUrl: z.string().optional().describe("Link to IPFS gateway"),
});

export const UploadResponseSchema = z.object({
  cid: z.string().describe("IPFS CID of uploaded directory"),
  gatewayUrl: z.string().describe("URL to access via IPFS gateway"),
});

export const AttestResponseSchema = z.object({
  attestationUid: z.string().describe("EAS attestation UID"),
  signature: z.string().describe("Attestation signature"),
  explorerUrl: z.string().optional(),
});

export const VerifyResponseSchema = z.object({
  valid: z.boolean().describe("Whether attestation is valid"),
  receipt: z.any().optional().describe("The attested receipt if valid"),
  attestedAt: z.string().datetime().optional().describe("When it was attested"),
  attester: z.string().optional().describe("Who attested it"),
  error: z.string().optional().describe("Error message if invalid"),
});

export const AuthNonceResponseSchema = z.object({
  nonce: z.string().describe("Random nonce for SIWE"),
});

export const AuthVerifyResponseSchema = z.object({
  session: z.object({
    address: z.string(),
    chainId: z.number(),
    expiresAt: z.string().datetime(),
  }),
});

export const ErrorResponseSchema = z.object({
  error: z.string().describe("Error message"),
  code: z.string().optional().describe("Error code for programmatic handling"),
  details: z.any().optional().describe("Additional error details"),
});

// ============================================================================
// Types
// ============================================================================

export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type PublishResponse = z.infer<typeof PublishResponseSchema>;
export type UploadRequest = z.infer<typeof UploadRequestSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type AttestRequest = z.infer<typeof AttestRequestSchema>;
export type AttestResponse = z.infer<typeof AttestResponseSchema>;
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type AuthNonceRequest = z.infer<typeof AuthNonceRequestSchema>;
export type AuthNonceResponse = z.infer<typeof AuthNonceResponseSchema>;
export type AuthVerifyRequest = z.infer<typeof AuthVerifyRequestSchema>;
export type AuthVerifyResponse = z.infer<typeof AuthVerifyResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
