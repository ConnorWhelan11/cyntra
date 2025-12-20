/**
 * Run, artifact, and job related types
 */

export interface RunInfo {
  id: string;
  dir: string;
  modifiedMs: number | null;
}

export interface ArtifactInfo {
  relPath: string;
  kind: string;
  sizeBytes: number;
  url: string;
}

export interface JobInfo {
  jobId: string;
  runId: string;
  runDir: string;
}

export interface ActiveJobInfo {
  jobId: string;
  runId: string;
  runDir: string;
  command: string;
  startedMs: number;
}
