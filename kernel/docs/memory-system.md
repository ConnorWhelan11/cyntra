# Cyntra Agent Memory System

## Overview

The Cyntra Agent Memory System provides persistent learning capabilities for toolchain agents (Claude, Codex, OpenCode, Crush). Built on Mira OS's battle-tested LT_Memory architecture, it enables agents to:

- **Learn from runs**: Extract patterns, failures, and dynamics from execution history
- **Share knowledge**: Promote validated patterns to collective scope for cross-agent learning
- **Surface context**: Inject relevant memories into agent prompts via trinkets
- **Maintain quality**: Run sleeptime consolidation to reduce redundancy and decay stale memories

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Kernel Runner                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Dispatcher   │→ │ Workcell     │→ │ Verifier                 │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Events
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Memory Event Handlers                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ Extraction  │→ │ Linking     │→ │ Sleeptime   │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Memory Store                                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL + pgvector                                          │ │
│  │  - agent_memories (768d embeddings, HNSW index)                 │ │
│  │  - agent_activity_counters (run-based decay)                    │ │
│  │  - extraction_batches, linking_batches                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Memory Types

| Type       | Description                       | Example                                                |
| ---------- | --------------------------------- | ------------------------------------------------------ |
| `PATTERN`  | Successful approaches that worked | "When fixing import errors, check `__init__.py` first" |
| `FAILURE`  | Anti-patterns to avoid            | "Don't modify `.env` without backup"                   |
| `DYNAMIC`  | Behavioral observations           | "API tests typically need 2-3 retry attempts"          |
| `CONTEXT`  | Codebase understanding            | "The `api/` folder uses FastAPI patterns"              |
| `PLAYBOOK` | Repair instructions for retries   | "On GATE_FAILED, check the critic output"              |
| `FRONTIER` | Pareto-optimal solutions          | Quality vs speed tradeoff for render settings          |

### Memory Scopes

| Scope        | Description                  |
| ------------ | ---------------------------- |
| `INDIVIDUAL` | Agent-private memories       |
| `COLLECTIVE` | Cross-agent shared patterns  |
| `WORLD`      | Fab World-specific knowledge |

### Link Types

Memories can be linked to capture relationships:

- `CONFLICTS` - Contradictory information
- `SUPERSEDES` - Newer version of older memory
- `CAUSES` - Causal relationship
- `INSTANCE_OF` - Specific instance of general pattern
- `IMPROVES_ON` - Better approach than linked memory
- `REQUIRES` - Dependency relationship
- `REPAIRS` - Fix for a failure pattern

## Run-Based Decay

Unlike calendar-based systems, Cyntra uses **run-based decay** to ensure fair scoring across varying usage patterns:

```python
# Importance formula
importance = sigmoid(
    w_v * value_score +      # Base confidence
    w_h * hub_score +        # Link centrality
    w_m * mention_score +    # Citation count
    w_r * recency_score      # Run-based freshness
) * temporal_multiplier + newness_bonus

# Temporal decay based on runs, not days
runs_since_access = current_runs - runs_at_last_access
temporal_multiplier = exp(-decay_rate * runs_since_access)
```

**Benefits:**

- Vacation-proof: Memories don't decay while kernel is idle
- Fair comparison: All agents use same run-count baseline
- Predictable: Decay is tied to actual usage, not wall-clock time

## Components

### 1. Memory Store (`store.py`)

PostgreSQL-backed storage with pgvector for embeddings:

```python
from cyntra.memory.store import MemoryStore

store = MemoryStore(db_url="postgresql://...")
await store.initialize()

# Create memory
memory_id = await store.create(
    memory=extracted_memory,
    agent_id="claude",
    embedding=vector,
)

# Similarity search
results = await store.search_similar(
    embedding=query_vector,
    agent_id="claude",
    limit=10,
    similarity_threshold=0.7,
)
```

### 2. Memory Extraction (`extraction.py`)

LLM-powered extraction from run transcripts:

```python
from cyntra.memory.extraction import MemoryExtractor

extractor = MemoryExtractor(
    llm_client=anthropic_client,
    store=memory_store,
    vector_ops=vector_ops,
)

memories = await extractor.extract_from_run(
    run_id="run-123",
    agent_id="claude",
    transcript=conversation_text,
    issue_tags=["bug", "api"],
)
```

### 3. Working Memory Trinkets (`trinkets/`)

Dynamic context injection for agent prompts:

```python
from cyntra.memory.composer import create_composer

composer = create_composer(
    store=memory_store,
    vector_ops=vector_ops,
    base_prompt="You are a helpful assistant.",
)

ctx = RunContext(
    agent_id="claude",
    run_id="run-123",
    issue_title="Fix API errors",
    issue_tags=["api", "bug"],
)

prompt = await composer.compose(ctx)
# prompt.cached_content -> Stable sections (prefix caching)
# prompt.dynamic_content -> Per-run sections
```

**Built-in Trinkets:**

| Trinket              | Purpose                      | Cache Policy |
| -------------------- | ---------------------------- | ------------ |
| `TaskContextTrinket` | Issue details, retry context | Dynamic      |
| `PatternsTrinket`    | Relevant successful patterns | Dynamic      |
| `FailuresTrinket`    | Anti-patterns to avoid       | Dynamic      |
| `DynamicsTrinket`    | Behavioral predictions       | Dynamic      |
| `CodebaseTrinket`    | Repository understanding     | Cached       |
| `PlaybookTrinket`    | Repair instructions          | Cached       |

### 4. Sleeptime Processing (`sleeptime.py`)

Background maintenance during kernel idle:

```python
from cyntra.memory.sleeptime import SleeptimeProcessor

processor = SleeptimeProcessor(
    store=memory_store,
    vector_ops=vector_ops,
    collective_service=collective_service,
)

report = await processor.process(agent_id="claude")
# report.memories_consolidated
# report.patterns_discovered
# report.memories_archived
```

**Operations:**

1. **Consolidation**: Merge similar memories to save tokens
2. **Pattern Discovery**: Promote high-value memories to patterns
3. **Dynamics Analysis**: Extract behavioral observations
4. **Score Recalculation**: Update importance scores
5. **Archival**: Remove stale low-importance memories

### 5. Collective Memory (`collective.py`)

Cross-agent knowledge sharing:

```python
from cyntra.memory.collective import CollectiveMemoryService

collective = CollectiveMemoryService(store=memory_store)

# Promote validated pattern
await collective.promote_to_collective(
    memory_id=pattern_id,
    validation_agents=["claude", "codex", "opencode"],
)

# Get shared patterns
patterns = await collective.get_collective_patterns(limit=20)
```

**Promotion Criteria:**

- Pattern validated by 3+ agents
- High confidence (≥0.8)
- High importance (≥0.6)
- Accessed by multiple agents

## Database Schema

```sql
-- Core memories table
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    memory_type VARCHAR(50) NOT NULL,
    scope VARCHAR(50) DEFAULT 'individual',
    importance_score FLOAT DEFAULT 0.5,
    confidence FLOAT DEFAULT 0.5,

    -- Metadata
    issue_tags TEXT[] DEFAULT '{}',
    file_paths TEXT[] DEFAULT '{}',

    -- Embeddings (pgvector)
    embedding vector(768),

    -- Usage tracking
    access_count INT DEFAULT 0,
    mention_count INT DEFAULT 0,
    runs_at_creation INT NOT NULL,
    runs_at_last_access INT,

    -- Links (JSONB for flexibility)
    inbound_links JSONB DEFAULT '[]',
    outbound_links JSONB DEFAULT '[]',

    -- Lifecycle
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search
CREATE INDEX ON agent_memories
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Run counter per agent
CREATE TABLE agent_activity_counters (
    agent_id VARCHAR(100) PRIMARY KEY,
    run_count INT DEFAULT 0,
    last_run_at TIMESTAMPTZ
);
```

## Configuration

Add to `pyproject.toml`:

```toml
[project.optional-dependencies]
memory = [
    "asyncpg>=0.29.0",
    "pgvector>=0.2.0",
    "sentence-transformers>=2.2.0",
    "anthropic>=0.25.0",
]
```

Environment variables:

```bash
DATABASE_URL=postgresql://user:pass@localhost/cyntra
ANTHROPIC_API_KEY=sk-ant-...  # For extraction/consolidation
```

## Events

The memory system uses domain events for loose coupling:

| Event                     | Trigger           | Handler          |
| ------------------------- | ----------------- | ---------------- |
| `RunCompletedEvent`       | Workcell finishes | Extract memories |
| `MemoryExtractionEvent`   | Extraction done   | Start linking    |
| `MemoryLinkingEvent`      | Linking done      | Check promotion  |
| `SleeptimeCompletedEvent` | Sleeptime done    | Log report       |
| `PatternPromotedEvent`    | Pattern promoted  | Notify agents    |

## Best Practices

### 1. Embedding Model Selection

Use `all-MiniLM-L6-v2` for good balance of speed and quality:

```python
from cyntra.memory.vector_ops import VectorOps

vector_ops = VectorOps(
    model_name="all-MiniLM-L6-v2",  # 384d, fast
    # or "all-mpnet-base-v2"        # 768d, better quality
)
```

### 2. Trinket Priority

Higher priority trinkets appear first in prompts:

```python
class MyTrinket(AgentTrinket):
    priority = 50  # Lower = later in prompt
```

### 3. Sleeptime Scheduling

Run sleeptime during idle periods:

```python
# In kernel runner
if not work_pending:
    await sleeptime_processor.process(agent_id)
```

### 4. Memory Limits

Configure limits to prevent prompt overflow:

```python
from cyntra.memory.composer import ComposerConfig

config = ComposerConfig(
    max_cached_tokens=4000,
    max_dynamic_tokens=2000,
)
```

## Testing

Run memory tests:

```bash
cd kernel
pytest tests/memory/ -v
```

Integration tests require `DATABASE_URL`:

```bash
DATABASE_URL=postgresql://... pytest tests/memory/test_integration.py -v
```
