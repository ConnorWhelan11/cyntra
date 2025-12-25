---
name: memory-block-writer
description: |
  Update shared memory blocks in .cyntra/learned_context/ with distilled patterns.
  Manages block size limits, handles merge strategies, maintains version history.
  
  Memory blocks are markdown files with structured sections that primary agents
  read for context injection.
  
  Use when working on sleeptime tasks.
metadata:
  version: "1.0.0"
  category: "sleeptime"
  priority: "high"
---

# Memory Block Writer

Update shared memory blocks in .cyntra/learned_context/ with distilled patterns.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `block_name` | string | Yes | - | Which memory block to update |
| `new_content` | object | Yes | - | Content to add/update: - section: which section within the block - entries: list of entries to add - metadata: timestamps, source run_ids |
| `merge_strategy` | string | No | dedupe_append | How to merge with existing content |
| `max_block_size` | integer | No | 8000 | Maximum characters per block (older entries pruned) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `updated_block_path` | string | Path to updated block file |
| `block_hash` | string | SHA256 of new block content (for cache invalidation) |
| `entries_added` | integer | Number of new entries added |
| `entries_pruned` | integer | Number of old entries removed to fit limit |
| `block_size_remaining` | integer | Characters remaining before limit |

## Usage

```bash
python scripts/memory-block-writer.py [arguments]
```

## Examples

### Add failure pattern to failure_modes block

**Inputs:**
```yaml
block_name: failure_modes
merge_strategy: dedupe_append
new_content:
  entries:
  - frequency: 5
    mitigation: Check optional fields in Pydantic models before assignment
    signature: Cannot assign None to non-optional field
    source_runs:
    - run_abc
    - run_def
  section: Type Errors
```

---

*Generated from [`skills/sleeptime/memory-block-writer.yaml`](../../skills/sleeptime/memory-block-writer.yaml)*
