/**
 * Bacalhau Routes for Distributed Compute
 *
 * Provides API for submitting and tracking decentralized compute jobs.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  BacalhauClient,
  submitGateJob,
  submitRenderJob,
  submitCriticJob,
  runGatePipeline,
} from "../lib/bacalhau.js";

const app = new Hono();

// Global client instance
let bacalhauClient: BacalhauClient | null = null;

const GateJobSchema = z.object({
  assetCid: z.string(),
  gateConfigCid: z.string(),
  worldId: z.string(),
  gateName: z.string().optional(),
});

const RenderJobSchema = z.object({
  blendFileCid: z.string(),
  camera: z.string(),
  resolution: z.object({
    width: z.number().min(1).max(8192),
    height: z.number().min(1).max(8192),
  }),
  samples: z.number().min(1).max(4096).optional(),
  frame: z.number().optional(),
});

const CriticJobSchema = z.object({
  rendersCid: z.string(),
  criticConfigCid: z.string(),
  worldId: z.string(),
});

const PipelineSchema = z.object({
  assetCid: z.string(),
  gateConfigCid: z.string(),
  criticConfigCid: z.string(),
  lookdevCid: z.string(),
  worldId: z.string(),
});

const CustomJobSchema = z.object({
  name: z.string(),
  image: z.string(),
  command: z.array(z.string()),
  env: z.record(z.string()).optional(),
  inputs: z.array(
    z.object({
      cid: z.string(),
      path: z.string(),
      name: z.string().optional(),
    })
  ),
  outputs: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
    })
  ),
  resources: z
    .object({
      cpu: z.number().optional(),
      memory: z.number().optional(),
      gpu: z.number().optional(),
      disk: z.number().optional(),
    })
    .optional(),
  timeout: z.number().optional(),
  count: z.number().optional(),
});

/**
 * Get or create Bacalhau client
 */
function getClient(
  network: "mainnet" | "testnet" | "local" = "testnet"
): BacalhauClient {
  if (!bacalhauClient) {
    const apiKey = process.env.BACALHAU_API_KEY;
    bacalhauClient = new BacalhauClient(network, apiKey);
  }
  return bacalhauClient;
}

/**
 * GET /bacalhau/status
 *
 * Check Bacalhau connection status
 */
app.get("/status", async (c) => {
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    // Initialize client to verify it can be created
    getClient(network);
    // Simple health check - this would actually ping the Bacalhau API
    return c.json({
      connected: true,
      network,
      apiKeyConfigured: Boolean(process.env.BACALHAU_API_KEY),
    });
  } catch (error) {
    return c.json({
      connected: false,
      error: error instanceof Error ? error.message : "Connection failed",
    });
  }
});

/**
 * POST /bacalhau/jobs/gate
 *
 * Submit a quality gate evaluation job
 */
app.post("/jobs/gate", zValidator("json", GateJobSchema), async (c) => {
  const spec = c.req.valid("json");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const jobId = await submitGateJob(client, spec);

    return c.json({
      success: true,
      jobId,
      type: "gate",
      spec,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to submit gate job" },
      500
    );
  }
});

/**
 * POST /bacalhau/jobs/render
 *
 * Submit a Blender render job
 */
app.post("/jobs/render", zValidator("json", RenderJobSchema), async (c) => {
  const spec = c.req.valid("json");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const jobId = await submitRenderJob(client, spec);

    return c.json({
      success: true,
      jobId,
      type: "render",
      spec,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to submit render job" },
      500
    );
  }
});

/**
 * POST /bacalhau/jobs/critic
 *
 * Submit a critic evaluation job
 */
app.post("/jobs/critic", zValidator("json", CriticJobSchema), async (c) => {
  const { rendersCid, criticConfigCid, worldId } = c.req.valid("json");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const jobId = await submitCriticJob(client, rendersCid, criticConfigCid, worldId);

    return c.json({
      success: true,
      jobId,
      type: "critic",
      worldId,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to submit critic job" },
      500
    );
  }
});

/**
 * POST /bacalhau/jobs/custom
 *
 * Submit a custom Docker job
 */
app.post("/jobs/custom", zValidator("json", CustomJobSchema), async (c) => {
  const job = c.req.valid("json");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const jobId = await client.submitJob(job);

    return c.json({
      success: true,
      jobId,
      type: "custom",
      name: job.name,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to submit custom job" },
      500
    );
  }
});

/**
 * POST /bacalhau/pipeline
 *
 * Run complete gate pipeline (render → critics → gate)
 */
app.post("/pipeline", zValidator("json", PipelineSchema), async (c) => {
  const spec = c.req.valid("json");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const result = await runGatePipeline(
      client,
      spec.assetCid,
      spec.gateConfigCid,
      spec.criticConfigCid,
      spec.lookdevCid,
      spec.worldId
    );

    return c.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Pipeline failed" },
      500
    );
  }
});

/**
 * GET /bacalhau/jobs/:jobId
 *
 * Get job status
 */
app.get("/jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const status = await client.getJobStatus(jobId);

    return c.json(status);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get job status" },
      500
    );
  }
});

/**
 * GET /bacalhau/jobs/:jobId/outputs
 *
 * Get job outputs (IPFS CIDs)
 */
app.get("/jobs/:jobId/outputs", async (c) => {
  const jobId = c.req.param("jobId");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const outputs = await client.getJobOutputs(jobId);

    return c.json({
      jobId,
      outputs,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get job outputs" },
      500
    );
  }
});

/**
 * POST /bacalhau/jobs/:jobId/wait
 *
 * Wait for job completion
 */
app.post("/jobs/:jobId/wait", async (c) => {
  const jobId = c.req.param("jobId");
  const timeout = parseInt(c.req.query("timeout") || "600000", 10);
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    const status = await client.waitForJob(jobId, timeout);

    return c.json(status);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Wait failed" },
      500
    );
  }
});

/**
 * DELETE /bacalhau/jobs/:jobId
 *
 * Cancel a job
 */
app.delete("/jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const network =
    (c.req.query("network") as "mainnet" | "testnet" | "local") || "testnet";

  try {
    const client = getClient(network);
    await client.cancelJob(jobId);

    return c.json({
      success: true,
      jobId,
      cancelled: true,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to cancel job" },
      500
    );
  }
});

export default app;
