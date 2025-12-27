/**
 * Cross-Chain Verification Routes
 *
 * Endpoints for generating Herodotus proofs and unified identity management.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Hex } from "viem";
import {
  requestStorageProof,
  getTaskStatus,
  waitForProof,
  formatProofForStarknet,
  computeAttestationSlot,
  verifyAttestationCrossChain,
} from "../lib/herodotus.js";

const app = new Hono();

// Request proof generation schema
const ProofRequestSchema = z.object({
  attestationUid: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  sourceChain: z.enum(["base", "base-sepolia"]),
  blockNumber: z.number().optional(),
});

// Task ID schema
const TaskIdSchema = z.object({
  taskId: z.string(),
});

/**
 * POST /crosschain/proof/request
 *
 * Request a Herodotus storage proof for an attestation.
 * Returns a task ID to poll for completion.
 */
app.post(
  "/proof/request",
  zValidator("json", ProofRequestSchema),
  async (c) => {
    const { attestationUid, sourceChain, blockNumber } = c.req.valid("json");
    const apiKey = process.env.HERODOTUS_API_KEY;

    if (!apiKey) {
      return c.json(
        { error: "HERODOTUS_API_KEY not configured" },
        500
      );
    }

    try {
      const taskId = await requestStorageProof(
        {
          attestationUid: attestationUid as Hex,
          sourceChain,
          blockNumber: blockNumber ? BigInt(blockNumber) : undefined,
        },
        apiKey
      );

      return c.json({
        taskId,
        message: "Proof generation started",
        estimatedTime: "2-5 minutes",
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Failed to request proof",
        },
        500
      );
    }
  }
);

/**
 * GET /crosschain/proof/status/:taskId
 *
 * Check the status of a proof generation task.
 */
app.get("/proof/status/:taskId", async (c) => {
  const taskId = c.req.param("taskId");
  const apiKey = process.env.HERODOTUS_API_KEY;
  const isTestnet = c.req.query("testnet") !== "false";

  if (!apiKey) {
    return c.json({ error: "HERODOTUS_API_KEY not configured" }, 500);
  }

  try {
    const status = await getTaskStatus(taskId, apiKey, isTestnet);
    return c.json(status);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to get status",
      },
      500
    );
  }
});

/**
 * POST /crosschain/proof/wait
 *
 * Wait for a proof to complete and return the formatted result.
 */
app.post(
  "/proof/wait",
  zValidator("json", TaskIdSchema.extend({
    timeoutMs: z.number().optional().default(300000),
  })),
  async (c) => {
    const { taskId, timeoutMs } = c.req.valid("json");
    const apiKey = process.env.HERODOTUS_API_KEY;
    const isTestnet = c.req.query("testnet") !== "false";

    if (!apiKey) {
      return c.json({ error: "HERODOTUS_API_KEY not configured" }, 500);
    }

    try {
      const status = await waitForProof(taskId, apiKey, isTestnet, timeoutMs);

      if (status.status === "failed") {
        return c.json(
          { error: status.error || "Proof generation failed" },
          500
        );
      }

      if (status.proof) {
        return c.json({
          status: "completed",
          proof: formatProofForStarknet(status.proof),
        });
      }

      return c.json({ status: status.status });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Failed to wait for proof",
        },
        500
      );
    }
  }
);

/**
 * POST /crosschain/verify
 *
 * Full verification flow: request proof, wait, and return formatted result.
 */
app.post(
  "/verify",
  zValidator("json", ProofRequestSchema),
  async (c) => {
    const { attestationUid, sourceChain } = c.req.valid("json");
    const apiKey = process.env.HERODOTUS_API_KEY;

    if (!apiKey) {
      return c.json({ error: "HERODOTUS_API_KEY not configured" }, 500);
    }

    try {
      const result = await verifyAttestationCrossChain(
        attestationUid as Hex,
        sourceChain,
        apiKey
      );

      return c.json(result);
    } catch (error) {
      return c.json(
        {
          verified: false,
          error: error instanceof Error ? error.message : "Verification failed",
        },
        500
      );
    }
  }
);

/**
 * GET /crosschain/slot/:attestationUid
 *
 * Compute the storage slot for an attestation (for debugging).
 */
app.get("/slot/:attestationUid", (c) => {
  const attestationUid = c.req.param("attestationUid") as Hex;

  try {
    const slot = computeAttestationSlot(attestationUid);
    return c.json({
      attestationUid,
      storageSlot: slot,
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to compute slot",
      },
      400
    );
  }
});

export default app;
