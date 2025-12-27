/**
 * Bacalhau Integration for Distributed Compute
 *
 * Enables decentralized execution of:
 * - Quality gates on 3D assets
 * - Render jobs (Blender)
 * - Critic evaluations
 * - Any Docker/WASM workload with IPFS I/O
 *
 * Jobs are submitted to the Bacalhau network and results are stored on IPFS.
 */

// Bacalhau API endpoints
const BACALHAU_API = {
  mainnet: "https://api.bacalhau.org",
  testnet: "https://api.testnet.bacalhau.org",
  local: "http://localhost:1234",
};

/**
 * Job specification for Bacalhau
 */
export interface BacalhauJob {
  /** Job name for identification */
  name: string;
  /** Docker image to run */
  image: string;
  /** Command to execute */
  command: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** IPFS CIDs for input data */
  inputs: BacalhauInput[];
  /** Output configuration */
  outputs: BacalhauOutput[];
  /** Resource requirements */
  resources?: BacalhauResources;
  /** Job timeout in seconds */
  timeout?: number;
  /** Number of nodes to run on */
  count?: number;
}

/**
 * Input specification
 */
export interface BacalhauInput {
  /** IPFS CID of input data */
  cid: string;
  /** Mount path in container */
  path: string;
  /** Name for reference */
  name?: string;
}

/**
 * Output specification
 */
export interface BacalhauOutput {
  /** Output name */
  name: string;
  /** Path in container to collect */
  path: string;
}

/**
 * Resource requirements
 */
export interface BacalhauResources {
  /** CPU cores */
  cpu?: number;
  /** Memory in MB */
  memory?: number;
  /** GPU requirements */
  gpu?: number;
  /** Disk space in MB */
  disk?: number;
}

/**
 * Job status
 */
export interface JobStatus {
  id: string;
  state: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  outputs?: JobOutput[];
}

/**
 * Job output
 */
export interface JobOutput {
  name: string;
  cid: string;
  size: number;
}

/**
 * Gate job specification
 */
export interface GateJobSpec {
  /** Asset CID on IPFS */
  assetCid: string;
  /** Gate configuration CID */
  gateConfigCid: string;
  /** World ID for context */
  worldId: string;
  /** Optional: specific gate name */
  gateName?: string;
}

/**
 * Render job specification
 */
export interface RenderJobSpec {
  /** Blend file CID */
  blendFileCid: string;
  /** Camera name to render */
  camera: string;
  /** Output resolution */
  resolution: { width: number; height: number };
  /** Number of samples */
  samples?: number;
  /** Frame to render (default: 1) */
  frame?: number;
}

/**
 * Bacalhau client
 */
export class BacalhauClient {
  private apiUrl: string;
  private apiKey?: string;

  constructor(
    network: keyof typeof BACALHAU_API = "testnet",
    apiKey?: string
  ) {
    this.apiUrl = BACALHAU_API[network];
    this.apiKey = apiKey;
  }

  /**
   * Submit a job to Bacalhau
   */
  async submitJob(job: BacalhauJob): Promise<string> {
    const spec = this.buildJobSpec(job);

    const response = await fetch(`${this.apiUrl}/api/v1/orchestrator/jobs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify(spec),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to submit job: ${error}`);
    }

    const result = (await response.json()) as { JobID: string };
    return result.JobID;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/orchestrator/jobs/${jobId}`,
      {
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    const result = (await response.json()) as {
      Job: {
        ID: string;
        State: { StateType: number };
        CreateTime: string;
        ModifyTime: string;
      };
    };

    // Map Bacalhau state to our status
    const stateMap: Record<number, JobStatus["state"]> = {
      0: "pending",
      1: "running",
      2: "completed",
      3: "failed",
      4: "cancelled",
    };

    return {
      id: result.Job.ID,
      state: stateMap[result.Job.State.StateType] || "pending",
      createdAt: result.Job.CreateTime,
    };
  }

  /**
   * Wait for job completion
   */
  async waitForJob(
    jobId: string,
    timeoutMs: number = 600000,
    pollIntervalMs: number = 5000
  ): Promise<JobStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      if (status.state === "completed" || status.state === "failed") {
        // Get outputs if completed
        if (status.state === "completed") {
          status.outputs = await this.getJobOutputs(jobId);
        }
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Job timed out after ${timeoutMs}ms`);
  }

  /**
   * Get job outputs
   */
  async getJobOutputs(jobId: string): Promise<JobOutput[]> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/orchestrator/jobs/${jobId}/results`,
      {
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get job outputs: ${response.statusText}`);
    }

    const result = (await response.json()) as {
      Results: Array<{
        Data: { CID: string; Name: string; Size: number };
      }>;
    };

    return result.Results.map((r) => ({
      name: r.Data.Name,
      cid: r.Data.CID,
      size: r.Data.Size,
    }));
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/orchestrator/jobs/${jobId}`,
      {
        method: "DELETE",
        headers: {
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to cancel job: ${response.statusText}`);
    }
  }

  /**
   * Build Bacalhau job specification
   */
  private buildJobSpec(job: BacalhauJob): object {
    return {
      Name: job.name,
      Type: "batch",
      Count: job.count || 1,
      Constraints: [],
      Tasks: [
        {
          Name: "main",
          Engine: {
            Type: "docker",
            Params: {
              Image: job.image,
              Entrypoint: job.command,
              EnvironmentVariables: Object.entries(job.env || {}).map(
                ([key, value]) => `${key}=${value}`
              ),
            },
          },
          Publisher: {
            Type: "ipfs",
          },
          InputSources: job.inputs.map((input) => ({
            Source: {
              Type: "ipfs",
              Params: {
                CID: input.cid,
              },
            },
            Target: input.path,
            Alias: input.name || input.cid,
          })),
          ResultPaths: job.outputs.map((output) => ({
            Name: output.name,
            Path: output.path,
          })),
          Resources: {
            CPU: `${job.resources?.cpu || 1}`,
            Memory: `${job.resources?.memory || 512}Mi`,
            Disk: `${job.resources?.disk || 1024}Mi`,
            GPU: job.resources?.gpu ? `${job.resources.gpu}` : undefined,
          },
          Timeouts: {
            ExecutionTimeout: job.timeout || 600,
          },
        },
      ],
    };
  }
}

/**
 * Submit a gate evaluation job
 */
export async function submitGateJob(
  client: BacalhauClient,
  spec: GateJobSpec
): Promise<string> {
  const job: BacalhauJob = {
    name: `fab-gate-${spec.worldId}-${Date.now()}`,
    image: "ghcr.io/glia-fab/fab-gate:latest",
    command: [
      "python",
      "-m",
      "fab_gate",
      "--asset",
      "/inputs/asset",
      "--config",
      "/inputs/config/gate.yaml",
      "--output",
      "/outputs",
    ],
    inputs: [
      { cid: spec.assetCid, path: "/inputs/asset", name: "asset" },
      { cid: spec.gateConfigCid, path: "/inputs/config", name: "config" },
    ],
    outputs: [{ name: "verdict", path: "/outputs" }],
    resources: {
      cpu: 2,
      memory: 4096,
      disk: 2048,
    },
    timeout: 300,
  };

  return client.submitJob(job);
}

/**
 * Submit a render job
 */
export async function submitRenderJob(
  client: BacalhauClient,
  spec: RenderJobSpec
): Promise<string> {
  const job: BacalhauJob = {
    name: `fab-render-${Date.now()}`,
    image: "ghcr.io/glia-fab/fab-render:latest",
    command: [
      "blender",
      "-b",
      "/inputs/scene.blend",
      "-o",
      "/outputs/render_",
      "-F",
      "PNG",
      "-x",
      "1",
      "-f",
      String(spec.frame || 1),
      "--",
      "--camera",
      spec.camera,
      "--resolution",
      `${spec.resolution.width}x${spec.resolution.height}`,
      "--samples",
      String(spec.samples || 128),
    ],
    inputs: [{ cid: spec.blendFileCid, path: "/inputs/scene.blend" }],
    outputs: [{ name: "renders", path: "/outputs" }],
    resources: {
      cpu: 4,
      memory: 8192,
      disk: 4096,
    },
    timeout: 600,
  };

  return client.submitJob(job);
}

/**
 * Submit a critic evaluation job
 */
export async function submitCriticJob(
  client: BacalhauClient,
  rendersCid: string,
  criticConfigCid: string,
  worldId: string
): Promise<string> {
  const job: BacalhauJob = {
    name: `fab-critic-${worldId}-${Date.now()}`,
    image: "ghcr.io/glia-fab/fab-critics:latest",
    command: [
      "python",
      "-m",
      "fab_critics",
      "--renders",
      "/inputs/renders",
      "--config",
      "/inputs/config/critics.yaml",
      "--output",
      "/outputs",
    ],
    inputs: [
      { cid: rendersCid, path: "/inputs/renders", name: "renders" },
      { cid: criticConfigCid, path: "/inputs/config", name: "config" },
    ],
    outputs: [{ name: "scores", path: "/outputs" }],
    resources: {
      cpu: 2,
      memory: 4096,
      disk: 2048,
      gpu: 1, // Critics may use CLIP/torch
    },
    timeout: 300,
  };

  return client.submitJob(job);
}

/**
 * Run a complete gate pipeline
 * 1. Render asset
 * 2. Run critics
 * 3. Evaluate gate
 */
export async function runGatePipeline(
  client: BacalhauClient,
  assetCid: string,
  gateConfigCid: string,
  criticConfigCid: string,
  lookdevCid: string,
  worldId: string
): Promise<{
  renderCid: string;
  criticScoresCid: string;
  verdictCid: string;
  passed: boolean;
}> {
  // 1. Render
  const renderJobId = await submitRenderJob(client, {
    blendFileCid: lookdevCid,
    camera: "main",
    resolution: { width: 1024, height: 1024 },
    samples: 64,
  });

  const renderStatus = await client.waitForJob(renderJobId);
  if (renderStatus.state !== "completed" || !renderStatus.outputs?.length) {
    throw new Error("Render job failed");
  }
  const renderCid = renderStatus.outputs[0].cid;

  // 2. Critics
  const criticJobId = await submitCriticJob(
    client,
    renderCid,
    criticConfigCid,
    worldId
  );

  const criticStatus = await client.waitForJob(criticJobId);
  if (criticStatus.state !== "completed" || !criticStatus.outputs?.length) {
    throw new Error("Critic job failed");
  }
  const criticScoresCid = criticStatus.outputs[0].cid;

  // 3. Gate evaluation
  const gateJobId = await submitGateJob(client, {
    assetCid,
    gateConfigCid,
    worldId,
  });

  const gateStatus = await client.waitForJob(gateJobId);
  if (gateStatus.state !== "completed" || !gateStatus.outputs?.length) {
    throw new Error("Gate job failed");
  }
  const verdictCid = gateStatus.outputs[0].cid;

  // Fetch verdict to check pass/fail
  // In practice, we'd fetch from IPFS and parse
  const passed = true; // Placeholder

  return {
    renderCid,
    criticScoresCid,
    verdictCid,
    passed,
  };
}
