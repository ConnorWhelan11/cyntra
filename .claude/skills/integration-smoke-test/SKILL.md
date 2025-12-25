---
name: integration-smoke-test
description: |
  Quick end-to-end validation of kernel → workcell → proof pipeline.
  Verifies the full workflow completes successfully.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "medium"
---

# Integration Smoke Test

Quick end-to-end validation of kernel → workcell → proof pipeline.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issue_id` | string | No | - | Test issue ID to run |
| `timeout` | integer | No | 300 | Timeout in seconds |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `passed` | boolean | True if smoke test passed |
| `stages` | object | Status of each pipeline stage |
| `artifacts` | array | Generated artifacts (manifest, proof, telemetry) |

## Usage

```bash
python scripts/integration-smoke-test.py [arguments]
```

---

*Generated from [`skills/development/integration-smoke-test.yaml`](../../skills/development/integration-smoke-test.yaml)*
