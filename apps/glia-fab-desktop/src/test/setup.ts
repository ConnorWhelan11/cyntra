import * as React from 'react';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

vi.mock('@oos/ui', () => {
  function Button({ children, variant, ...props }: any) {
    return React.createElement(
      'button',
      { ...props, 'data-variant': variant },
      children
    );
  }

  function Badge({ children, variant, ...props }: any) {
    return React.createElement('span', { ...props, 'data-variant': variant }, children);
  }

  function Dialog({ open, onOpenChange, children }: any) {
    if (!open) return null;

    return React.createElement(
      'div',
      { 'data-testid': 'dialog-root' },
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'dialog-close',
            onClick: () => onOpenChange?.(false),
          },
          'Close'
        ),
        children
      )
    );
  }

  function DialogContent({ children, ...props }: any) {
    return React.createElement('div', { ...props, 'data-testid': 'dialog-content' }, children);
  }

  function DialogHeader({ children, ...props }: any) {
    return React.createElement('div', props, children);
  }

  function DialogTitle({ children, ...props }: any) {
    return React.createElement('div', props, children);
  }

  function Input(props: any) {
    return React.createElement('input', props);
  }

  function Textarea(props: any) {
    return React.createElement('textarea', props);
  }

  return {
    Button,
    Badge,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Input,
    Textarea,
  };
});

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: (...args: any[]) => {
      const tauri = (globalThis as any).__TAURI__;
      if (!tauri || typeof tauri.invoke !== 'function') {
        return Promise.reject(new Error('Missing test mock for __TAURI__.invoke'));
      }
      return tauri.invoke(...args);
    },
  };
});

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: (...args: any[]) => {
      const tauri = (globalThis as any).__TAURI__;
      if (!tauri?.event || typeof tauri.event.listen !== 'function') {
        return Promise.reject(new Error('Missing test mock for __TAURI__.event.listen'));
      }
      return tauri.event.listen(...args);
    },
  };
});

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock Tauri APIs globally
global.__TAURI__ = {
  invoke: vi.fn(),
  event: {
    listen: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
  },
} as any;

// Mock window.matchMedia (used by some components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});
