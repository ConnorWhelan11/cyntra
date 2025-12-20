import { describe, it, expect, beforeEach } from 'vitest';
import { mockTauriInvoke, clearTauriMocks } from '@/test/mockTauri';
import {
  listRuns,
  getArtifacts,
  startJob,
  killJob,
  listActiveJobs,
} from './runService';

describe('runService', () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  describe('listRuns', () => {
    it('should list runs', async () => {
      const runs = [
        { id: 'run-1', dir: '/path/to/run1', modifiedMs: 123456 },
        { id: 'run-2', dir: '/path/to/run2', modifiedMs: 789012 },
      ];
      mockTauriInvoke({ runs_list: runs });

      const result = await listRuns({ projectRoot: '/path/to/project' });

      expect(result).toEqual(runs);
    });
  });

  describe('getArtifacts', () => {
    it('should get artifacts for a run', async () => {
      const artifacts = [
        { relPath: 'output.json', kind: 'json', sizeBytes: 1024, url: '/artifacts/run-1/output.json' },
      ];
      mockTauriInvoke({ run_artifacts: artifacts });

      const result = await getArtifacts({
        projectRoot: '/path/to/project',
        runId: 'run-1',
      });

      expect(result).toEqual(artifacts);
    });
  });

  describe('startJob', () => {
    it('should start a job', async () => {
      const jobInfo = {
        jobId: 'job-1',
        runId: 'run-1',
        runDir: '/path/to/run1',
      };
      mockTauriInvoke({ job_start: jobInfo });

      const result = await startJob({
        projectRoot: '/path/to/project',
        command: 'npm test',
        label: 'test-run',
      });

      expect(result).toEqual(jobInfo);
    });
  });

  describe('killJob', () => {
    it('should kill a job', async () => {
      const invokeMock = mockTauriInvoke({ job_kill: undefined });

      await killJob('job-1');

      expect(invokeMock).toHaveBeenCalledWith('job_kill', {
        params: { jobId: 'job-1' },
      });
    });
  });

  describe('listActiveJobs', () => {
    it('should list active jobs', async () => {
      const activeJobs = [
        {
          jobId: 'job-1',
          runId: 'run-1',
          runDir: '/path/to/run1',
          command: 'npm test',
          startedMs: 123456,
        },
      ];
      mockTauriInvoke({ job_list_active: activeJobs });

      const result = await listActiveJobs();

      expect(result).toEqual(activeJobs);
    });
  });
});
