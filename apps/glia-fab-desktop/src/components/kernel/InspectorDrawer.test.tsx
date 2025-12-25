import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { InspectorDrawer } from './InspectorDrawer';
import { mockTauriInvoke, clearTauriMocks } from '@/test/mockTauri';
import type { ConstellationStateReturn } from './useConstellationState';
import type { BeadsIssue, KernelWorkcell, RunDetails } from '@/types';

// Mock constellation state factory
function createMockConstellationState(
  overrides: Partial<ConstellationStateReturn> = {}
): ConstellationStateReturn {
  return {
    // State
    mode: 'browse',
    selectedIssueId: null,
    selectedWorkcellId: null,
    selectedRunId: null,
    hoveredWorkcellId: null,
    filterToolchain: null,
    filterStatus: null,
    timeRange: 'all',
    cameraTarget: null,
    isAnimating: false,
    inspectorOpen: true,
    inspectorTab: 'issue',
    nodes: [],
    edges: [],
    allNodes: [],
    allEdges: [],
    // Derived
    selectedWorkcell: null,
    selectedIssue: null,
    // Actions
    selectIssue: vi.fn(),
    selectWorkcell: vi.fn(),
    selectRun: vi.fn(),
    hoverWorkcell: vi.fn(),
    setMode: vi.fn(),
    setFilterToolchain: vi.fn(),
    setFilterStatus: vi.fn(),
    setTimeRange: vi.fn(),
    flyTo: vi.fn(),
    setAnimating: vi.fn(),
    setInspectorOpen: vi.fn(),
    setInspectorTab: vi.fn(),
    escape: vi.fn(),
    ...overrides,
  } as ConstellationStateReturn;
}

const mockIssue: BeadsIssue = {
  id: 'issue-1',
  title: 'Test Issue',
  description: 'Test description',
  status: 'ready',
  tags: ['feature', 'dk_tool_hint:claude'],
  dkPriority: 'P2',
  dkRisk: 'low',
  dkSize: 'M',
  ready: true,
};

const mockWorkcell: KernelWorkcell = {
  id: 'wc-abc123',
  issueId: 'issue-1',
  toolchain: 'claude',
  proofStatus: 'running',
  speculateTag: null,
  path: '/path/to/workcell',
  progress: 0.5,
  progressStage: 'running',
};

describe('InspectorDrawer', () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  describe('Issue Tab', () => {
    it('should render empty state when no issue selected', () => {
      const state = createMockConstellationState({ inspectorTab: 'issue' });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('Select an issue to inspect')).toBeInTheDocument();
    });

    it('should render issue details when issue is selected', () => {
      const state = createMockConstellationState({
        inspectorTab: 'issue',
        selectedIssueId: 'issue-1',
      });

      render(
        <InspectorDrawer
          state={state}
          issues={[mockIssue]}
          workcells={[mockWorkcell]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('#issue-1')).toBeInTheDocument();
      expect(screen.getByText('Test Issue')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByText('ready')).toBeInTheDocument();
    });
  });

  describe('Workcell Tab', () => {
    it('should render empty state when no workcell selected', () => {
      const state = createMockConstellationState({ inspectorTab: 'workcell' });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('Select a workcell to inspect')).toBeInTheDocument();
    });

    it('should render workcell details when workcell is selected', () => {
      const state = createMockConstellationState({
        inspectorTab: 'workcell',
        selectedWorkcellId: 'wc-abc123',
      });

      render(
        <InspectorDrawer
          state={state}
          issues={[mockIssue]}
          workcells={[mockWorkcell]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('wc-abc123')).toBeInTheDocument();
      expect(screen.getByText('claude')).toBeInTheDocument();
      expect(screen.getByText('/path/to/workcell')).toBeInTheDocument();
    });

    it('should display progress with percentage and stage', () => {
      const state = createMockConstellationState({
        inspectorTab: 'workcell',
        selectedWorkcellId: 'wc-abc123',
      });

      const workcellWithProgress: KernelWorkcell = {
        ...mockWorkcell,
        progress: 0.75,
        progressStage: 'gates',
      };

      render(
        <InspectorDrawer
          state={state}
          issues={[mockIssue]}
          workcells={[workcellWithProgress]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('gates')).toBeInTheDocument();
    });

    it('should display complete progress stage', () => {
      const state = createMockConstellationState({
        inspectorTab: 'workcell',
        selectedWorkcellId: 'wc-abc123',
      });

      const completedWorkcell: KernelWorkcell = {
        ...mockWorkcell,
        progress: 1.0,
        progressStage: 'complete',
        proofStatus: 'passed',
      };

      render(
        <InspectorDrawer
          state={state}
          issues={[mockIssue]}
          workcells={[completedWorkcell]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('complete')).toBeInTheDocument();
    });
  });

  describe('Run Tab', () => {
    it('should render empty state when no run selected', () => {
      const state = createMockConstellationState({ inspectorTab: 'run' });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('No active run')).toBeInTheDocument();
    });

    it('should show loading state while fetching run details', async () => {
      const state = createMockConstellationState({
        inspectorTab: 'run',
        selectedRunId: 'run-123',
      });

      // Mock slow response
      mockTauriInvoke({
        run_details: () => new Promise(() => {}),
      });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId="run-123"
          projectRoot="/path/to/project"
        />
      );

      expect(screen.getByText('Loading run details...')).toBeInTheDocument();
    });

    it('should render run details when loaded', async () => {
      const state = createMockConstellationState({
        inspectorTab: 'run',
        selectedRunId: 'run-abc123',
      });

      const runDetails: RunDetails = {
        id: 'run-abc123',
        projectRoot: '/path/to/project',
        runDir: '/path/to/project/.cyntra/runs/run-abc123',
        command: 'cyntra run --once',
        label: 'Test Run',
        startedMs: 1700000000000,
        endedMs: 1700000060000,
        exitCode: 0,
        durationMs: 60000,
        artifactsCount: 5,
        terminalLogLines: 150,
        issuesProcessed: ['issue-1', 'issue-2'],
        workcellsSpawned: 3,
        gatesPassed: 2,
        gatesFailed: 1,
      };

      mockTauriInvoke({ run_details: runDetails });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId="run-abc123"
          projectRoot="/path/to/project"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('✓ Success')).toBeInTheDocument();
      });

      expect(screen.getByText('Exit: 0')).toBeInTheDocument();
      expect(screen.getByText('Test Run')).toBeInTheDocument();
      expect(screen.getByText('cyntra run --once')).toBeInTheDocument();
      expect(screen.getByText('1m 0s')).toBeInTheDocument();
      expect(screen.getByText('5 files')).toBeInTheDocument();
      expect(screen.getByText('150 log lines')).toBeInTheDocument();
    });

    it('should render failed run state', async () => {
      const state = createMockConstellationState({
        inspectorTab: 'run',
        selectedRunId: 'run-failed',
      });

      const runDetails: RunDetails = {
        id: 'run-failed',
        projectRoot: '/path/to/project',
        runDir: '/path/to/project/.cyntra/runs/run-failed',
        command: 'cyntra run --once',
        label: null,
        startedMs: 1700000000000,
        endedMs: 1700000030000,
        exitCode: 1,
        durationMs: 30000,
        artifactsCount: 0,
        terminalLogLines: 50,
        issuesProcessed: [],
        workcellsSpawned: 1,
        gatesPassed: 0,
        gatesFailed: 1,
      };

      mockTauriInvoke({ run_details: runDetails });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId="run-failed"
          projectRoot="/path/to/project"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('✕ Failed')).toBeInTheDocument();
      });

      expect(screen.getByText('Exit: 1')).toBeInTheDocument();
    });

    it('should render running state when exitCode is null', async () => {
      const state = createMockConstellationState({
        inspectorTab: 'run',
        selectedRunId: 'run-active',
      });

      const runDetails: RunDetails = {
        id: 'run-active',
        projectRoot: '/path/to/project',
        runDir: '/path/to/project/.cyntra/runs/run-active',
        command: 'cyntra run --watch',
        label: 'Watch Mode',
        startedMs: 1700000000000,
        endedMs: null,
        exitCode: null,
        durationMs: null,
        artifactsCount: 2,
        terminalLogLines: 75,
        issuesProcessed: ['issue-1'],
        workcellsSpawned: 2,
        gatesPassed: 1,
        gatesFailed: 0,
      };

      mockTauriInvoke({ run_details: runDetails });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId="run-active"
          projectRoot="/path/to/project"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('⏳ Running')).toBeInTheDocument();
      });
    });

    it('should show error state when run_details fails', async () => {
      const state = createMockConstellationState({
        inspectorTab: 'run',
        selectedRunId: 'run-error',
      });

      mockTauriInvoke({
        run_details: () => Promise.reject(new Error('Run not found')),
      });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId="run-error"
          projectRoot="/path/to/project"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Run not found/)).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should call setInspectorTab when clicking tabs', () => {
      const setInspectorTab = vi.fn();
      const state = createMockConstellationState({
        inspectorTab: 'issue',
        setInspectorTab,
      });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      // Click Workcell tab
      const workcellTab = screen.getByRole('button', { name: /Workcell/i });
      workcellTab.click();

      expect(setInspectorTab).toHaveBeenCalledWith('workcell');

      // Click Run tab
      const runTab = screen.getByRole('button', { name: /Run/i });
      runTab.click();

      expect(setInspectorTab).toHaveBeenCalledWith('run');
    });

    it('should call setInspectorOpen when clicking close button', () => {
      const setInspectorOpen = vi.fn();
      const state = createMockConstellationState({
        inspectorOpen: true,
        setInspectorOpen,
      });

      render(
        <InspectorDrawer
          state={state}
          issues={[]}
          workcells={[]}
          runId={null}
          projectRoot="/path/to/project"
        />
      );

      // Close button has accessible name "✕" with title "Close (Esc)"
      const closeButton = screen.getByRole('button', { name: '✕' });
      closeButton.click();

      expect(setInspectorOpen).toHaveBeenCalledWith(false);
    });
  });
});
