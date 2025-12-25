---
name: cyntra-schema-validator
description: |
  Validate JSON artifacts against Cyntra schemas. Ensures rollouts, proofs, manifests,
  and other artifacts conform to their schema definitions in cyntra-kernel/schemas/cyntra/.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "critical"
---

# Cyntra Schema Validator

Validate JSON artifacts against Cyntra schemas. Ensures rollouts, proofs, manifests,

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `artifact_path` | string | Yes | - | Path to JSON artifact to validate |
| `schema_name` | string | Yes | - | Schema name (e.g., 'rollout', 'proof', 'manifest', 'state_t1') |
| `strict` | boolean | No | false | Fail on warnings, not just errors |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `valid` | boolean | True if artifact passes validation |
| `errors` | array | List of validation errors (if any) |
| `warnings` | array | List of validation warnings (if any) |
| `schema_version` | string | Schema version used for validation |

## Usage

```bash
python scripts/cyntra-schema-validator.py [arguments]
```

---

*Generated from [`skills/development/cyntra-schema-validator.yaml`](../../skills/development/cyntra-schema-validator.yaml)*
