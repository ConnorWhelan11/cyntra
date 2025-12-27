# Cyntra Skills Library - Development Status

## Overview

Created a comprehensive skills library for Cyntra with **52 skill definitions** across 6 categories:

- **Development** (16 skills): Core workflow, testing, validation
- **Fab** (11 skills): 3D asset generation and quality checking
- **Dynamics** (5 skills): State tracking and potential estimation
- **Evolution** (4 skills): Prompt optimization and control
- **Sleeptime** (11 skills): Shared memory and cross-agent learning
- **Search** (5 skills): Web search and scraping via Firecrawl

## Implementation Status

### ✅ Fully Implemented (21 skills)

> Note: 21 implemented + 31 scaffolded = 52 total skills

#### Phase 1-2: Development Skills (7/16)

1. **cyntra-rollout-builder** - Build rollout.json from workcell artifacts
2. **cyntra-schema-validator** - Validate JSON against Cyntra schemas
3. **workcell-lifecycle** - Create/verify/cleanup git worktree workcells
4. **quality-gate-runner** - Orchestrate pytest/mypy/ruff gates
5. **beads-graph-ops** - Query/update Beads work graph
6. **telemetry-parser** - Parse adapter telemetry into normalized events
7. **trajectory-analyzer** - Compute tool usage stats and transitions

#### Phase 3-4: Dynamics Skills (4/5)

8. **cyntra-dynamics-ingest** - Extract T1 states and log transitions to DB
9. **state-hasher-t1** - Compute deterministic state IDs from features
10. **potential-fitter** - Fit V(state) from transition probabilities
11. **action-metric-calculator** - Compute trajectory action and detect trapping

#### Phase 5-6: Evolution Skills (3/4)

12. **genome-mutator** - Mutate prompt genomes with lineage tracking
13. **pareto-frontier-updater** - Maintain Pareto frontier across objectives
14. **exploration-controller** - Adjust exploration params based on dynamics

#### Fab Skills (3/11)

15. **blender-deterministic-render** - Reproducible Blender rendering
16. **fab-gate-evaluator** - Run quality gates on 3D assets
17. **deterministic-world-builder** - Build worlds with SHA manifests

#### Sleeptime Skills (4/11) - NEW

18. **history-ingester** - Process rollouts into observations DB
19. **context-injector** - Prepare memory context for workcell prompts
20. **trap-detector** - Identify stuck states from dynamics data
21. **memory-search** - FTS + keyword search over memory store

### 📋 Scaffolded Only (31 skills)

#### Development (9)

- analyze-diff
- check-coverage
- deterministic-test-suite
- dynamics-reporter
- explain-failure
- find-tests
- gen-fixtures
- integration-smoke-test
- schema-roundtrip-test

#### Fab (8)

- asset-proof-packager
- asset-repair-playbook
- fab-world-stage-runner
- godot-integration-validator
- lookdev-render-harness
- material-library-sampler
- multi-signal-critic
- sverchok-scaffold-generator

#### Dynamics (1)

- transition-probability-estimator

#### Evolution (1)

- rollout-reflector

#### Sleeptime (7)

- context-compressor
- memory-block-writer
- memory-consolidator
- pattern-distiller
- pattern-extractor
- priority-rebalancer
- strategic-forgetter

#### Search (5)

- firecrawl-crawl
- firecrawl-extract
- firecrawl-scrape
- firecrawl-search
- web-research

## Skill Structure

Each skill consists of:

```
kernel/src/cyntra/skills/
  {category}/
    skill-name.yaml       # Metadata, inputs/outputs, examples
    skill-name.py         # Python implementation with CLI
```

All Python skills follow a consistent pattern:

- `execute(**kwargs) -> dict` - Main skill logic
- `main()` - CLI entrypoint for testing
- Returns `{"success": bool, ...}` structure
- Standalone executables with `#!/usr/bin/env python3`

## Integration Points

Skills integrate with existing Cyntra modules:

- `cyntra.rollouts.builder` - Rollout generation
- `cyntra.dynamics.*` - State/transition/potential/action
- `cyntra.evolve.*` - Genome mutation and Pareto optimization
- `cyntra.workcell.manager` - Workcell lifecycle
- `cyntra.state.manager` - Beads integration
- `cyntra.fab.*` - Asset generation and quality gates

## Usage Examples

### From Command Line

```bash
# Build rollout from workcell
kernel/src/cyntra/skills/development/cyntra-rollout-builder.py .workcells/wc-42-20251220/

# Validate schema
kernel/src/cyntra/skills/development/cyntra-schema-validator.py rollout.json rollout

# Create workcell
kernel/src/cyntra/skills/development/workcell-lifecycle.py create --issue-id 42
```

### From Python

```python
from pathlib import Path
import sys

# Add skills to path
sys.path.insert(0, str(Path("kernel/src/cyntra/skills/development")))

from cyntra_rollout_builder import execute

result = execute(
    workcell_path=".workcells/wc-42-20251220/",
    include_trajectory_details=False,
)

if result["success"]:
    print(f"Rollout created: {result['rollout_path']}")
```

### From Codex/Claude Agents

Skills can be invoked by LLM agents running in workcells. The skill YAML definitions provide the interface specification that agents can use to understand inputs/outputs.

## Next Steps

### Priority Implementations Needed

1. **transition-probability-estimator** - Critical for dynamics Phase 3
2. **dynamics-reporter** - Generate comprehensive reports (Phase 4)
3. **rollout-reflector** - Analyze failures for prompt patches (Phase 5)

### Fab Pipeline Completion

4. **asset-repair-playbook** - Generate fix instructions from gate failures
5. **godot-integration-validator** - Validate CONTRACT.md compliance
6. **multi-signal-critic** - Aggregate multiple critic signals

### Testing & Validation

7. **integration-smoke-test** - End-to-end pipeline validation
8. **deterministic-test-suite** - Verify reproducibility
9. **schema-roundtrip-test** - Schema stability tests

## Design Decisions

1. **Standalone executables**: Each skill is independently runnable for testing
2. **Consistent return format**: All skills return `{"success": bool, ...}`
3. **Wrap existing code**: Skills delegate to existing Cyntra modules when possible
4. **CLI + Library**: Skills work as both CLI tools and importable libraries
5. **Path handling**: Skills use absolute paths internally, accept relative paths as input

## Testing

To test a skill:

```bash
cd /Users/connor/Medica/glia-fab

# Test rollout builder
kernel/src/cyntra/skills/development/cyntra-rollout-builder.py \
  .workcells/wc-42-20251220T190000Z/

# Test schema validator
echo '{"schema_version": "cyntra.rollout.v1"}' > /tmp/test.json
kernel/src/cyntra/skills/development/cyntra-schema-validator.py /tmp/test.json rollout
```

## Documentation

- See individual skill YAML files for detailed input/output specifications
- See `kernel/src/cyntra/skills/README.md` for library overview
- See implementation files for inline documentation and examples
