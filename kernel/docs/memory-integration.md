# Memory System Integration Guide

This guide explains how to integrate the Cyntra Agent Memory System with the kernel and agents.

## Quick Start

### 1. Install Dependencies

```bash
cd kernel
pip install -e ".[memory]"
```

### 2. Initialize Database

Run the migration to create memory tables:

```bash
# Apply migrations
psql $DATABASE_URL -f migrations/001_memory_system.sql
psql $DATABASE_URL -f migrations/002_scoring_function.sql
```

### 3. Configure Memory System

Add to `.cyntra/config.yaml`:

```yaml
memory:
  enabled: true
  database_url: postgresql://user:pass@localhost/cyntra

  # Embedding settings
  embedding_model: all-MiniLM-L6-v2
  embedding_dim: 384

  # Extraction settings
  extraction:
    enabled: true
    min_importance: 0.3
    max_per_run: 10

  # Sleeptime settings
  sleeptime:
    enabled: true
    consolidation_threshold: 0.85
    archival_threshold: 0.001
```

## Integration Points

### 1. Kernel Runner Integration

The memory system integrates at key lifecycle points:

```python
# In kernel/runner.py

class KernelRunner:
    def __init__(self, ...):
        # Initialize memory components
        self.memory_store = MemoryStore(db_url=config.memory.database_url)
        self.memory_handler = MemoryEventHandler(
            store=self.memory_store,
            extractor=MemoryExtractor(...),
            linking_service=LinkingService(...),
            sleeptime_processor=SleeptimeProcessor(...),
        )
        self.event_bus = configure_event_bus(self.memory_handler)

    async def _dispatch_single_async(self, issue):
        # Before dispatch: compose context
        ctx = RunContext(
            agent_id=toolchain,
            run_id=workcell_id,
            issue_id=issue.id,
            issue_title=issue.title,
            issue_tags=issue.tags,
            retry_count=issue.dk_attempts,
        )
        prompt = await self.composer.compose(ctx)

        # Inject into manifest
        manifest["memory_context"] = prompt.to_system_prompt()

        # After dispatch: publish event
        await self.event_bus.publish(RunCompletedEvent.create(
            agent_id=toolchain,
            run_id=workcell_id,
            transcript=telemetry.get_transcript(),
            ...
        ))
```

### 2. Adapter Integration

Each toolchain adapter can use memory context:

```python
# In adapters/claude.py

class ClaudeAdapter(BaseAdapter):
    async def run(self, manifest: dict) -> PatchProof:
        # Get memory context from manifest
        memory_context = manifest.get("memory_context", "")

        # Inject into system prompt
        system_prompt = f"""
{self.base_system_prompt}

{memory_context}
"""

        # Run with enhanced context
        response = await self.client.messages.create(
            system=system_prompt,
            ...
        )
```

### 3. Sleeptime Integration

Trigger sleeptime during idle periods:

```python
# In kernel/runner.py

async def _run_cycle(self):
    work_done = await self._dispatch_work()

    if not work_done and self.config.memory.sleeptime.enabled:
        # Idle - run sleeptime processing
        for agent_id in self.active_agents:
            report = await self.memory_handler.sleeptime_processor.process(
                agent_id=agent_id
            )
            logger.info(f"Sleeptime: {report}")
```

## Event Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Run Starts                                                        │
│    ↓                                                                 │
│    Composer.compose(ctx) → Surfaces relevant memories                │
│    ↓                                                                 │
│    Manifest includes memory_context                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Run Executes                                                      │
│    ↓                                                                 │
│    Agent uses memory context in system prompt                        │
│    ↓                                                                 │
│    Telemetry captures tool usage, outcomes                           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Run Completes                                                     │
│    ↓                                                                 │
│    EventBus.publish(RunCompletedEvent)                               │
│    ↓                                                                 │
│    MemoryEventHandler.handle_run_completed()                         │
│      → Extractor.extract_from_run()                                  │
│      → Store.create_batch()                                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Extraction Completes                                              │
│    ↓                                                                 │
│    EventBus.publish(MemoryExtractionEvent)                           │
│    ↓                                                                 │
│    MemoryEventHandler.handle_extraction_completed()                  │
│      → LinkingService.find_link_candidates()                         │
│      → LinkingService.classify_relationship()                        │
│      → Store.create_link()                                           │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Linking Completes                                                 │
│    ↓                                                                 │
│    Check promotion candidates                                        │
│    ↓                                                                 │
│    CollectiveService.promote_to_collective()                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Sleeptime (during idle)                                           │
│    ↓                                                                 │
│    SleeptimeProcessor.process()                                      │
│      → consolidate_similar_memories()                                │
│      → discover_patterns()                                           │
│      → archive_stale_memories()                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Custom Trinkets

Create custom trinkets to inject domain-specific context:

```python
from cyntra.memory.trinkets.base import AgentTrinket, RunContext

class FabWorldTrinket(AgentTrinket):
    """Inject Fab World-specific knowledge."""

    priority = 75  # After task context, before patterns
    cache_policy = True  # Stable per world

    def __init__(self, store, world_registry):
        self.store = store
        self.world_registry = world_registry

    def get_section_name(self) -> str:
        return "Fab World Context"

    async def generate_content(self, ctx: RunContext) -> str:
        if not ctx.world_name:
            return ""

        world = self.world_registry.get(ctx.world_name)
        if not world:
            return ""

        lines = [
            f"**World**: {world.name}",
            f"**Style**: {world.style_description}",
            f"**Constraints**: {', '.join(world.constraints)}",
        ]

        # Get world-scoped memories
        memories = await self.store.search_by_type(
            agent_id=ctx.agent_id,
            memory_type=MemoryType.CONTEXT,
            scope=MemoryScope.WORLD,
            limit=5,
        )

        if memories:
            lines.append("")
            lines.append("**Previous learnings for this world:**")
            for mem in memories:
                lines.append(f"- {mem.text}")

        return "\n".join(lines)

    async def should_include(self, ctx: RunContext) -> bool:
        return ctx.world_name is not None


# Register and use
from cyntra.memory.composer import TrinketRegistry

TrinketRegistry.register("fab_world", FabWorldTrinket)
```

## Monitoring

### Memory Statistics

```python
# Get memory stats for agent
async def get_memory_stats(store, agent_id):
    async with store.pool.acquire() as conn:
        stats = await conn.fetchrow("""
            SELECT
                COUNT(*) as total_memories,
                COUNT(*) FILTER (WHERE memory_type = 'pattern') as patterns,
                COUNT(*) FILTER (WHERE memory_type = 'failure') as failures,
                COUNT(*) FILTER (WHERE scope = 'collective') as collective,
                AVG(importance_score) as avg_importance,
                SUM(access_count) as total_accesses
            FROM agent_memories
            WHERE agent_id = $1 AND is_archived = FALSE
        """, agent_id)
        return dict(stats)
```

### Sleeptime Reports

```python
# Log sleeptime reports
from cyntra.memory.sleeptime import SleeptimeReport

def log_sleeptime_report(report: SleeptimeReport):
    logger.info(
        "Sleeptime completed",
        duration=report.duration_seconds,
        consolidated=report.memories_consolidated,
        patterns_discovered=report.patterns_discovered,
        archived=report.memories_archived,
        tokens_saved=report.tokens_saved,
    )
```

## Troubleshooting

### Common Issues

**1. Memories not being extracted**

Check extraction configuration:

```python
# Verify min_importance isn't too high
config = ExtractionConfig(min_importance=0.3)

# Check LLM client is configured
assert extractor.llm_client is not None
```

**2. Similarity search returning no results**

Verify embeddings are generated:

```python
# Check if memory has embedding
memory = await store.get(memory_id)
assert memory.embedding is not None
assert len(memory.embedding) == 768
```

**3. Sleeptime not consolidating**

Check similarity threshold:

```python
# Lower threshold if memories aren't similar enough
config = ConsolidationConfig(similarity_threshold=0.80)
```

**4. Memories decaying too fast**

Adjust decay rate:

```python
constants = ScoringConstants(decay_rate=0.01)  # Slower decay
```

### Debug Logging

Enable debug logging for memory system:

```python
import logging
logging.getLogger("cyntra.memory").setLevel(logging.DEBUG)
```

## Performance Considerations

### Embedding Caching

The `VectorOps` class includes LRU caching:

```python
# Embeddings are cached by text hash
vector_ops = VectorOps(cache_size=10000)
```

### Batch Operations

Use batch operations for bulk processing:

```python
# Batch create memories
memory_ids = await store.create_batch(
    memories=extracted_list,
    agent_id="claude",
    embeddings=embedding_list,
)

# Batch embeddings
embeddings = await vector_ops.batch_embeddings(
    texts=["text1", "text2", "text3"],
    batch_size=32,
)
```

### Index Maintenance

Periodically reindex for optimal search:

```sql
-- Rebuild HNSW index
REINDEX INDEX agent_memories_embedding_idx;

-- Vacuum to reclaim space
VACUUM ANALYZE agent_memories;
```

## Migration from claude-mem

If migrating from the simpler claude-mem system:

1. Export existing observations to CSV
2. Transform to ExtractedMemory format
3. Run extraction with `persist_only=True`
4. Generate embeddings in batch
5. Verify search quality
