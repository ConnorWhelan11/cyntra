import { describe, it, expect, beforeEach } from 'vitest';
import { mockTauriInvoke, clearTauriMocks } from '@/test/mockTauri';
import {
  detectProject,
  getGlobalEnv,
  setGlobalEnv,
  clearGlobalEnv,
} from './projectService';

describe('projectService', () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  describe('detectProject', () => {
    it('should detect project info', async () => {
      const mockResponse = {
        root: '/path/to/project',
        viewer_dir: '/path/to/viewer',
        dev_kernel_dir: '/path/to/kernel',
      };
      mockTauriInvoke({ detect_project: mockResponse });

      const result = await detectProject('/path/to/project');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('getGlobalEnv', () => {
    it('should fetch global env', async () => {
      const mockEnv = 'KEY=value\nOTHER=123';
      mockTauriInvoke({ get_global_env: mockEnv });

      const result = await getGlobalEnv();

      expect(result).toBe(mockEnv);
    });

    it('should handle null response', async () => {
      mockTauriInvoke({ get_global_env: null });

      const result = await getGlobalEnv();

      expect(result).toBeNull();
    });
  });

  describe('setGlobalEnv', () => {
    it('should set global env', async () => {
      const invokeMock = mockTauriInvoke({ set_global_env: undefined });

      await setGlobalEnv('KEY=value');

      expect(invokeMock).toHaveBeenCalledWith('set_global_env', {
        params: { text: 'KEY=value' },
      });
    });
  });

  describe('clearGlobalEnv', () => {
    it('should clear global env', async () => {
      const invokeMock = mockTauriInvoke({ clear_global_env: undefined });

      await clearGlobalEnv();

      expect(invokeMock).toHaveBeenCalledWith('clear_global_env');
    });
  });
});
