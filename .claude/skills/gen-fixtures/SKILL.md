---
name: gen-fixtures
description: |
  Generate test fixtures from code analysis.
  Creates mock data, factory functions, and test helpers.
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "medium"
---

# Gen Fixtures

Generate test fixtures from code analysis.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `source_file` | string | Yes | - | Source file to generate fixtures for |
| `repo_path` | string | Yes | - | Repository root path |
| `fixture_type` | string | No | all | Type: factory, mock, sample_data, all |
| `output_dir` | string | No | - | Directory to write fixtures |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `fixtures_created` | array | List of fixture definitions created |
| `factory_functions` | array | Factory function definitions |
| `sample_data` | object | Generated sample data |

## Usage

```bash
python scripts/gen-fixtures.py [arguments]
```

## Examples

### Generate fixtures for a model

**Inputs:**
```yaml
fixture_type: all
repo_path: /path/to/repo
source_file: src/models/user.py
```

**Outputs:**
```yaml
factory_functions:
- user_factory
fixtures_created:
- code: 'def user_factory(**kwargs): ...'
  name: user_factory
  type: factory
sample_data:
  user:
    email: test@example.com
    id: 1
    name: Test User
```

---

*Generated from [`skills/development/gen-fixtures.yaml`](../../skills/development/gen-fixtures.yaml)*
