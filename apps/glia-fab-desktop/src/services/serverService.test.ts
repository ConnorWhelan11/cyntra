import { describe, it, expect, beforeEach } from 'vitest';
import { mockTauriInvoke, clearTauriMocks } from '@/test/mockTauri';
import { getServerInfo, setServerRoots } from './serverService';

describe('serverService', () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  describe('getServerInfo', () => {
    it('should fetch server info', async () => {
      const mockResponse = { base_url: 'http://localhost:8080' };
      mockTauriInvoke({ get_server_info: mockResponse });

      const result = await getServerInfo();

      expect(result).toEqual(mockResponse);
    });
  });

  describe('setServerRoots', () => {
    it('should set server roots', async () => {
      const invokeMock = mockTauriInvoke({ set_server_roots: undefined });

      await setServerRoots({
        viewerDir: '/path/to/viewer',
        projectRoot: '/path/to/project',
      });

      expect(invokeMock).toHaveBeenCalledWith('set_server_roots', {
        params: {
          viewerDir: '/path/to/viewer',
          projectRoot: '/path/to/project',
        },
      });
    });
  });
});
