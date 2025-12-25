# Cyntra Skills Library

This directory contains reusable skills for both:
1. **Developing the Cyntra/Glia Fab project** (development/, dynamics/, evolution/, sleeptime/)
2. **Fab workcells** for 3D asset creation and validation (fab/)
3. **Web research and scraping** (search/)

## Skill Categories

### Development Skills (`development/`)
Core workflow skills for building and testing Cyntra components:
- Schema validation and artifact checking
- Rollout building from telemetry
- Workcell lifecycle management
- Quality gate orchestration
- Testing and validation

### Fab Skills (`fab/`)
3D asset generation, rendering, and quality checking:
- Deterministic Blender rendering
- Asset quality gates and critics
- World building pipelines
- Godot integration validation
- Iterative repair workflows

### Dynamics Skills (`dynamics/`)
State/transition tracking and potential estimation:
- T1 state extraction and hashing
- Transition logging and DB operations
- Potential/action estimation
- Transition probability estimation

### Evolution Skills (`evolution/`)
Prompt genome management and Pareto optimization:
- Genome mutation and crossover
- Pareto frontier maintenance
- Rollout reflection and patching
- Exploration controller tuning

### Sleeptime Skills (`sleeptime/`)
Background consolidation for asynchronous learning (inspired by [Letta](https://docs.letta.com/guides/agents/architectures/sleeptime/)):
- History ingestion from completed runs
- Pattern extraction (successful tool chains, failure modes)
- Memory block management for shared learned context
- Trap detection from dynamics data
- Context injection into primary agent prompts

Sleeptime agents run between primary tasks to distill "institutional knowledge" from run history. See `sleeptime/README.md` for architecture details.

### Search Skills (`search/`)
Web search and scraping via Firecrawl API:
- Single page scraping with JS rendering
- Recursive website crawling
- Web search with content extraction
- AI-powered structured data extraction
- Meta-research orchestration

See `search/README.md` for API setup and usage.

## Skill Format

Each skill consists of:
- `skill-name.yaml` - Metadata and interface definition
- `skill-name.py` - Implementation (optional, can be inline in YAML)
- `examples/skill-name/` - Usage examples

### YAML Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (kebab-case) |
| `version` | Yes | Semantic version |
| `description` | Yes | What the skill does |
| `category` | Yes | Parent directory (development, fab, dynamics, evolution, sleeptime, search) |
| `priority` | Yes | Importance: `critical`, `high`, `medium` |
| `phase` | No | Implementation phase (see below) |
| `inputs` | Yes | Input parameters with types |
| `outputs` | Yes | Return values with types |
| `implementation` | Yes | Path to Python implementation |

### Phase Field

The `phase` field indicates when a skill fits in the Cyntra development roadmap:

| Phase | Focus | Example Skills |
|-------|-------|----------------|
| `1` | Foundation | find-tests, beads-graph-ops |
| `1-2` | Core workflow | schema-validator, quality-gate-runner, workcell-lifecycle |
| `2` | Workflow & analysis | rollout-builder, telemetry-parser, trajectory-analyzer |
| `3` | Dynamics collection | dynamics-ingest, state-hasher-t1, transition-probability-estimator |
| `4` | Dynamics analysis | potential-fitter, action-metric-calculator, dynamics-reporter |
| `5` | Evolution | genome-mutator, pareto-frontier-updater, rollout-reflector |
| `6` | Closed-loop control | exploration-controller |
| `fab` | Fab pipeline | All fab/ skills (rendering, gates, world building) |

Skills without a phase field (e.g., search/) are standalone utilities.

## Usage with Codex/Claude

Skills can be invoked by LLM agents working in workcells. See individual skill documentation for usage patterns.

## Agent Skills Generation

Skills are defined in YAML format in this directory and auto-generated into the
[Agent Skills standard](https://agentskills.io/) format for Claude Code and Codex discovery.

### Generate Skills

```bash
# Generate all skills to .claude/skills/
python skills/generate.py

# Clean and regenerate
python skills/generate.py --clean

# Preview without writing
python skills/generate.py --dry-run
```

### Output Structure

```
.claude/skills/           # Claude Code discovery (generated)
  skill-name/
    SKILL.md              # Agent Skills format
    scripts/
      main.py → symlink   # Links to skills/{category}/skill-name.py

.codex/skills/            # Codex discovery (symlink to .claude/skills/)
```

### Dual-Use Design

| Consumer | Format | Location |
|----------|--------|----------|
| **Claude Code / Codex** | SKILL.md (standard) | `.claude/skills/` |
| **Cyntra Kernel** | YAML (structured) | `skills/{category}/` |

The YAML files are the source of truth. Generated SKILL.md files include
a reference back to their source YAML.

## Development

To add a new skill:
1. Create `skill-name.yaml` in the appropriate category directory
2. Implement the skill logic in `skill-name.py`
3. Add examples showing typical usage
4. Run `python skills/generate.py` to generate SKILL.md
5. Test with Claude Code, Codex, and Cyntra adapters
