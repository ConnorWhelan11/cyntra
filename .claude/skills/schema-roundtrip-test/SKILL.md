---
name: schema-roundtrip-test
description: |
  Validate that all schemas can serialize/deserialize without data loss.
  Tests schema stability and completeness.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "medium"
---

# Schema Roundtrip Test

Validate that all schemas can serialize/deserialize without data loss.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `schema_dir` | string | No | kernel/schemas/cyntra | Directory containing schemas |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `all_passed` | boolean | True if all schemas passed roundtrip test |
| `results` | array | Per-schema test results |
| `failures` | array | Schemas that failed roundtrip |

## Usage

```bash
python scripts/schema-roundtrip-test.py [arguments]
```

---

*Generated from [`skills/development/schema-roundtrip-test.yaml`](../../skills/development/schema-roundtrip-test.yaml)*
