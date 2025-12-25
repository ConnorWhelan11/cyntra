import { vi } from 'vitest';
import type { Mock } from 'vitest';

/**
 * Mock for Tauri's invoke function
 */
export function mockTauriInvoke(responses: Record<string, any> = {}) {
  const invokeMock = vi.fn().mockImplementation((cmd: string, args?: any) => {
    if (cmd in responses) {
      const response = responses[cmd];
      return typeof response === 'function' ? response(args) : Promise.resolve(response);
    }
    return Promise.reject(new Error(`No mock response for command: ${cmd}`));
  });

  global.__TAURI__ = {
    ...global.__TAURI__,
    invoke: invokeMock as any,
  };

  return invokeMock as Mock;
}

/**
 * Mock for Tauri's event listener
 */
export function mockTauriEvent() {
  const listeners: Record<string, ((payload: any) => void)[]> = {};

  const listenMock = vi.fn().mockImplementation((eventName: string, handler: (event: any) => void) => {
    if (!listeners[eventName]) {
      listeners[eventName] = [];
    }
    listeners[eventName].push(handler);

    // Return unlisten function
    return Promise.resolve(() => {
      const index = listeners[eventName].indexOf(handler);
      if (index > -1) {
        listeners[eventName].splice(index, 1);
      }
    });
  });

  const emit = (eventName: string, payload: any) => {
    if (listeners[eventName]) {
      listeners[eventName].forEach((handler) => handler({ payload }));
    }
  };

  // Preserve existing invoke mock if present
  const existingInvoke = global.__TAURI__?.invoke;

  global.__TAURI__ = {
    ...global.__TAURI__,
    invoke: existingInvoke ?? vi.fn(),
    event: {
      listen: listenMock as any,
      once: vi.fn(),
      emit: vi.fn(),
    },
  };

  return { listenMock, emit };
}

/**
 * Clear all Tauri mocks
 */
export function clearTauriMocks() {
  vi.clearAllMocks();
}
