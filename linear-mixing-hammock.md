# Desktop App Modularization Plan

## Overview
Refactor the 2232-line monolithic App.tsx into a maintainable, modular React application using feature-based architecture, custom hooks, and service abstractions.

## Current State
- Single App.tsx with ~100 state variables
- No component modularization (only WorkcellDetail.tsx exists)
- Direct Tauri IPC calls scattered throughout
- No custom hooks or service layer
- Pure CSS utility-class styling

## Target Architecture

### Folder Structure
```
src/
├── types/           # TypeScript type definitions (domain-based)
├── services/        # Tauri IPC abstraction layer
├── hooks/           # Custom React hooks
├── context/         # React Context providers (AppContext, ServerContext)
├── features/        # Feature modules (projects, terminals, runs, kernel, viewer)
├── components/      # Shared components (layout, ui, shared)
└── utils/           # Utility functions (ansi, tags, formatting, constants)
```

### Key Principles
1. **Feature-based organization**: Group by domain, not by type
2. **Custom hooks for state + effects**: Extract useState/useEffect patterns
3. **Service layer for Tauri IPC**: Type-safe abstraction over invoke()
4. **React Context for global state**: AppContext (nav, error, activeProject), ServerContext
5. **Incremental migration**: One feature at a time, test continuously

## Implementation Phases

### Phase 1: Infrastructure Setup
**Goal**: Create foundation without breaking existing App.tsx

**Steps**:
1. **Setup testing infrastructure**:
   - Add dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitest/ui`, `jsdom`
   - Create `vitest.config.ts` with React Testing Library setup
   - Create test utilities in `src/test/` (renderWithProviders, mockTauriInvoke, etc.)
   - Add test scripts to package.json
2. Create folder structure (types/, services/, hooks/, components/, features/, utils/, test/)
3. Extract all TypeScript types into domain files:
   - `types/project.ts` (ProjectInfo, ServerInfo)
   - `types/terminal.ts` (PtySessionInfo)
   - `types/run.ts` (RunInfo, ArtifactInfo, JobInfo, ActiveJobInfo)
   - `types/kernel.ts` (BeadsIssue, KernelSnapshot, KernelWorkcell, KernelEvent)
   - `types/common.ts` (Nav, ChatMessage)
   - `types/index.ts` (barrel export)
4. Create service layer for all Tauri IPC:
   - `services/projectService.ts` (detectProject, getGlobalEnv, setGlobalEnv)
   - `services/terminalService.ts` (createPty, writePty, killPty, resizePty, listPty)
   - `services/runService.ts` (listRuns, getArtifacts, startJob, killJob, listActiveJobs)
   - `services/kernelService.ts` (kernelSnapshot, beadsInit, createIssue, updateIssue)
   - `services/serverService.ts` (getServerInfo, setServerRoots)
   - `services/index.ts` (barrel export)
   - **Write tests** for each service (mock Tauri invoke)
5. Build utility hooks:
   - `hooks/useLocalStorage.ts` (generic localStorage sync)
   - `hooks/useTauriEvent.ts` (event listener abstraction)
   - `hooks/useInterval.ts` (polling interval hook)
   - **Write tests** for each utility hook
6. Extract utilities:
   - `utils/ansi.ts` (stripAnsi)
   - `utils/tags.ts` (stripEscalationTags, parseTagsInput)
   - `utils/constants.ts` (STORAGE_KEYS, ESCALATION_TAGS)
   - `utils/formatting.ts` (date/time formatters)
   - **Write tests** for utility functions
7. Create shared UI components:
   - `components/layout/Panel.tsx`
   - `components/layout/PanelHeader.tsx`
   - `components/layout/SplitView.tsx`
   - `components/ui/Button.tsx`
   - `components/ui/Badge.tsx`
   - `components/ui/Modal.tsx`
   - `components/ui/TextInput.tsx`
   - `components/ui/Textarea.tsx`
   - `components/shared/ErrorBanner.tsx`
   - `components/shared/EmptyState.tsx`
   - **Write tests** for UI components (rendering, props, interactions)

**Deliverable**: Foundation ready with testing infrastructure. App.tsx unchanged but new structure available. Test suite runs successfully.

---

### Phase 2: Viewer Feature (Simplest)
**Goal**: Extract viewer as proof-of-concept

**Steps**:
1. Create `features/viewer/ViewerView.tsx`
2. Extract viewer logic from App.tsx (lines 1981-1998)
3. Update App.tsx to render `{nav === 'viewer' && <ViewerView />}`
4. Write tests for ViewerView component
5. Manual regression test: verify viewer iframe loading works

**Deliverable**: First feature fully modularized. Pattern proven. Tests passing.

---

### Phase 3: Projects Feature
**Goal**: Modularize projects tab

**Steps**:
1. Create `hooks/useProjects.ts` (project list, active project, localStorage sync)
   - Write tests for useProjects hook
2. Create feature components:
   - `features/projects/ProjectsView.tsx` (main container)
   - `features/projects/ProjectList.tsx` (sidebar list)
   - `features/projects/ProjectDetail.tsx` (detail panel)
   - `features/projects/AddProjectModal.tsx`
   - `features/projects/GlobalEnvPanel.tsx`
   - Write tests for each component
3. Replace projects section in App.tsx with `<ProjectsView />`
4. Manual regression tests:
   - Add project via modal
   - Switch active project
   - Remove project
   - Save/clear global env
   - Verify localStorage persistence

**Deliverable**: Projects tab fully modularized. Tests passing.

---

### Phase 4: Terminals Feature
**Goal**: Modularize terminals tab with xterm.js

**Steps**:
1. Create `hooks/useTerminals.ts` (sessions, xterm lifecycle, PTY events)
   - Write tests for useTerminals hook (mock PTY events)
2. Create feature components:
   - `features/terminals/TerminalsView.tsx`
   - `features/terminals/TerminalList.tsx`
   - `features/terminals/TerminalPane.tsx` (xterm.js integration)
   - Write tests for components
3. Replace terminals section in App.tsx
4. Manual regression tests:
   - Create new terminal
   - Type input and see output
   - Resize terminal
   - Kill terminal
   - PTY events (pty_output, pty_exit) working correctly

**Deliverable**: Terminals tab fully modularized. Tests passing.

---

### Phase 5: Runs Feature
**Goal**: Modularize runs tab

**Steps**:
1. Create `hooks/useRuns.ts` (runs, artifacts, job outputs, job events)
   - Write tests for useRuns hook (mock job events)
2. Create feature components:
   - `features/runs/RunsView.tsx`
   - `features/runs/RunList.tsx`
   - `features/runs/RunDetail.tsx`
   - `features/runs/ArtifactList.tsx`
   - `features/runs/ArtifactViewer.tsx`
   - `features/runs/NewRunModal.tsx`
   - Write tests for components
3. Replace runs section in App.tsx
4. Manual regression tests:
   - Create new run via modal
   - View live job output
   - Select run and view artifacts
   - View different artifact types (image, JSON, text, HTML)
   - Job completion updates run list

**Deliverable**: Runs tab fully modularized. Tests passing.

---

### Phase 6: Kernel Feature (Most Complex)
**Goal**: Modularize kernel tab

**Steps**:
1. Create `hooks/useKernel.ts` (snapshot, polling, issue CRUD)
   - Write tests for useKernel hook
2. Create feature components:
   - `features/kernel/KernelView.tsx`
   - `features/kernel/IssueList.tsx` (filterable)
   - `features/kernel/IssueDetail.tsx`
   - `features/kernel/WorkcellList.tsx`
   - `features/kernel/EventsList.tsx`
   - `features/kernel/ChatPanel.tsx`
   - `features/kernel/CreateIssueModal.tsx`
   - `features/kernel/LiveOutputPanel.tsx`
   - Write tests for each component
3. Move `WorkcellDetail.tsx` into `features/kernel/` and integrate
4. Replace kernel section in App.tsx
5. Manual regression tests:
   - Create issue via modal
   - Update issue status/tags/toolchain
   - Filter issues by text/ready/active
   - Run issue once
   - Kernel watch/stop
   - Chat commands (create, issue, tool, kernel)
   - View workcell details
   - Events list updates
   - Auto-refresh polling works

**Deliverable**: Kernel tab fully modularized. Tests passing.

---

### Phase 7: Final Cleanup
**Goal**: Clean up App.tsx to be thin orchestrator

**Steps**:
1. Create `components/layout/Sidebar.tsx`
   - Write tests for Sidebar
2. Create `context/AppContext.tsx` (nav, error, activeProject)
3. Create `context/ServerContext.tsx` (serverInfo, viewerUrl)
4. Refactor App.tsx to use contexts and delegate to feature views
5. Remove all unused state from App.tsx
6. Full regression test suite:
   - All tabs load correctly
   - Navigation between tabs works
   - Error banner displays/dismisses
   - Active project persists across reload
   - Server info loads
7. Run full test suite: `npm test`

**Deliverable**: App.tsx reduced from 2232 lines to ~150 lines. Full test coverage. All features working.

---

## Testing Strategy

### Test Coverage Goals
- **Services**: 100% - all Tauri IPC calls mocked and tested
- **Hooks**: 90%+ - all state logic and side effects tested
- **Utilities**: 100% - pure functions are easy to test
- **Components**: 80%+ - rendering, props, user interactions

### Testing Approach
1. **Unit tests** for services, hooks, utilities
2. **Component tests** for UI components and feature views
3. **Integration tests** for feature workflows (e.g., create issue → update → delete)
4. **Manual regression tests** after each phase
5. **E2E tests** (optional) for critical paths using Tauri's test harness

### Test Utilities
- Mock Tauri `invoke()` and event listeners
- `renderWithProviders()` helper for components using Context
- Shared test fixtures for common data structures
- Custom matchers for Tauri-specific assertions

---

## Success Metrics
- **App.tsx**: <200 lines (reduced from 2232)
- **Max component size**: <300 lines
- **Max hook size**: <150 lines
- **Type coverage**: 100% of Tauri calls typed
- **Test coverage**: >80% overall, 100% for services
- **No regressions**: All existing functionality preserved
- **Test suite**: Runs in <10 seconds

## Critical Files
- `/Users/connor/Medica/glia-fab/apps/glia-fab-desktop/src/App.tsx` (main refactor target)
- `/Users/connor/Medica/glia-fab/apps/glia-fab-desktop/src/WorkcellDetail.tsx` (pattern reference)
- `/Users/connor/Medica/glia-fab/apps/glia-fab-desktop/src/app.css` (preserve utility classes)
- `/Users/connor/Medica/glia-fab/apps/glia-fab-desktop/package.json` (dependencies)

## Risk Mitigation
1. **xterm.js integration**: Isolate in useTerminals hook, test PTY events
2. **State loss**: Migrate one feature at a time, keep App.tsx state until proven
3. **Context performance**: Use multiple small contexts, not one large one
4. **Over-engineering**: Keep it simple - React Context + hooks, no Redux needed
