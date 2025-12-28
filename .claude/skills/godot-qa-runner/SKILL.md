---
name: godot-qa-runner
description: |
  Locate the Godot binary and run headless QA/test scenes or scripts for a Godot project.
  Use when a workcell needs to validate GDScript/scene health or execute the Godot test runner.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "high"
---

# Godot QA Runner

Run Godot headless QA flows (unit tests + validation scripts) from the CLI.

## When to use

- You need to run Godot tests or validation in a workcell without opening the editor.
- You need to locate the Godot binary on macOS and run a scene/script deterministically.

## Godot binary discovery

Prefer an explicit path (fastest, most reliable):

- `GODOT_BIN=/Applications/Godot.app/Contents/MacOS/Godot`

Fallback auto-detect (macOS):

- `godot` or `godot4` on PATH
- `/Applications/Godot.app/Contents/MacOS/Godot`
- `mdfind "kMDItemFSName == 'Godot.app'"`

## QA workflow (recommended)

Use the repo helper script (handles discovery + headless run):

```bash
scripts/godot-qa-runner.sh --project research/backbay-imperium/client --scene res://tests/run_all_tests.tscn
```

### Optional: script-based validation

```bash
scripts/godot-qa-runner.sh --project research/backbay-imperium/client --script res://tests/qa_validate_scripts.gd
```

### Combined gate (recommended)

```bash
mise run godot-qa
```

This runs `run_all_tests.tscn` followed by `qa_validate_scripts.gd`.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project` | string | No | `research/backbay-imperium/client` | Godot project directory |
| `scene` | string | No | `res://tests/run_all_tests.tscn` | Scene to run headless |
| `script` | string | No | - | Script to run headless (alternative to `scene`) |
| `godot_bin` | string | No | auto | Path to Godot binary |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `exit_code` | int | Godot process exit code (0 = pass) |
| `stdout` | string | Headless test output |

## Notes

- Use `--headless` for CI/workcell runs.
- The test runner scene is `res://tests/run_all_tests.tscn`.
