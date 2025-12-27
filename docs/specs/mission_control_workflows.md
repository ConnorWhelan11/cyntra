# Programmable Mission Control (Workflows + Dashboards)

This spec describes a “user-programmable layer” for Mission Control, implemented by embedding
the [Unit](https://github.com/samuelmtimbo/unit) visual programming runtime and shipping a
curated **Cyntra Unit Pack** that exposes Cyntra/Beads data + actions as graph nodes (“units”).

The intent is additive: this layer composes the existing Beads work graph + Cyntra kernel + Fab
pipeline, and provides user-defined dashboards and automations on top.

---

## Goals (V0)

- **Custom dashboards**: user-defined views over `KernelSnapshot` + events (tables, charts, alerts).
- **Local automations**: event-driven or scheduled policies that invoke safe Cyntra/Beads actions.
- **No refactor**: reuse existing Tauri IPC commands/events wherever possible.
- **Auditable**: every automation action is logged (who/what/when) and replayable at the “intent” level.

## Non-goals (V0)

- Headless/background execution while the desktop app is closed.
- Exposing arbitrary shell execution (`job_start`) or PTY control as programmable primitives.
- Replacing Beads as the canonical task graph.

---

## Integration Architecture (proposed)

### High-level

1. Mission Control embeds the Unit runtime in a dedicated route (e.g. **Workflows**).
2. Mission Control boots Unit with:
   - default Unit specs/classes/components, plus
   - **Cyntra Unit Pack** specs/classes/components.
3. Workflows are stored per-project in `<projectRoot>/.cyntra/workflows/`.
4. Workflow graphs call **existing Tauri commands** via dedicated Cyntra units (no generic `invoke`).
5. Streaming units subscribe to **Tauri events** (e.g. `kernel_events`) and push outputs into the graph.

### Where it lives in this repo

Frontend (React/TS):

- `apps/desktop/src/features/workflows/` (route, workflow library UI, editor container)
- `apps/desktop/src/features/workflows/unit/` (Unit boot + bridging)
- `apps/desktop/src/features/workflows/cyntra-unit-pack/`
  - `specs.ts` (id → spec object)
  - `classes.ts` (id → `Holder` subclass for base units)
  - `units/*.ts` (implementations)

Backend (Tauri/Rust):

- Prefer **no changes** for V0: reuse existing commands/events.
- Add only workflow persistence helpers if we want repo-backed workflow files without bundling a
  filesystem plugin:
  - `workflows_list`
  - `workflow_read`
  - `workflow_write`
  - `workflow_delete`

---

## Core Data Contracts (already in Mission Control)

- `KernelSnapshot`: `apps/desktop/src/types/kernel.ts`
  - `issues: BeadsIssue[]`
  - `deps: BeadsDep[]`
  - `workcells: KernelWorkcell[]`
  - `events: KernelEvent[]`
- Runs/artifacts/jobs: `apps/desktop/src/types/run.ts`
- Kernel event stream:
  - Tauri commands: `start_event_watcher`, `stop_event_watcher`
  - Tauri event name: `kernel_events`
  - Payload shape (from Rust): `{ projectRoot, events, offset }`
- Kernel event types (examples): `kernel/src/cyntra/observability/events.py`
  - `"gates.failed"`, `"workcell.failed"`, `"issue.escalated"`, ...

---

## Cyntra Unit Pack v0

### Capabilities model

Each Cyntra-provided unit declares a small set of capabilities. Mission Control prompts on first
run and stores grants locally (per-project, per-workflow). Suggested capability keys:

- `kernel:read` (read `.cyntra/logs/events.jsonl`, `.workcells/*`, snapshot)
- `runs:read` (read `.cyntra/runs/*` artifacts)
- `workcells:read` (read workcell telemetry + info)
- `beads:write` (mutate `.beads/issues.jsonl`)
- `ui:notify` (show in-app notifications)

Deliberately excluded in V0:

- `jobs:run` (arbitrary command execution via `job_start`)
- `pty:control` (interactive shell control)

### Unit naming

Use a stable prefix and category:

- `cyntra.kernel.*`
- `cyntra.runs.*`
- `cyntra.workcells.*`
- `cyntra.beads.*`

### Units (V0 surface)

The table below is the minimal, high-leverage set. “IPC” names refer to existing
Tauri commands/events in `apps/desktop/src-tauri/src/main.rs`.

#### Sources (read-only)

1. `cyntra.project.detect`

- IPC: `detect_project`
- Capability: none
- Inputs:
  - `root: string`
- Outputs:
  - `project: { root: string; viewerDir?: string; cyntraKernelDir?: string; immersaDataDir?: string }`

2. `cyntra.kernel.snapshot`

- IPC: `kernel_snapshot`
- Capability: `kernel:read`
- Inputs:
  - `projectRoot: string`
  - `limitEvents?: number`
- Outputs:
  - `snapshot: KernelSnapshot`

3. `cyntra.kernel.events_stream` (base streaming unit)

- IPC: `start_event_watcher` + `stop_event_watcher` + event `kernel_events`
- Capability: `kernel:read`
- Inputs:
  - `projectRoot: string`
  - `lastOffset?: number` (resume pointer)
- Outputs (iterative):
  - `event: KernelEvent` (emitted once per received event)
  - `offset: number` (latest file offset)

4. `cyntra.runs.list`

- IPC: `runs_list`
- Capability: `runs:read`
- Inputs:
  - `projectRoot: string`
- Outputs:
  - `runs: RunInfo[]`

5. `cyntra.runs.details`

- IPC: `run_details`
- Capability: `runs:read`
- Inputs:
  - `projectRoot: string`
  - `runId: string`
- Outputs:
  - `details: RunDetails`

6. `cyntra.runs.artifacts_tree`

- IPC: `run_artifacts_tree`
- Capability: `runs:read`
- Inputs:
  - `projectRoot: string`
  - `runId: string`
- Outputs:
  - `tree: ArtifactNode`

7. `cyntra.workcells.info`

- IPC: `workcell_get_info`
- Capability: `workcells:read`
- Inputs:
  - `projectRoot: string`
  - `workcellId: string`
- Outputs:
  - `info: { id: string; issueId: string; toolchain?: string|null; created?: string|null; speculateTag?: string|null; hasTelemetry: boolean; hasProof: boolean; hasLogs: boolean }`

8. `cyntra.workcells.telemetry`

- IPC: `workcell_get_telemetry`
- Capability: `workcells:read`
- Inputs:
  - `projectRoot: string`
  - `workcellId: string`
  - `offset?: number`
  - `limit?: number`
- Outputs:
  - `events: Array<{ eventType: string; timestamp: string; data: any }>`

#### Actions (mutating)

9. `cyntra.beads.init`

- IPC: `beads_init`
- Capability: `beads:write`
- Inputs:
  - `projectRoot: string`
- Outputs:
  - `done: any` (ignored by default; useful for sequencing)

10. `cyntra.beads.create_issue`

- IPC: `beads_create_issue`
- Capability: `beads:write`
- Inputs:
  - `projectRoot: string`
  - `title: string`
  - `description?: string`
  - `tags?: string[]`
  - `dkPriority?: string`
  - `dkRisk?: string`
  - `dkSize?: string`
  - `dkToolHint?: string`
  - `dkSpeculate?: boolean`
  - `dkEstimatedTokens?: number`
  - `dkAttempts?: number`
  - `dkMaxAttempts?: number`
- Outputs:
  - `issue: BeadsIssue`

11. `cyntra.beads.update_issue` (base unit)

- IPC: `beads_update_issue`
- Capability: `beads:write`
- Inputs:
  - `projectRoot: string`
  - `issueId: string`
  - `patch: BeadsIssuePatch`
- Outputs:
  - `issue: BeadsIssue`
- Notes:
  - Backend currently can’t reliably “clear” optional fields (e.g. setting `description: null`)
    because Rust uses `Option<String>`; treat `null` as “unset/no-op” for now.

#### Convenience (composite units shipped in the pack)

12. `cyntra.beads.add_tag`

- Built from: `cyntra.beads.update_issue` + core array/object ops
- Capability: `beads:write`
- Inputs:
  - `projectRoot: string`
  - `issue: BeadsIssue`
  - `tag: string`
- Outputs:
  - `issue: BeadsIssue`

13. `cyntra.beads.remove_tag`

- Built from: `cyntra.beads.update_issue`
- Capability: `beads:write`
- Inputs:
  - `projectRoot: string`
  - `issue: BeadsIssue`
  - `tag: string`
- Outputs:
  - `issue: BeadsIssue`

14. `cyntra.beads.restart_issue`

- Mirrors existing UI behavior in `apps/desktop/src/App.tsx`
- Built from: `cyntra.beads.update_issue`
- Capability: `beads:write`
- Inputs:
  - `projectRoot: string`
  - `issue: BeadsIssue`
- Outputs:
  - `issue: BeadsIssue`
- Behavior:
  - sets `status = "ready"`
  - sets `dkAttempts = 0`
  - strips escalation tags (`apps/desktop/src/utils/tags.ts`)

#### UI (optional, but high leverage for dashboards)

15. `cyntra.ui.toast`

- Capability: `ui:notify`
- Inputs:
  - `title: string`
  - `message?: string`
  - `level?: "info"|"warn"|"error"`
- Outputs:
  - `done: any`

---

## Workflow Persistence (per-project)

### File layout

- `<projectRoot>/.cyntra/workflows/`
  - `index.json` (library metadata, optional)
  - `<workflowId>.json` (one file per workflow)

### Workflow file schema (suggested)

```json
{
  "schemaVersion": "0.1",
  "id": "wf_...",
  "name": "Auto-tag gate failures",
  "description": "Tags issues when gates fail",
  "createdAt": "2025-12-27T00:00:00Z",
  "updatedAt": "2025-12-27T00:00:00Z",
  "requires": ["kernel:read", "beads:write"],
  "bundle": {
    "spec": { "... Unit graph spec ..." },
    "specs": { "... Cyntra Unit Pack specs (optional if boot injects them) ..." }
  },
  "state": {
    "kernelEventsOffset": 0
  }
}
```

Notes:

- Store **grants** (user approvals) in Mission Control app state (not in repo) to keep workflows
  shareable without implicitly granting privileges.
- Store **state** (like `kernelEventsOffset`) in the workflow file or in a sibling
  `<workflowId>.state.json` file; V0 can keep it simple.

---

## Permission + Safety Model (V0)

### 1) Capability prompts

On “Enable workflow”, Mission Control:

1. Extracts required capabilities from the workflow metadata or by scanning unit IDs.
2. Prompts the user to grant them.
3. Persists grants locally, scoped to:
   - `(projectRoot, workflowId, capability)`

### 2) Loop prevention

Automations can create feedback loops (event → patch → event). V0 should implement:

- per-unit rate limits (e.g. “no more than N updates per minute”)
- dedupe keys (e.g. `(event.type, issueId, windowStart)`)
- “dry run” mode (log intended actions without executing)

### 3) Audit logging

Every action unit emits a structured kernel event (append-only) to `.cyntra/logs/events.jsonl`:

- `type: "workflow.action"`
- `data: { workflowId, unitId, action, paramsSummary, resultSummary }`

This keeps automation outcomes visible in the existing Constellation/event UIs.

---

## Example Workflows (V0)

### Auto-tag failing issues

Inputs:

- `cyntra.kernel.events_stream(projectRoot)`

Logic:

- filter `event.type == "gates.failed"`
- take `event.issueId`
- set tag `needs-triage`

Action:

- `cyntra.beads.update_issue(projectRoot, issueId, { tags: ... })`

### Escalation watcher

- filter `event.type == "issue.escalated"`
- `cyntra.ui.toast("Escalation", "Issue #... escalated", "warn")`

---

## Future Extensions (post-V0)

- Safe job templates as programmable actions (replace raw `job_start`):
  - `cyntra.jobs.run_template("kernel.run_once", { ... })`
  - `cyntra.jobs.run_template("fab.gate", { assetPath, gateConfig })`
- Background runner (kernel-side or a small daemon) to execute workflows while UI is closed.
- First-class “Dashboard widgets” that match Mission Control’s styling (tables, charts, timelines).
