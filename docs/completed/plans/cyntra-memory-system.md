# Cyntra Memory System Implementation Plan

## Overview

Implement an agent memory system for Cyntra, adapted from Mira OS's battle-tested architecture. This enables agents to learn from runs, share knowledge collectively, and improve over time.

**Source Reference**: `/tmp/mira-oss/` (cloned repository)

**Key Mira Files to Study**:

- `lt_memory/models.py` - Memory data models
- `lt_memory/scoring_formula.sql` - Importance calculation
- `lt_memory/db_access.py` - Database operations
- `lt_memory/extraction.py` - Memory extraction
- `lt_memory/linking.py` - Relationship classification
- `lt_memory/refinement.py` - Consolidation/splitting
- `working_memory/trinkets/base.py` - Trinket base class
- `working_memory/composer.py` - Prompt composition
- `cns/core/events.py` - Event definitions
- `docs/ARCHITECTURE_LT_MEMORY.md` - Full architecture docs
- `docs/MEMORY_LIFECYCLE.md` - Lifecycle operations
- `config/prompts/` - LLM prompts for extraction

---

## Phase 1: Core Data Models

**Goal**: Establish the foundational data structures for agent memory.

### Task 1.1: Create Memory Models

**File**: `kernel/src/cyntra/memory/models.py`

```python
# Models to implement:
- AgentMemory (main memory object)
- MemoryScope (enum: individual, collective, world)
- MemoryType (enum: pattern, failure, dynamic, context, playbook, frontier)
- MemoryLink (relationship between memories)
- LinkType (enum: conflicts, supersedes, causes, instance_of, invalidated_by, motivated_by, improves_on, requires, repairs)
- ExtractedMemory (pre-persistence extraction result)
- ExtractionResult (batch extraction output)
- ConsolidationCluster (for merging similar memories)
```

**Reference**: `/tmp/mira-oss/lt_memory/models.py`

### Task 1.2: Create Memory Events

**File**: `kernel/src/cyntra/memory/events.py`

```python
# Events to implement:
- MemoryEvent (base class)
- RunCompletedEvent (triggers extraction)
- MemoryExtractionEvent (extraction started)
- MemoryLinkingEvent (linking completed)
- PatternDiscoveredEvent (new pattern found)
- DynamicLearnedEvent (behavioral observation)
- MemoryConsolidatedEvent (memories merged)
- PatternPromotedEvent (promoted to collective)
```

**Reference**: `/tmp/mira-oss/cns/core/events.py`

### Task 1.3: Create Database Schema

**File**: `kernel/migrations/001_memory_system.sql`

```sql
-- Tables:
- agent_memories (main storage with pgvector)
- memory_extraction_batches (batch tracking)
- memory_linking_batches (relationship classification tracking)
- agent_activity_counters (track runs per agent for decay)

-- Indexes:
- HNSW index on embeddings for vector search
- Composite indexes for common query patterns
```

**Reference**: `/tmp/mira-oss/deploy/mira_service_schema.sql`

---

## Phase 2: Memory Storage Layer

**Goal**: Implement database operations for memory CRUD.

### Task 2.1: Create Memory Store

**File**: `kernel/src/cyntra/memory/store.py`

```python
class MemoryStore:
    # Core operations:
    async def create(memory: AgentMemory) -> UUID
    async def get(memory_id: UUID) -> AgentMemory
    async def update(memory: AgentMemory) -> None
    async def archive(memory_id: UUID) -> None

    # Search operations:
    async def search_similar(embedding, threshold, limit) -> List[AgentMemory]
    async def search_by_tags(tags, limit) -> List[AgentMemory]
    async def search_by_type(memory_type, agent_id, limit) -> List[AgentMemory]

    # Hub operations (for consolidation):
    async def find_hubs(min_importance, min_access, min_links) -> List[AgentMemory]

    # Activity tracking:
    async def increment_access(memory_id: UUID) -> None
    async def get_agent_run_count(agent_id: str) -> int
    async def increment_agent_runs(agent_id: str) -> int
```

**Reference**: `/tmp/mira-oss/lt_memory/db_access.py`

### Task 2.2: Create Vector Operations

**File**: `kernel/src/cyntra/memory/vector_ops.py`

```python
class VectorOps:
    async def generate_embedding(text: str) -> List[float]
    async def batch_embeddings(texts: List[str]) -> List[List[float]]
    async def cosine_similarity(a: List[float], b: List[float]) -> float
```

**Reference**: `/tmp/mira-oss/lt_memory/vector_ops.py`

---

## Phase 3: Importance Scoring

**Goal**: Implement Mira's decay-based importance calculation.

### Task 3.1: Create Scoring Module

**File**: `kernel/src/cyntra/memory/scoring.py`

```python
def calculate_importance(memory: AgentMemory, current_runs: int) -> float:
    """
    Mira's scoring formula adapted for agent runs:

    1. Value Score = access_count * 0.95^(runs_since_access)
    2. Hub Score = diminishing returns on inbound links
    3. Recency Boost = 1 / (1 + runs_since_access * 0.03)
    4. Type Multiplier = per-memory-type weights

    Final = sigmoid((value + hub) * recency * type_mult)
    """

async def recalculate_all_scores(store: MemoryStore) -> int:
    """Bulk score recalculation for sleeptime."""

async def get_archival_candidates(store: MemoryStore, threshold: float = 0.001) -> List[UUID]:
    """Find memories below archival threshold."""
```

**Reference**: `/tmp/mira-oss/lt_memory/scoring_formula.sql`

### Task 3.2: Create SQL Scoring Function

**File**: `kernel/migrations/002_scoring_function.sql`

Port Mira's `scoring_formula.sql` to work with `agent_memories` table, replacing `activity_days` with `runs_at_creation` / `runs_at_last_access`.

---

## Phase 4: Memory Extraction

**Goal**: Extract discrete memories from completed agent runs.

### Task 4.1: Create Extraction Prompts

**Files**:

- `kernel/src/cyntra/memory/prompts/extraction_system.txt`
- `kernel/src/cyntra/memory/prompts/extraction_user.txt`

Adapt Mira's prompts for agent context:

- Extract patterns (what worked)
- Extract failures (what didn't work and why)
- Extract context (codebase understanding)
- Extract dynamics (behavioral observations)

**Reference**: `/tmp/mira-oss/config/prompts/memory_extraction_*.txt`

### Task 4.2: Create Extraction Engine

**File**: `kernel/src/cyntra/memory/extraction.py`

```python
class MemoryExtractor:
    async def extract_from_run(event: RunCompletedEvent) -> ExtractionResult
    async def deduplicate(memories: List[ExtractedMemory]) -> List[ExtractedMemory]
    async def persist_extracted(memories: List[ExtractedMemory], run_id: str) -> List[UUID]
```

**Reference**: `/tmp/mira-oss/lt_memory/extraction.py`

### Task 4.3: Create Batch Processing

**File**: `kernel/src/cyntra/memory/batching.py`

For handling multiple extractions efficiently:

```python
class ExtractionBatchService:
    async def submit_batch(runs: List[RunCompletedEvent]) -> str
    async def poll_batch(batch_id: str) -> BatchStatus
    async def process_results(batch_id: str) -> List[ExtractedMemory]
```

**Reference**: `/tmp/mira-oss/lt_memory/batching.py`

---

## Phase 5: Relationship Linking

**Goal**: Classify relationships between memories.

### Task 5.1: Create Linking Prompts

**File**: `kernel/src/cyntra/memory/prompts/linking_system.txt`

Prompt for classifying relationship types:

- conflicts, supersedes, causes, instance_of
- invalidated_by, motivated_by
- Agent-specific: improves_on, requires, repairs

**Reference**: `/tmp/mira-oss/config/prompts/memory_relationship_classification.txt`

### Task 5.2: Create Linking Service

**File**: `kernel/src/cyntra/memory/linking.py`

```python
class LinkingService:
    async def find_link_candidates(memory: AgentMemory) -> List[AgentMemory]
    async def classify_relationship(a: AgentMemory, b: AgentMemory) -> Optional[MemoryLink]
    async def create_bidirectional_link(link: MemoryLink) -> None
    async def traverse_related(memory_id: UUID, max_depth: int) -> List[AgentMemory]
    async def heal_dead_links(memory: AgentMemory) -> int
```

**Reference**: `/tmp/mira-oss/lt_memory/linking.py`

---

## Phase 6: Working Memory Trinkets

**Goal**: Dynamic context injection for agent prompts.

### Task 6.1: Create Trinket Base

**File**: `kernel/src/cyntra/memory/trinkets/base.py`

```python
class AgentTrinket(ABC):
    cache_policy: bool = False

    @abstractmethod
    def get_section_name(self) -> str

    @abstractmethod
    async def generate_content(self, ctx: RunContext) -> str

@dataclass
class RunContext:
    agent_id: str
    run_id: str
    issue: Issue
    world_id: Optional[str]
    previous_runs: List[RunSummary]
    current_runs_count: int
```

**Reference**: `/tmp/mira-oss/working_memory/trinkets/base.py`

### Task 6.2: Implement Core Trinkets

**File**: `kernel/src/cyntra/memory/trinkets/task_context.py`

- Injects task-specific context (issue, tags, previous attempts)

**File**: `kernel/src/cyntra/memory/trinkets/patterns.py`

- Surfaces relevant successful patterns via semantic search

**File**: `kernel/src/cyntra/memory/trinkets/dynamics.py`

- Injects learned behavioral dynamics

**File**: `kernel/src/cyntra/memory/trinkets/failures.py`

- Surfaces relevant failure patterns to avoid

**File**: `kernel/src/cyntra/memory/trinkets/codebase.py`

- Injects codebase understanding

**File**: `kernel/src/cyntra/memory/trinkets/playbook.py`

- Injects repair instructions for retries

**Reference**: `/tmp/mira-oss/working_memory/trinkets/*.py`

### Task 6.3: Create Prompt Composer

**File**: `kernel/src/cyntra/memory/composer.py`

```python
class AgentPromptComposer:
    def __init__(self, trinkets: List[AgentTrinket])
    async def compose(self, ctx: RunContext) -> ComposedPrompt

@dataclass
class ComposedPrompt:
    cached_content: str    # Stable sections (prefix caching)
    dynamic_content: str   # Per-run sections
```

**Reference**: `/tmp/mira-oss/working_memory/composer.py`

---

## Phase 7: Memory Surfacing

**Goal**: Retrieve relevant memories for agent runs.

### Task 7.1: Create Surfacing Service

**File**: `kernel/src/cyntra/memory/surfacing.py`

```python
class MemorySurfacingService:
    async def get_relevant_memories(
        issue: Issue,
        agent_id: str,
        limit: int = 20
    ) -> List[AgentMemory]:
        """
        Multi-signal retrieval:
        1. Semantic similarity to task
        2. Tag/label matching
        3. File path matching
        4. Linked memory traversal
        """

    async def generate_fingerprint(issue: Issue) -> Tuple[str, List[float]]:
        """Generate retrieval fingerprint for issue."""

    async def expand_via_links(memories: List[AgentMemory]) -> List[AgentMemory]:
        """Traverse links to find related memories."""
```

**Reference**: `/tmp/mira-oss/cns/services/memory_relevance_service.py`

---

## Phase 8: Collective Memory

**Goal**: Cross-agent knowledge sharing.

### Task 8.1: Create Collective Memory Service

**File**: `kernel/src/cyntra/memory/collective.py`

```python
class CollectiveMemoryService:
    async def promote_to_collective(memory_id: UUID) -> bool:
        """Promote individual memory to collective scope."""

    async def check_promotion_criteria(memory: AgentMemory) -> bool:
        """
        Criteria:
        - Pattern used by 3+ agents
        - High confidence dynamic with large sample
        - Pareto frontier (always collective)
        """

    async def get_collective_patterns(limit: int) -> List[AgentMemory]:
        """Get patterns shared across all agents."""
```

---

## Phase 9: Sleeptime Processing

**Goal**: Background maintenance during kernel idle.

### Task 9.1: Create Sleeptime Processor

**File**: `kernel/src/cyntra/memory/sleeptime.py`

```python
class SleeptimeProcessor:
    async def process(self) -> SleeptimeReport:
        """
        Run all sleeptime operations:
        1. Memory consolidation
        2. Pattern discovery
        3. Dynamics analysis
        4. Score recalculation
        5. Garbage collection
        """

    async def consolidate_similar_memories(self) -> int
    async def discover_patterns(self) -> List[AgentMemory]
    async def analyze_dynamics(self) -> List[AgentMemory]
    async def archive_stale_memories(self) -> int
```

**Reference**: `/tmp/mira-oss/lt_memory/refinement.py`

### Task 9.2: Create Consolidation Handler

**File**: `kernel/src/cyntra/memory/consolidation.py`

```python
class ConsolidationHandler:
    async def find_clusters(self) -> List[ConsolidationCluster]
    async def consolidate_cluster(cluster: ConsolidationCluster) -> AgentMemory
    async def transfer_links(old_ids: List[UUID], new_id: UUID) -> None
```

**Reference**: `/tmp/mira-oss/lt_memory/processing/consolidation_handler.py`

### Task 9.3: Update Sleeptime Skill

**File**: `skills/sleeptime-processor.md`

Update the existing skill to trigger memory processing:

```yaml
# Add to skill steps:
- Trigger memory consolidation
- Run pattern discovery
- Analyze dynamics
- Recalculate scores
- Archive stale memories
```

---

## Phase 10: Kernel Integration

**Goal**: Wire memory system into kernel lifecycle.

### Task 10.1: Update Kernel Runner

**File**: `kernel/src/cyntra/kernel/runner.py`

Add memory integration:

```python
# Before run:
prompt = await self.memory.compose_agent_prompt(agent_id, issue)

# After run:
await self.event_bus.publish(RunCompletedEvent(...))
```

### Task 10.2: Create Event Handlers

**File**: `kernel/src/cyntra/memory/handlers.py`

```python
class MemoryEventHandler:
    async def handle_run_completed(event: RunCompletedEvent):
        """Trigger memory extraction on run completion."""

    async def handle_extraction_completed(event: MemoryExtractionEvent):
        """Trigger linking after extraction."""
```

### Task 10.3: Update pyproject.toml

Add memory dependencies:

```toml
[project.optional-dependencies]
memory = [
    "pgvector>=0.2.0",
    "sentence-transformers>=2.2.0",  # For embeddings
]
```

---

## Phase 11: Testing

**Goal**: Comprehensive test coverage.

### Task 11.1: Unit Tests

**Files**:

- `kernel/tests/memory/test_models.py`
- `kernel/tests/memory/test_scoring.py`
- `kernel/tests/memory/test_store.py`
- `kernel/tests/memory/test_extraction.py`
- `kernel/tests/memory/test_linking.py`
- `kernel/tests/memory/test_trinkets.py`

### Task 11.2: Integration Tests

**Files**:

- `kernel/tests/memory/test_extraction_pipeline.py`
- `kernel/tests/memory/test_surfacing.py`
- `kernel/tests/memory/test_sleeptime.py`

**Reference**: `/tmp/mira-oss/tests/lt_memory/`

---

## Phase 12: Documentation

### Task 12.1: Architecture Doc

**File**: `docs/memory-system.md`

Document:

- Memory model and types
- Scoring formula
- Extraction pipeline
- Trinket system
- Collective memory
- Sleeptime processing

### Task 12.2: Integration Guide

**File**: `docs/memory-integration.md`

How to:

- Configure memory system
- Add custom trinkets
- Tune scoring parameters
- Monitor memory health

---

## Implementation Order

```
Phase 1: Core Data Models          [1 day]
    ├── 1.1 Memory Models
    ├── 1.2 Memory Events
    └── 1.3 Database Schema

Phase 2: Memory Storage            [1 day]
    ├── 2.1 Memory Store
    └── 2.2 Vector Operations

Phase 3: Importance Scoring        [0.5 day]
    ├── 3.1 Scoring Module
    └── 3.2 SQL Function

Phase 4: Memory Extraction         [1.5 days]
    ├── 4.1 Extraction Prompts
    ├── 4.2 Extraction Engine
    └── 4.3 Batch Processing

Phase 5: Relationship Linking      [1 day]
    ├── 5.1 Linking Prompts
    └── 5.2 Linking Service

Phase 6: Working Memory Trinkets   [1.5 days]
    ├── 6.1 Trinket Base
    ├── 6.2 Core Trinkets
    └── 6.3 Prompt Composer

Phase 7: Memory Surfacing          [0.5 day]
    └── 7.1 Surfacing Service

Phase 8: Collective Memory         [0.5 day]
    └── 8.1 Collective Service

Phase 9: Sleeptime Processing      [1 day]
    ├── 9.1 Sleeptime Processor
    ├── 9.2 Consolidation Handler
    └── 9.3 Update Skill

Phase 10: Kernel Integration       [0.5 day]
    ├── 10.1 Update Runner
    ├── 10.2 Event Handlers
    └── 10.3 Dependencies

Phase 11: Testing                  [1 day]
    ├── 11.1 Unit Tests
    └── 11.2 Integration Tests

Phase 12: Documentation            [0.5 day]
    ├── 12.1 Architecture Doc
    └── 12.2 Integration Guide
```

**Total Estimated Effort**: ~10 days

---

## Critical Files Summary

### New Files to Create

```
kernel/src/cyntra/memory/
├── __init__.py
├── models.py              # Phase 1.1
├── events.py              # Phase 1.2
├── store.py               # Phase 2.1
├── vector_ops.py          # Phase 2.2
├── scoring.py             # Phase 3.1
├── extraction.py          # Phase 4.2
├── batching.py            # Phase 4.3
├── linking.py             # Phase 5.2
├── surfacing.py           # Phase 7.1
├── collective.py          # Phase 8.1
├── sleeptime.py           # Phase 9.1
├── consolidation.py       # Phase 9.2
├── handlers.py            # Phase 10.2
├── composer.py            # Phase 6.3
├── trinkets/
│   ├── __init__.py
│   ├── base.py            # Phase 6.1
│   ├── task_context.py    # Phase 6.2
│   ├── patterns.py        # Phase 6.2
│   ├── dynamics.py        # Phase 6.2
│   ├── failures.py        # Phase 6.2
│   ├── codebase.py        # Phase 6.2
│   └── playbook.py        # Phase 6.2
└── prompts/
    ├── extraction_system.txt   # Phase 4.1
    ├── extraction_user.txt     # Phase 4.1
    ├── linking_system.txt      # Phase 5.1
    └── consolidation_system.txt # Phase 9.2

kernel/migrations/
├── 001_memory_system.sql      # Phase 1.3
└── 002_scoring_function.sql   # Phase 3.2

kernel/tests/memory/
├── __init__.py
├── test_models.py         # Phase 11.1
├── test_scoring.py        # Phase 11.1
├── test_store.py          # Phase 11.1
├── test_extraction.py     # Phase 11.1
├── test_linking.py        # Phase 11.1
├── test_trinkets.py       # Phase 11.1
├── test_extraction_pipeline.py  # Phase 11.2
├── test_surfacing.py      # Phase 11.2
└── test_sleeptime.py      # Phase 11.2

docs/
├── memory-system.md       # Phase 12.1
└── memory-integration.md  # Phase 12.2
```

### Files to Modify

```
kernel/src/cyntra/kernel/runner.py    # Phase 10.1
kernel/pyproject.toml                 # Phase 10.3
skills/sleeptime-processor.md                # Phase 9.3
```

---

## Acceptance Criteria

### Phase 1-3: Foundation

- [ ] AgentMemory model matches Mira's Memory structure
- [ ] Database schema deployed with pgvector support
- [ ] Scoring formula produces expected decay curves

### Phase 4-5: Extraction & Linking

- [ ] Memories extracted from completed runs
- [ ] Relationships classified between similar memories
- [ ] Bidirectional links stored correctly

### Phase 6-7: Working Memory

- [ ] Trinkets compose agent prompts dynamically
- [ ] Relevant memories surfaced via semantic search
- [ ] Prefix caching works for stable sections

### Phase 8-9: Collective & Sleeptime

- [ ] Patterns promoted to collective scope
- [ ] Consolidation merges similar memories
- [ ] Sleeptime processor runs without errors

### Phase 10: Integration

- [ ] Kernel uses memory system for runs
- [ ] Events trigger extraction pipeline
- [ ] End-to-end flow works

---

## Notes for Executor

1. **Study Mira first**: The cloned repo at `/tmp/mira-oss/` is essential reference. Read the docs in `docs/` and study the implementation in `lt_memory/`.

2. **Start with models**: Phase 1 establishes the foundation. Get the data models right before proceeding.

3. **Test incrementally**: Each phase should have tests before moving to the next.

4. **Mira prompts are gold**: The prompts in `/tmp/mira-oss/config/prompts/` are battle-tested. Adapt them carefully.

5. **Activity runs, not days**: The key adaptation is replacing calendar-based decay with run-based decay.

6. **Embedding model**: Use the same model as Mira (mdbr-leaf-ir-asym, 768d) or a compatible alternative.
