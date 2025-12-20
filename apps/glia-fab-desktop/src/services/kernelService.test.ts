import { describe, it, expect, beforeEach } from 'vitest';
import { mockTauriInvoke, clearTauriMocks } from '@/test/mockTauri';
import {
  kernelSnapshot,
  beadsInit,
  createIssue,
  updateIssue,
} from './kernelService';

describe('kernelService', () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  describe('kernelSnapshot', () => {
    it('should fetch kernel snapshot', async () => {
      const snapshot = {
        beadsPresent: true,
        issues: [],
        deps: [],
        workcells: [],
        events: [],
      };
      mockTauriInvoke({ kernel_snapshot: snapshot });

      const result = await kernelSnapshot({
        projectRoot: '/path/to/project',
        limitEvents: 100,
      });

      expect(result).toEqual(snapshot);
    });
  });

  describe('beadsInit', () => {
    it('should initialize beads', async () => {
      const invokeMock = mockTauriInvoke({ beads_init: undefined });

      await beadsInit('/path/to/project');

      expect(invokeMock).toHaveBeenCalledWith('beads_init', {
        params: { projectRoot: '/path/to/project' },
      });
    });
  });

  describe('createIssue', () => {
    it('should create an issue', async () => {
      const issue = {
        id: '1',
        title: 'Test issue',
        status: 'open',
        tags: ['test'],
        ready: false,
      };
      mockTauriInvoke({ beads_create_issue: issue });

      const result = await createIssue({
        projectRoot: '/path/to/project',
        title: 'Test issue',
        description: 'Test description',
        tags: ['test'],
        dkPriority: 'P2',
        dkRisk: 'medium',
        dkSize: 'M',
        dkToolHint: 'codex',
      });

      expect(result).toEqual(issue);
    });
  });

  describe('updateIssue', () => {
    it('should update an issue', async () => {
      const updatedIssue = {
        id: '1',
        title: 'Updated issue',
        status: 'done',
        tags: ['test', 'completed'],
        ready: false,
      };
      mockTauriInvoke({ beads_update_issue: updatedIssue });

      const result = await updateIssue({
        projectRoot: '/path/to/project',
        issueId: '1',
        status: 'done',
        title: 'Updated issue',
      });

      expect(result).toEqual(updatedIssue);
    });
  });
});
