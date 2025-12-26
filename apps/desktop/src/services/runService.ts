/**
 * Run, artifact, and job-related Tauri IPC service
 */

import { invoke } from '@tauri-apps/api/core';
import type { RunInfo, ArtifactInfo, ArtifactNode, JobInfo, ActiveJobInfo, RunDetails } from '@/types';

export async function listRuns(params: { projectRoot: string }): Promise<RunInfo[]> {
  return invoke<RunInfo[]>('runs_list', { params });
}

export async function getArtifacts(params: {
  projectRoot: string;
  runId: string;
}): Promise<ArtifactInfo[]> {
  return invoke<ArtifactInfo[]>('run_artifacts', { params });
}

export async function getArtifactsTree(params: {
  projectRoot: string;
  runId: string;
}): Promise<ArtifactNode> {
  return invoke<ArtifactNode>('run_artifacts_tree', { params });
}

export async function getRunDetails(params: {
  projectRoot: string;
  runId: string;
}): Promise<RunDetails> {
  return invoke<RunDetails>('run_details', { params });
}

export async function startJob(params: {
  projectRoot: string;
  command: string;
  label: string | null;
}): Promise<JobInfo> {
  return invoke<JobInfo>('job_start', { params });
}

export async function killJob(jobId: string): Promise<void> {
  return invoke('job_kill', { params: { jobId } });
}

export async function listActiveJobs(): Promise<ActiveJobInfo[]> {
  return invoke<ActiveJobInfo[]>('job_list_active');
}

/**
 * Start a playability gate test for a world.
 *
 * @param projectRoot - Path to the project root
 * @param worldId - ID of the world to test
 * @param godotProjectPath - Path to the Godot project (relative to project root)
 * @param gateConfigPath - Path to the gate config YAML (optional, uses default if not provided)
 * @returns JobInfo for the started playability test
 */
export async function startPlayabilityTest(params: {
  projectRoot: string;
  worldId: string;
  godotProjectPath: string;
  gateConfigPath?: string;
}): Promise<JobInfo> {
  const { projectRoot, worldId, godotProjectPath, gateConfigPath } = params;

  // Build the fab-playability command
  const configArg = gateConfigPath
    ? `--config "${gateConfigPath}"`
    : '--config fab/gates/playability_v001.yaml';

  const command = `python -m cyntra.fab.playability_gate "${godotProjectPath}" ${configArg} --world-id "${worldId}"`;

  return invoke<JobInfo>('job_start', {
    params: {
      projectRoot,
      command,
      label: `playability-${worldId}`,
    },
  });
}
