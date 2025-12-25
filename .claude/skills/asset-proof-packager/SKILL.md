---
name: asset-proof-packager
description: |
  Bundle render outputs + critic reports + verdict into asset-proof.json schema.
  Creates complete asset evaluation package.
  
  Use when working on fab tasks.
metadata:
  version: "1.0.0"
  category: "fab"
  priority: "high"
---

# Asset Proof Packager

Bundle render outputs + critic reports + verdict into asset-proof.json schema.

## Inputs

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `asset_path` | string | Yes | - | Path to evaluated asset |
| `verdict_path` | string | Yes | - | Path to gate verdict JSON |
| `renders_dir` | string | Yes | - | Directory containing renders |
| `output_path` | string | Yes | - | Path for asset-proof.json |

## Outputs

| Field | Type | Description |
|-------|------|-------------|
| `proof_path` | string | Path to generated asset-proof.json |
| `valid` | boolean | True if proof validates against schema |
| `bundle_size_mb` | number | Total size of bundled artifacts |

## Usage

```bash
python scripts/asset-proof-packager.py [arguments]
```

---

*Generated from [`skills/fab/asset-proof-packager.yaml`](../../skills/fab/asset-proof-packager.yaml)*
