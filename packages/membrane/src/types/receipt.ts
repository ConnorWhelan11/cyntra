import { z } from "zod";

/**
 * RunReceipt - The core attestable object linking universe→world→run→artifacts→verdict
 *
 * This is the canonical schema for run receipts that get:
 * 1. Uploaded to IPFS with artifacts
 * 2. Attested via EAS (offchain + onchain anchor)
 * 3. Verified by external parties
 */
export const RunReceiptSchema = z.object({
  /** Schema version for forward compatibility */
  version: z.literal("0.1.0"),

  /** Universe identification */
  universe: z.object({
    id: z.string().describe("Universe ID (e.g., 'cyntra-fab')"),
    name: z.string().describe("Human-readable universe name"),
  }),

  /** World identification within universe */
  world: z.object({
    id: z.string().describe("World ID (e.g., 'outora-library')"),
    name: z.string().describe("Human-readable world name"),
    version: z.string().optional().describe("Semantic version if applicable"),
  }),

  /** Run identification */
  run: z.object({
    id: z.string().describe("Unique run ID (e.g., '20231215-abc123')"),
    timestamp: z.string().datetime().describe("ISO 8601 timestamp of run start"),
    git_sha: z.string().length(40).describe("Full git commit SHA"),
    toolchain: z
      .enum(["codex", "claude", "opencode", "crush", "blender", "fab"])
      .describe("Toolchain that executed the run"),
  }),

  /** Artifacts produced by the run */
  artifacts: z.object({
    manifest_hash: z
      .string()
      .regex(/^0x[a-f0-9]{64}$/)
      .describe("SHA256 of run-manifest.json"),
    proof_hash: z
      .string()
      .regex(/^0x[a-f0-9]{64}$/)
      .optional()
      .describe("SHA256 of proof.json if present"),
    primary_asset_hash: z
      .string()
      .regex(/^0x[a-f0-9]{64}$/)
      .optional()
      .describe("SHA256 of primary output asset (e.g., .glb file)"),
    ipfs_cid: z
      .string()
      .optional()
      .describe("IPFS CID of uploaded artifacts directory"),
  }),

  /** Gate verdict summary */
  verdict: z.object({
    passed: z.boolean().describe("Whether all gates passed"),
    gate_id: z.string().optional().describe("Gate config ID if fab pipeline"),
    scores: z
      .record(z.string(), z.number())
      .optional()
      .describe("Individual gate scores"),
    threshold: z.number().optional().describe("Minimum passing threshold"),
  }),

  /** Attestation metadata (filled after EAS signing) */
  attestation: z
    .object({
      uid: z.string().describe("EAS attestation UID"),
      chain_id: z.number().describe("Chain ID where attested"),
      attester: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Ethereum address of attester"),
      timestamp: z.string().datetime().describe("Attestation timestamp"),
    })
    .optional(),
});

export type RunReceipt = z.infer<typeof RunReceiptSchema>;

/**
 * Partial receipt before attestation is added
 */
export type RunReceiptInput = Omit<RunReceipt, "attestation">;
