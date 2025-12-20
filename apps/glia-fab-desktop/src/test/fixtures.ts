/**
 * Test fixtures for common data structures
 * These will be populated as we extract types in the next step
 */

// Will be populated after types are extracted
export const mockProjectInfo = {
  root: '/Users/test/project',
  viewer_dir: '/Users/test/project/fab/outora-library/viewer',
  dev_kernel_dir: '/Users/test/project/dev-kernel',
};

export const mockServerInfo = {
  base_url: 'http://localhost:8080',
};

export const mockPtySessionInfo = {
  id: 'session-123',
  cwd: '/Users/test/project',
  command: 'bash',
};

export const mockRunInfo = {
  id: 'run-123',
  dir: '/Users/test/project/.glia-fab/runs/run-123',
  modifiedMs: Date.now(),
};

export const mockArtifactInfo = {
  relPath: 'output.json',
  kind: 'json',
  sizeBytes: 1024,
  url: '/artifacts/run-123/output.json',
};

export const mockBeadsIssue = {
  id: '1',
  title: 'Test issue',
  status: 'open',
  created: '2025-01-01T00:00:00Z',
  updated: '2025-01-01T00:00:00Z',
  description: 'Test description',
  tags: ['test'],
  dkPriority: 'P2',
  dkRisk: 'medium',
  dkSize: 'M',
  dkToolHint: null,
  dkSpeculate: false,
  dkEstimatedTokens: null,
  dkAttempts: 0,
  dkMaxAttempts: 3,
  ready: true,
};

export const mockKernelSnapshot = {
  beadsPresent: true,
  issues: [mockBeadsIssue],
  deps: [],
  workcells: [],
  events: [],
};
