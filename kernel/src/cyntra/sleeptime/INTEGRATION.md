# Sleeptime Integration Guide

This document shows how to wire sleeptime into the kernel scheduler and adapters.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Scheduler                                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ on_workcell_complete() ──► SleeptimeOrchestrator        ││
│  │ on_idle() ──────────────► check triggers, consolidate   ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Sleeptime Pipeline                                          │
│  HistoryIngester → PatternDistiller → MemoryBlockWriter     │
│                  → TrapDetector ─────►                       │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  .cyntra/learned_context/                                    │
│  failure_modes.md | successful_patterns.md | trap_signatures│
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Adapters (Codex, Claude, etc.)                              │
│  inject_learned_context(prompt) ──► augmented prompt         │
└──────────────────────────────────────────────────────────────┘
```

## Step 1: Add Config Section

In `cyntra/kernel/config.py`, add sleeptime to KernelConfig:

```python
from cyntra.sleeptime.config import SleeptimeConfig

@dataclass
class KernelConfig:
    # ... existing fields ...

    # Sleeptime configuration
    sleeptime: SleeptimeConfig = field(default_factory=SleeptimeConfig)

    @classmethod
    def from_dict(cls, data: dict[str, Any], config_path: Path | None = None) -> KernelConfig:
        # ... existing parsing ...

        # Parse sleeptime config
        sleeptime_data = data.get("sleeptime", {})
        sleeptime = SleeptimeConfig.from_dict(sleeptime_data)

        return cls(
            # ... existing fields ...
            sleeptime=sleeptime,
        )
```

## Step 2: Hook into Dispatcher

In `cyntra/kernel/dispatcher.py`:

```python
from cyntra.sleeptime.hooks import on_workcell_complete, inject_learned_context

class Dispatcher:
    async def dispatch(self, issue: Issue) -> DispatchResult:
        # ... existing dispatch logic ...

        try:
            result = await self.run_workcell(issue, workcell)

            # Hook: notify sleeptime of completion
            sleeptime_result = on_workcell_complete(
                self.config,
                success=result.success,
                run_id=result.run_id,
            )
            if sleeptime_result:
                logger.info(
                    f"Sleeptime: {sleeptime_result.patterns_found} patterns, "
                    f"{sleeptime_result.traps_found} traps"
                )

            return result

        except Exception as e:
            # Also notify on failure
            on_workcell_complete(self.config, success=False)
            raise
```

## Step 3: Hook into Runner (Alternative)

If you prefer hooking at the runner level:

```python
# In cyntra/kernel/runner.py

from cyntra.sleeptime.hooks import on_workcell_complete_async

class Runner:
    async def run(self, graph: BeadsGraph) -> RunResult:
        # ... existing run logic ...

        for result in completed_results:
            # Fire-and-forget async consolidation
            asyncio.create_task(
                on_workcell_complete_async(
                    self.config,
                    success=result.success,
                    run_id=result.run_id,
                )
            )
```

## Step 4: Inject Context in Adapters

In each adapter (e.g., `adapters/claude.py`):

```python
from cyntra.sleeptime.context_injector import create_injector

class ClaudeAdapter:
    def __init__(self, config: KernelConfig):
        self.config = config
        self.injector = create_injector(config.repo_root)

    def build_prompt(self, issue: Issue, base_prompt: str) -> str:
        # Inject learned context based on task
        augmented = self.injector.inject(
            base_prompt,
            task_type=self._infer_task_type(issue),
            task_tags=issue.tags,
        )
        return augmented

    def _infer_task_type(self, issue: Issue) -> str:
        if issue.dk_attempts > 0:
            return "repair"
        if "feature" in (issue.tags or []):
            return "new_feature"
        return "general"
```

## Step 5: Idle Monitor in Main Loop

In your main kernel loop:

```python
from cyntra.sleeptime.hooks import on_idle, start_idle_monitor

async def main_loop(config: KernelConfig):
    # Option A: Sync idle check
    while True:
        work = scheduler.get_ready_work()

        if not work:
            # No work available - check sleeptime
            on_idle(config)
            await asyncio.sleep(30)
            continue

        # ... dispatch work ...

    # Option B: Background idle monitor
    asyncio.create_task(
        start_idle_monitor(
            config,
            check_interval=60.0,
            on_consolidation=lambda r: logger.info(f"Idle consolidation: {r}"),
        )
    )
```

## Step 6: Enable in Config

Add to `.cyntra/config.yaml`:

```yaml
sleeptime:
  enabled: true
  triggers:
    on_workcell_complete: 5
    on_idle_seconds: 300
    on_failure_streak: 3
  agent:
    toolchain: claude
    model: haiku
```

## Testing

```python
# test_sleeptime.py
from cyntra.sleeptime import SleeptimeOrchestrator, SleeptimeConfig

def test_consolidation():
    config = SleeptimeConfig()
    orchestrator = SleeptimeOrchestrator(config, repo_root=Path("."))

    # Simulate completions
    for _ in range(5):
        orchestrator.on_workcell_complete(success=True)

    # Should trigger consolidation
    assert orchestrator.state.total_consolidations >= 1
```

## Memory Block Format

Blocks are markdown files optimized for agent consumption:

```markdown
# Failure Modes

## Type Errors

- **Cannot assign None to required field**
  - Frequency: 5
  - Mitigation: Check Optional[] annotations before assignment
  - From: run_001, run_003, run_007

- **Missing import for type hint**
  - Frequency: 3
  - Mitigation: Add `from __future__ import annotations` at top
  - From: run_002, run_005

---

_Last updated: 2024-01-15T10:30:00Z_
```

## Metrics

Track sleeptime effectiveness:

```python
# In observability
def track_sleeptime_metrics(result: ConsolidationResult):
    metrics.gauge("sleeptime.runs_processed", result.runs_processed)
    metrics.gauge("sleeptime.patterns_found", result.patterns_found)
    metrics.gauge("sleeptime.traps_found", result.traps_found)
    metrics.histogram("sleeptime.duration_ms", result.duration_ms)
```
