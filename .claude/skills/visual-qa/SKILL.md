---
name: visual-qa
description: |
  Run visual QA regression tests for Backbay Imperium.
  Captures screenshots of game rendering and compares against baselines
  using perceptual hashing to detect visual regressions.
  
  Use after making changes to:
  - 3D terrain rendering (Terrain3DLayer, Terrain3DMaterialLoader)
  - 3D unit rendering (Unit3DLayer, Unit3DManager)
  - Map generation (mapgen, terrain)
  - UI compositing (CanvasLayers, SubViewports)
  
  Supports three modes:
  - capture: Only capture new screenshots
  - compare: Compare captures against baselines
  - update: Update baselines from current captures
  
  Use when working on development tasks.
metadata:
  version: "1.0.0"
  category: "development"
  priority: "high"
---

# Visual Qa

Run visual QA regression tests for Backbay Imperium.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `mode` | string | No | compare | Operation mode: capture, compare, or update |
| `threshold` | integer | No | 10 | Perceptual hash distance threshold (0=identical, 64=different) |
| `strict` | boolean | No | false | Use strict threshold (5) for pixel-perfect comparison |
| `capture_mode` | string | No | all | Capture mode: basic (regression), terrain (quality), or all |
| `compute_metrics` | boolean | No | false | Compute terrain quality metrics (edge density, color variance, etc.) |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `passed` | boolean | Whether all visual comparisons passed |
| `total` | integer | Total number of captures compared |
| `failed_count` | integer | Number of failed comparisons |
| `basic_captures` | integer | Number of basic regression captures |
| `terrain_captures` | integer | Number of terrain quality captures |
| `category_summary` | object | Pass/fail counts by terrain category (water, vegetation, etc.) |
| `results` | array | Per-capture results with name, passed, hash_distance, category, terrain_metrics |
| `diff_images` | array | Paths to generated diff images for failed comparisons |
| `report_path` | string | Path to full JSON report |

## Usage

```bash
python skills/development/visual-qa.py [arguments]
```

## Examples

### Run visual QA comparison

**Inputs:**
```yaml
mode: compare
```

**Outputs:**
```yaml
diff_images: []
failed_count: 0
passed: true
report_path: client/tests/visual_qa_output/visual_qa_report.json
results:
- hash_distance: 0
  name: terrain_overview
  passed: true
- hash_distance: 2
  name: terrain_zoomed
  passed: true
total: 4
```

### Update baselines after intentional changes

**Inputs:**
```yaml
mode: update
```

**Outputs:**
```yaml
diff_images: []
failed_count: 0
passed: true
report_path: ''
results: []
total: 4
```

### Strict comparison for critical visual elements

**Inputs:**
```yaml
mode: compare
strict: true
```

**Outputs:**
```yaml
diff_images:
- client/tests/visual_qa_output/diffs/terrain_overview_diff.png
failed_count: 1
passed: false
results:
- hash_distance: 8
  name: terrain_overview
  passed: false
total: 4
```

---

*Generated from [`skills/development/visual-qa.yaml`](../../skills/development/visual-qa.yaml)*
