---
name: genome-mutator
description: |
  Apply structured deltas to prompt YAML, track lineage.
  Mutates prompt genomes for evolution experiments.
  
  Use when working on evolution tasks.
metadata:
  version: "1.0.0"
  category: "evolution"
  priority: "critical"
---

# Genome Mutator

Apply structured deltas to prompt YAML, track lineage.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `genome_path` | string | Yes | - | Path to parent genome YAML |
| `mutation_type` | string | Yes | - | Type of mutation (random, targeted, patch) |
| `mutation_spec` | object | Yes | - | Mutation parameters or patch definition |
| `output_path` | string | Yes | - | Path for mutated genome |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `genome_id` | string | ID of new genome |
| `genome_path` | string | Path to mutated genome YAML |
| `delta` | object | Structured diff from parent |
| `lineage` | array | Parent genome IDs |

## Usage

```bash
python scripts/genome-mutator.py [arguments]
```

---

*Generated from [`skills/evolution/genome-mutator.yaml`](../../skills/evolution/genome-mutator.yaml)*
