# Sleeptime Skills - Shared Memory for Cyntra Agents

## Overview

Sleeptime agents run asynchronously between primary task executions to consolidate
"institutional knowledge" from run history. This enables:

- **Cross-agent learning**: Patterns discovered in one workcell benefit all future agents
- **Trap avoidance**: Dynamics-informed warnings prevent repeated failures
- **Context efficiency**: Compressed memory blocks replace verbose context
- **Strategic forgetting**: Outdated patterns are pruned to stay relevant

Architecture inspired by:
- [Letta Sleeptime Compute](https://docs.letta.com/guides/agents/architectures/sleeptime/)
- [claude-mem](https://github.com/thedotmack/claude-mem) progressive disclosure
- [Mem0](https://mem0.ai/) memory consolidation research

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRIMARY AGENT (Workcell)                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Task Execution with Injected Memory Context             │  │
│  │  - Relevant patterns for current task type               │  │
│  │  - Known anti-patterns to avoid                          │  │
│  │  - Repair strategies for likely failures                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ rollout.json
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SLEEPTIME AGENT (Background)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  History    │  │  Pattern    │  │  Memory                 │ │
│  │  Ingestor   │→ │  Extractor  │→ │  Consolidator           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         ↑                                      ↓                │
│  ┌─────────────┐                    ┌─────────────────────────┐ │
│  │  Dynamics   │                    │  Shared Memory Store    │ │
│  │  Trap Det.  │─────────────────→  │  (patterns, traps,      │ │
│  └─────────────┘                    │   repair strategies)    │ │
│                                     └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ context injection
                             ▼
                    Next Primary Agent
```

## Shared Memory Store

Located at `.cyntra/memory/`:

```
.cyntra/memory/
├── observations.db      # SQLite with FTS5 full-text search
├── vectors/             # Chroma for semantic search
├── blocks/              # Consolidated memory blocks (JSON)
│   ├── patterns/        # Successful tool sequences
│   ├── anti_patterns/   # Failure modes to avoid
│   ├── repair/          # Fix strategies by fail code
│   ├── traps/           # States to avoid from dynamics
│   └── domain/          # Domain-specific knowledge
└── sessions/            # Per-workcell session summaries
```

## Memory Block Types

| Type | Description | Example |
|------|-------------|---------|
| `pattern` | Successful tool sequences | "Missing texture → bake --auto-resolve" |
| `anti_pattern` | Failure modes to avoid | "Don't call ruff before writing tests" |
| `repair` | Fix strategies by fail code | "GEOMETRY_DEGENERATE → mesh cleanup" |
| `trap` | States to avoid (from dynamics) | "Low action + no ΔV in lint loop" |
| `domain` | Domain knowledge | "Godot needs exactly 1 SPAWN_PLAYER" |

## Skills

| Skill | Purpose | Trigger |
|-------|---------|---------|
| `history-ingestor` | Process rollouts → observations | After workcell completion |
| `pattern-extractor` | Find successful sequences | Periodic / on demand |
| `memory-consolidator` | Compress into blocks | Periodic consolidation |
| `trap-detector` | Flag stuck states | After dynamics report |
| `context-injector` | Prepare context for prompts | Before workcell creation |
| `memory-search` | Query memory store | On demand |
| `strategic-forgetter` | Prune stale memories | Periodic maintenance |

## Progressive Disclosure (3 Layers)

1. **Index**: Block titles + relevance scores (injected at session start)
2. **Summary**: Block content + tool sequences (fetched on demand)
3. **Evidence**: Source rollouts + observations (deep dive)

## Integration Points

- **Rollout Builder** → History Ingestor
- **Dynamics Report** → Trap Detector
- **Workcell Creation** → Context Injector
- **Prompt Evolution** → Pattern Search

## Configuration

```yaml
# .cyntra/config.yaml
sleeptime:
  enabled: true
  memory_path: .cyntra/memory
  injection:
    max_tokens: 2000
    max_blocks: 10
  consolidation:
    min_observations: 3
    confidence_threshold: 0.7
```
