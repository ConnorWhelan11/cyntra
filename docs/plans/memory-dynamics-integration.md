# Memory Hooks + Dynamics-Driven Routing Implementation Plan

## Overview

Wire the memory system into the kernel lifecycle so every workcell captures observations and injects learned context. Then enhance routing to use dynamics transition data for probability-based toolchain selection.

## Current State

**Infrastructure exists but not wired:**
- `cyntra/memory/` - MemoryDB, MemoryHooks, Observation types
- `cyntra/dynamics/` - TransitionDB, state_t1, potential estimation, action metrics
- `cyntra/sleeptime/` - SleeptimeOrchestrator, consolidation pipeline
- `cyntra/hooks/` - HookRunner, registry, POST_EXECUTION trigger

**Missing:**
- Memory hooks not called during workcell lifecycle
- No telemetry parsing for tool_use observations
- Routing doesn't query dynamics DB
- Transitions not persisted after workcell completion
- Sleeptime not triggered from kernel loop

---

## Phase A: Wire Memory Into Kernel

### A1. Memory Integration Layer

**New file:** `cyntra-kernel/src/cyntra/kernel/memory_integration.py`

Purpose: Bridge between kernel lifecycle and MemoryHooks, handle telemetry parsing.

```python
class KernelMemoryBridge:
    """Integrates memory hooks with kernel lifecycle."""

    def __init__(self, db_path: Path | None = None):
        self.hooks = MemoryHooks(db_path)
        self._active_sessions: dict[str, str] = {}  # workcell_id -> session_id

    def on_workcell_start(
        self,
        workcell_id: str,
        issue: Issue,
        manifest: dict,
    ) -> dict[str, Any]:
        """Called before dispatch. Returns context for injection."""
        context = self.hooks.workcell_start(
            workcell_id=workcell_id,
            issue_id=str(issue.id),
            domain=self._infer_domain(manifest),
            job_type=manifest.get("job_type", "code"),
            toolchain=manifest.get("toolchain"),
        )
        self._active_sessions[workcell_id] = self.hooks._session_id
        return context

    def on_dispatch_complete(
        self,
        workcell_id: str,
        workcell_path: Path,
        proof: PatchProof,
    ) -> None:
        """Called after adapter execution. Parses telemetry."""
        # Parse telemetry.jsonl for tool observations
        telemetry_path = workcell_path / "telemetry.jsonl"
        if telemetry_path.exists():
            self._ingest_telemetry(telemetry_path)

    def on_gate_result(
        self,
        gate_name: str,
        passed: bool,
        score: float | None = None,
        fail_codes: list[str] | None = None,
    ) -> None:
        """Called for each gate result from verifier."""
        self.hooks.gate_result(
            gate_name=gate_name,
            passed=passed,
            score=score,
            fail_codes=fail_codes,
        )

    def on_workcell_end(
        self,
        workcell_id: str,
        status: str,
    ) -> dict[str, Any]:
        """Called at end of workcell lifecycle."""
        result = self.hooks.workcell_end(status=status)
        self._active_sessions.pop(workcell_id, None)
        return result

    def _ingest_telemetry(self, telemetry_path: Path) -> None:
        """Parse telemetry.jsonl and create tool_use observations."""
        for line in telemetry_path.read_text().splitlines():
            try:
                event = json.loads(line)
                event_type = event.get("event_type", event.get("type"))

                if event_type == "file_write":
                    self.hooks.tool_use(
                        tool_name="Write",
                        tool_args={"path": event.get("path")},
                        result=event.get("result", ""),
                        file_refs=[event.get("path")] if event.get("path") else None,
                    )
                elif event_type == "file_edit":
                    self.hooks.tool_use(
                        tool_name="Edit",
                        tool_args=event.get("args", {}),
                        file_refs=[event.get("path")] if event.get("path") else None,
                    )
                elif event_type == "bash_command":
                    self.hooks.tool_use(
                        tool_name="Bash",
                        tool_args={"command": event.get("command")},
                        result=event.get("output", "")[:500],
                    )
                elif event_type == "tool_call":
                    self.hooks.tool_use(
                        tool_name=event.get("tool", "unknown"),
                        tool_args=event.get("args", {}),
                        result=event.get("result", "")[:500],
                    )
            except (json.JSONDecodeError, KeyError):
                continue

    def _infer_domain(self, manifest: dict) -> str:
        job_type = manifest.get("job_type", "code")
        if "fab" in job_type:
            return "fab_asset" if "asset" in job_type else "fab_world"
        return "code"
```

### A2. Modify Runner

**File:** `cyntra-kernel/src/cyntra/kernel/runner.py`

**Changes:**

1. Import and instantiate KernelMemoryBridge
2. Call `on_workcell_start()` before dispatch
3. Pass memory context to dispatcher
4. Call `on_dispatch_complete()` after adapter execution
5. Call `on_gate_result()` for each gate in verification
6. Call `on_workcell_end()` at cycle completion
7. Trigger sleeptime check after N completions

```python
# In KernelRunner.__init__():
from cyntra.kernel.memory_integration import KernelMemoryBridge
from cyntra.sleeptime import SleeptimeOrchestrator, SleeptimeConfig

self.memory_bridge = KernelMemoryBridge(
    db_path=self.repo_root / ".cyntra" / "memory" / "cyntra-mem.db"
)
self.sleeptime = SleeptimeOrchestrator(
    config=SleeptimeConfig(),
    repo_root=self.repo_root,
)

# In _run_cycle() or dispatch loop:
async def _dispatch_with_memory(self, issue: Issue, workcell_path: Path) -> DispatchResult:
    workcell_id = workcell_path.name
    manifest = self._build_manifest(issue)

    # 1. Memory: workcell start
    memory_context = self.memory_bridge.on_workcell_start(
        workcell_id=workcell_id,
        issue=issue,
        manifest=manifest,
    )
    manifest["memory_context"] = memory_context

    # 2. Dispatch to adapter
    result = await self.dispatcher.dispatch_async(issue, workcell_path, manifest)

    # 3. Memory: parse telemetry
    self.memory_bridge.on_dispatch_complete(
        workcell_id=workcell_id,
        workcell_path=workcell_path,
        proof=result.proof,
    )

    # 4. Verify gates
    verification = await self.verifier.verify(result.proof, workcell_path)

    # 5. Memory: gate results
    for gate_name, gate_result in verification.get("gates", {}).items():
        self.memory_bridge.on_gate_result(
            gate_name=gate_name,
            passed=gate_result.get("passed", False),
            score=gate_result.get("score"),
            fail_codes=gate_result.get("fail_codes", []),
        )

    # 6. Memory: workcell end
    status = "success" if verification.get("all_passed") else "failed"
    self.memory_bridge.on_workcell_end(workcell_id, status)

    # 7. Sleeptime check
    self.sleeptime.on_workcell_complete(success=(status == "success"))

    return result
```

### A3. Modify Dispatcher

**File:** `cyntra-kernel/src/cyntra/kernel/dispatcher.py`

**Changes:**

1. Accept `manifest` parameter with `memory_context`
2. Pass context to adapter (adapters can inject into prompt)

```python
async def dispatch_async(
    self,
    issue: Issue,
    workcell_path: Path,
    manifest: dict | None = None,  # NEW: accept pre-built manifest
) -> DispatchResult:
    if manifest is None:
        manifest = self._build_manifest(issue)

    # memory_context is now in manifest for adapter use
    # Adapters can extract manifest["memory_context"] and inject into prompt
```

### A4. Adapter Context Injection

**File:** `cyntra-kernel/src/cyntra/adapters/claude.py` (example)

**Changes:**

Add memory context injection into system prompt:

```python
def _build_system_prompt(self, manifest: dict) -> str:
    base_prompt = self._load_base_prompt()

    # Inject memory context if available
    memory_context = manifest.get("memory_context", {})
    if memory_context.get("memory_available"):
        patterns = memory_context.get("patterns", [])
        warnings = memory_context.get("warnings", [])

        if patterns or warnings:
            base_prompt += "\n\n## Learned Context\n"

            if warnings:
                base_prompt += "\n### Avoid These Patterns\n"
                for w in warnings[:5]:
                    base_prompt += f"- {w}\n"

            if patterns:
                base_prompt += "\n### Successful Approaches\n"
                for p in patterns[:5]:
                    base_prompt += f"- {p}\n"

    return base_prompt
```

---

## Phase D: Dynamics-Driven Routing

### D1. Dynamics Router

**New file:** `cyntra-kernel/src/cyntra/kernel/dynamics_router.py`

Purpose: Query transition DB to estimate toolchain success probability for current state.

```python
from cyntra.dynamics.transition_db import TransitionDB
from cyntra.dynamics.state_t1 import build_state_t1, hash_state

class DynamicsRouter:
    """Route based on historical transition success rates."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._cache: dict[str, dict[str, float]] = {}  # state_id -> {toolchain: success_rate}
        self._cache_ttl = 300  # seconds
        self._last_refresh = 0

    def get_toolchain_probabilities(
        self,
        domain: str,
        job_type: str,
        features: dict,
    ) -> dict[str, float]:
        """
        Get estimated success probability for each toolchain from current state.

        Returns:
            {toolchain: probability} where probability is based on historical transitions
        """
        # Build current state representation
        current_state = build_state_t1(
            domain=domain,
            job_type=job_type,
            features=features,
            policy_key={},  # Toolchain not yet chosen
        )
        state_id = current_state["state_id"]

        # Check cache
        if state_id in self._cache and time.time() - self._last_refresh < self._cache_ttl:
            return self._cache[state_id]

        # Query dynamics DB
        probabilities = self._query_probabilities(state_id, domain)
        self._cache[state_id] = probabilities
        self._last_refresh = time.time()

        return probabilities

    def _query_probabilities(self, state_id: str, domain: str) -> dict[str, float]:
        """Query transition DB for success rates by toolchain."""
        if not self.db_path.exists():
            return {}

        probabilities = {}

        try:
            db = TransitionDB(self.db_path)

            # Get all transitions from this state (or similar states)
            # For now: exact match. Future: embedding similarity
            conn = db._get_conn()

            rows = conn.execute("""
                SELECT
                    t.action_label,
                    s2.metadata,
                    COUNT(*) as count
                FROM transitions t
                JOIN states s1 ON t.from_state = s1.id
                JOIN states s2 ON t.to_state = s2.id
                WHERE s1.id = ? OR s1.metadata LIKE ?
                GROUP BY t.action_label, s2.metadata
            """, (state_id, f'%"domain":"{domain}"%')).fetchall()

            # Aggregate by toolchain
            toolchain_outcomes: dict[str, dict[str, int]] = {}

            for row in rows:
                action = row[0]  # e.g., "toolchain:claude"
                to_meta = json.loads(row[1]) if row[1] else {}
                count = row[2]

                # Extract toolchain from action label
                if action.startswith("toolchain:"):
                    toolchain = action.split(":")[1]
                else:
                    continue

                if toolchain not in toolchain_outcomes:
                    toolchain_outcomes[toolchain] = {"success": 0, "total": 0}

                toolchain_outcomes[toolchain]["total"] += count

                # Check if destination state is success
                to_phase = to_meta.get("features", {}).get("phase", "")
                if to_phase in ("merge", "verified", "success"):
                    toolchain_outcomes[toolchain]["success"] += count

            # Calculate probabilities
            for toolchain, outcomes in toolchain_outcomes.items():
                if outcomes["total"] > 0:
                    probabilities[toolchain] = outcomes["success"] / outcomes["total"]

            db.close()

        except Exception as e:
            logger.warning(f"Dynamics query failed: {e}")

        return probabilities

    def rank_toolchains(
        self,
        candidates: list[str],
        domain: str,
        job_type: str,
        features: dict,
        exploration_rate: float = 0.1,
    ) -> list[tuple[str, float]]:
        """
        Rank toolchain candidates by estimated success probability.

        Args:
            candidates: Available toolchains
            domain: Current domain
            job_type: Job type
            features: State features
            exploration_rate: Probability of choosing random toolchain

        Returns:
            [(toolchain, probability), ...] sorted by probability descending
        """
        probabilities = self.get_toolchain_probabilities(domain, job_type, features)

        # Add small prior for unseen toolchains (exploration)
        ranked = []
        for tc in candidates:
            prob = probabilities.get(tc, 0.5)  # Default 50% for unknown

            # Add exploration bonus for rarely-tried toolchains
            if tc not in probabilities:
                prob += exploration_rate

            ranked.append((tc, prob))

        # Sort by probability
        ranked.sort(key=lambda x: x[1], reverse=True)

        return ranked
```

### D2. Modify Routing

**File:** `cyntra-kernel/src/cyntra/kernel/routing.py`

**Changes:**

1. Accept optional DynamicsRouter
2. Query dynamics before falling back to static rules
3. Blend static priority with empirical probability

```python
def ordered_toolchain_candidates(
    config: KernelConfig,
    issue: Issue,
    dynamics_router: DynamicsRouter | None = None,
    state_features: dict | None = None,
) -> list[str]:
    """
    Get ordered list of toolchain candidates.

    If dynamics_router provided, blend static rules with empirical success rates.
    """
    # 1. Check explicit hint (highest priority)
    if issue.dk_tool_hint:
        return [issue.dk_tool_hint]

    # 2. Static rule matching
    static_candidates = _match_static_rules(config, issue)

    # 3. If no dynamics, return static order
    if dynamics_router is None or state_features is None:
        return static_candidates or config.toolchain_priority

    # 4. Get dynamics-based ranking
    domain = _infer_domain(issue)
    job_type = _infer_job_type(issue)

    dynamics_ranked = dynamics_router.rank_toolchains(
        candidates=static_candidates or config.toolchain_priority,
        domain=domain,
        job_type=job_type,
        features=state_features,
    )

    # 5. Blend: dynamics first, then static fallbacks
    seen = set()
    blended = []

    # Add dynamics-ranked candidates
    for tc, prob in dynamics_ranked:
        if tc not in seen:
            blended.append(tc)
            seen.add(tc)

    # Add remaining static candidates
    for tc in static_candidates or config.toolchain_priority:
        if tc not in seen:
            blended.append(tc)
            seen.add(tc)

    return blended
```

### D3. Transition Persistence

**File:** `cyntra-kernel/src/cyntra/kernel/runner.py`

**Changes:**

After workcell completes, build and persist transitions:

```python
from cyntra.dynamics.transition_logger import TransitionBuilder
from cyntra.dynamics.transition_db import TransitionDB

# After dispatch completes:
def _persist_transition(self, workcell_path: Path) -> None:
    """Build and persist state transitions from workcell execution."""
    try:
        builder = TransitionBuilder()
        transitions = builder.build_transitions(workcell_path)

        if transitions:
            db = TransitionDB(self.repo_root / ".cyntra" / "dynamics" / "cyntra.db")
            for transition in transitions:
                db.insert_transition(
                    from_state=transition["from_state"],
                    to_state=transition["to_state"],
                    action_label=transition["action"],
                    metadata=transition.get("metadata"),
                )
            db.close()

    except Exception as e:
        logger.warning(f"Failed to persist transition: {e}")
```

### D4. Sleeptime Dynamics Integration

**File:** `cyntra-kernel/src/cyntra/sleeptime/orchestrator.py`

**Changes:**

After consolidation, update exploration controller based on trap detection:

```python
def consolidate(self) -> ConsolidationResult:
    # ... existing consolidation logic ...

    # After trap detection:
    if traps:
        self._adjust_exploration(traps, action_summary)

    return result

def _adjust_exploration(self, traps: list, action_summary: dict) -> None:
    """Adjust kernel exploration based on trap detection."""
    global_action_rate = action_summary.get("global_action_rate", 0.5)

    if global_action_rate < 0.2:
        # System is stuck - increase exploration
        logger.warning(
            "Low action rate detected, recommending exploration increase",
            action_rate=global_action_rate,
            trap_count=len(traps),
        )

        # Write recommendation to config overlay
        overlay_path = self.repo_root / ".cyntra" / "exploration_overlay.json"
        overlay = {
            "temperature_boost": 0.1,
            "parallelism_boost": 1,
            "recommended_at": datetime.now(timezone.utc).isoformat(),
            "reason": f"Low action rate ({global_action_rate:.2f}), {len(traps)} traps",
        }
        overlay_path.write_text(json.dumps(overlay, indent=2))
```

---

## Implementation Order

### Week 1: Memory Wiring

1. **A1**: Create `memory_integration.py` with KernelMemoryBridge
2. **A2**: Modify `runner.py` to call memory hooks at lifecycle points
3. **A3**: Modify `dispatcher.py` to accept manifest with memory context
4. **A4**: Add context injection to Claude adapter (example)
5. **Test**: Run kernel, verify observations appear in `.cyntra/memory/cyntra-mem.db`

### Week 2: Dynamics Routing

1. **D1**: Create `dynamics_router.py` with probability queries
2. **D2**: Modify `routing.py` to blend static rules with dynamics
3. **D3**: Add transition persistence to runner
4. **D4**: Wire sleeptime exploration adjustment
5. **Test**: Run kernel with multiple toolchains, verify routing adapts

### Week 3: Testing & Polish

1. Unit tests for KernelMemoryBridge
2. Unit tests for DynamicsRouter
3. Integration test: full cycle with memory + dynamics
4. Logging and observability
5. Config options for enabling/disabling

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `kernel/memory_integration.py` | **NEW** | Bridge class for memory hooks |
| `kernel/dynamics_router.py` | **NEW** | Probability-based routing |
| `kernel/runner.py` | MODIFY | Add memory/dynamics calls |
| `kernel/dispatcher.py` | MODIFY | Accept manifest with context |
| `kernel/routing.py` | MODIFY | Blend static + dynamics |
| `adapters/claude.py` | MODIFY | Inject memory context |
| `sleeptime/orchestrator.py` | MODIFY | Exploration adjustment |

---

## Success Criteria

1. **Memory working**: After 10 workcell completions, `.cyntra/memory/cyntra-mem.db` contains:
   - 10+ sessions
   - 50+ observations (tool uses, gate results)
   - 10+ summaries with patterns

2. **Dynamics routing working**: After 20 completions with multiple toolchains:
   - `.cyntra/dynamics/cyntra.db` contains transitions
   - Routing prefers toolchains with higher historical success
   - New toolchains get exploration tries

3. **Sleeptime triggers**: Consolidation runs after configured threshold:
   - Patterns extracted from run summaries
   - Traps detected from dynamics
   - Memory blocks updated in `.cyntra/learned_context/`
