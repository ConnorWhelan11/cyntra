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

export interface ArtifactNode {
  name: string;
  relPath: string;
  isDir: boolean;
  kind: string;
  sizeBytes: number;
  url: string | null;
  children: ArtifactNode[];
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

export interface RunDetails {
  id: string;
  projectRoot: string;
  runDir: string;
  command: string;
  label: string | null;
  startedMs: number | null;
  endedMs: number | null;
  exitCode: number | null;
  durationMs: number | null;
  artifactsCount: number;
  terminalLogLines: number;
  issuesProcessed: string[];
  workcellsSpawned: number;
  gatesPassed: number;
  gatesFailed: number;
}
