/**
 * Run, artifact, and job-related Tauri IPC service
 */

import { invoke } from '@tauri-apps/api/tauri';
import type { RunInfo, ArtifactInfo, JobInfo, ActiveJobInfo } from '@/types';

export async function listRuns(params: { projectRoot: string }): Promise<RunInfo[]> {
  return invoke<RunInfo[]>('runs_list', { params });
}

export async function getArtifacts(params: {
  projectRoot: string;
  runId: string;
}): Promise<ArtifactInfo[]> {
  return invoke<ArtifactInfo[]>('run_artifacts', { params });
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
