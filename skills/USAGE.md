# Cyntra Skills - Usage Guide

## Quick Start

### Testing a Skill from CLI

```bash
# Navigate to repo root
cd /Users/connor/Medica/glia-fab

# Make skills executable
chmod +x skills/**/*.py

# Test rollout builder
skills/development/cyntra-rollout-builder.py \
  .workcells/wc-42-20251220T190000Z/

# Test schema validator
skills/development/cyntra-schema-validator.py \
  .cyntra/rollouts/ro_wc-42.json \
  rollout

# Test workcell lifecycle
skills/development/workcell-lifecycle.py create --issue-id 42
```

### Using Skills from Python

```python
#!/usr/bin/env python3
from pathlib import Path
import sys

# Add skill to path
sys.path.insert(0, "skills/development")

# Import and execute
from cyntra_rollout_builder import execute

result = execute(
    workcell_path=".workcells/wc-42-20251220/",
    include_trajectory_details=False
)

if result["success"]:
    print(f"✓ Rollout: {result['rollout_path']}")
    print(f"  Summary: {result['summary']}")
else:
    print(f"✗ Error: {result['error']}")
```

### Chaining Skills Together

```python
#!/usr/bin/env python3
"""
Example: Build and validate rollout
"""
import sys
from pathlib import Path

sys.path.extend([
    "skills/development",
    "skills/dynamics",
])

from cyntra_rollout_builder import execute as build_rollout
from cyntra_schema_validator import execute as validate_schema
from trajectory_analyzer import execute as analyze_trajectory

workcell_path = ".workcells/wc-42-20251220T190000Z/"

# 1. Build rollout
print("Building rollout...")
rollout_result = build_rollout(workcell_path)
if not rollout_result["success"]:
    print(f"Failed: {rollout_result['error']}")
    sys.exit(1)

rollout_path = rollout_result["rollout_path"]
print(f"✓ Rollout created: {rollout_path}")

# 2. Validate schema
print("\nValidating schema...")
validation_result = validate_schema(rollout_path, "rollout")
if not validation_result["valid"]:
    print(f"Schema errors: {validation_result['errors']}")
    sys.exit(1)
print("✓ Schema valid")

# 3. Analyze trajectory
print("\nAnalyzing trajectory...")
analysis_result = analyze_trajectory(rollout_path, compute_transitions=True)
if analysis_result["success"]:
    print(f"✓ Tool usage: {analysis_result['tool_summary']}")
    print(f"✓ File changes: {len(analysis_result['file_changes'])} files")
    print(f"✓ Transitions: {len(analysis_result['transitions'])}")
```

## Common Workflows

### Development Workflow

**1. Create and Work in Workcell**
```bash
# Create workcell
skills/development/workcell-lifecycle.py create --issue-id 42

# Verify workcell
skills/development/workcell-lifecycle.py verify --workcell-id wc-42-20251220T190000Z

# ... do work in workcell ...

# Run quality gates
skills/development/quality-gate-runner.py \
  .workcells/wc-42-20251220T190000Z/ \
  --gates-json '{"code": {"test": "pytest", "lint": "ruff check ."}}'
```

**2. Build and Validate Rollout**
```bash
# Build rollout
skills/development/cyntra-rollout-builder.py \
  .workcells/wc-42-20251220T190000Z/

# Validate rollout schema
skills/development/cyntra-schema-validator.py \
  .workcells/wc-42-20251220T190000Z/rollout.json \
  rollout

# Analyze trajectory
skills/development/trajectory-analyzer.py \
  .workcells/wc-42-20251220T190000Z/rollout.json \
  --transitions
```

### Dynamics Workflow

**1. Ingest Rollouts into DB**
```bash
# Create dynamics DB
mkdir -p .cyntra/dynamics

# Ingest rollout
skills/dynamics/cyntra-dynamics-ingest.py \
  .workcells/wc-42-20251220T190000Z/rollout.json \
  .cyntra/dynamics/transitions.db \
  code
```

**2. Compute Potential and Action**
```bash
# Fit potential (requires transition matrix from estimator)
skills/dynamics/potential-fitter.py \
  .cyntra/dynamics/transition_matrix.json \
  --output .cyntra/dynamics/potential.json

# Calculate action
skills/dynamics/action-metric-calculator.py \
  .workcells/wc-42-20251220T190000Z/rollout.json \
  .cyntra/dynamics/transition_matrix.json \
  --output .cyntra/dynamics/action_metrics.json
```

### Evolution Workflow

**1. Mutate Genomes**
```bash
# Create mutation
skills/evolution/genome-mutator.py \
  prompts/code/base_v1.yaml \
  random \
  '{"mutation_rate": 0.1}' \
  prompts/code/variant_v2.yaml
```

**2. Update Frontier**
```bash
# Evaluate genomes and update frontier
skills/evolution/pareto-frontier-updater.py \
  .cyntra/evolve/frontier.json \
  '[{"genome_id": "variant_v2", "quality": 0.85, "cost_usd": 0.42}]' \
  --objectives quality cost determinism
```

**3. Adjust Exploration**
```bash
# Get controller recommendations
skills/evolution/exploration-controller.py \
  .cyntra/dynamics/dynamics_report.json \
  code \
  '{"temperature": 0.2, "speculate_parallelism": 1}'
```

### Fab Workflow

**1. Render Asset**
```bash
# Deterministic render
skills/fab/blender-deterministic-render.py \
  fab/assets/car.blend \
  .cyntra/runs/render_car_v1/ \
  --seed 42 \
  --samples 256
```

**2. Evaluate with Gate**
```bash
# Run gate
skills/fab/fab-gate-evaluator.py \
  fab/gates/car_realism_v001.yaml \
  fab/assets/car.glb \
  .cyntra/runs/gate_car_v1/
```

**3. Build World**
```bash
# Build deterministic world
skills/fab/deterministic-world-builder.py \
  fab/worlds/outora_library/world.yaml \
  .cyntra/runs/world_outora_seed42/ \
  --seed 42 \
  --validate
```

## Skill Reference by Use Case

### When you need to...

**Validate artifacts:**
- `cyntra-schema-validator` - Check JSON against schemas
- `quality-gate-runner` - Run pytest/mypy/ruff/fab gates

**Manage workcells:**
- `workcell-lifecycle` - Create/verify/cleanup workcells

**Analyze trajectories:**
- `cyntra-rollout-builder` - Create rollout from workcell artifacts
- `telemetry-parser` - Parse telemetry into normalized events
- `trajectory-analyzer` - Compute tool usage and transitions

**Track dynamics:**
- `cyntra-dynamics-ingest` - Log states and transitions to DB
- `state-hasher-t1` - Compute state IDs
- `potential-fitter` - Estimate V(state) landscape
- `action-metric-calculator` - Compute action and detect trapping

**Evolve prompts:**
- `genome-mutator` - Create prompt variants
- `pareto-frontier-updater` - Maintain non-dominated set
- `exploration-controller` - Tune exploration parameters

**Generate 3D assets:**
- `blender-deterministic-render` - Reproducible Blender renders
- `fab-gate-evaluator` - Quality gate evaluation
- `deterministic-world-builder` - World building with manifests

## Tips

1. **Always validate schemas** after building artifacts to catch issues early
2. **Use consistent seeds** for deterministic operations (default is 42)
3. **Chain skills in pipelines** for complex workflows
4. **Check success field** in returned dicts before using other fields
5. **Parse telemetry early** to normalize different adapter formats
6. **Ingest rollouts incrementally** into dynamics DB as they complete

## Troubleshooting

**Skill not found error:**
```bash
# Make sure you're running from repo root
cd /Users/connor/Medica/glia-fab

# Or use absolute paths
/Users/connor/Medica/glia-fab/skills/development/cyntra-rollout-builder.py ...
```

**Import errors:**
```python
# Add cyntra-kernel to path explicitly
import sys
from pathlib import Path
repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root / "cyntra-kernel" / "src"))
```

**Schema validation fails:**
```bash
# Check schema exists
ls cyntra-kernel/schemas/cyntra/rollout.schema.json

# Install jsonschema if missing
cd cyntra-kernel && pip install jsonschema
```

## Integration with Cyntra

Skills are designed to be invoked by:
1. **Codex/Claude agents** in workcells (via subprocess)
2. **Cyntra kernel** for automation (import as library)
3. **Desktop app** for UI-driven workflows (via CLI)
4. **CI/CD pipelines** for validation (as CLI tools)

See skill YAML files for detailed API documentation.
