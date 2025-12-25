# Architecture Specs (Universe / Evolution / Memory)

These documents turn the “Universe Development Environment” idea into concrete, implementable subsystems.

Core definitions (shared vocabulary):
- **Universe** = governance bundle: what we optimize + how we’re allowed to operate + what we remember + what evidence counts.
- **Genome** = explicit knobs we allow to change.
- **Swarm** = coordination/search strategy over genomes.
- **Frontier** = persistent “best-known evidence” set (multi-objective, versioned, replayable).

Specs:
- `docs/architecture/universe-governance.md` — policies, determinism, evidence contracts, on-disk layout.
- `docs/architecture/agent-swarms.md` — agent roles, swarm topologies, multi-fidelity/explore-exploit/adversarial patterns.
- `docs/architecture/genome-surfaces.md` — genome surface schema, mutation operators, determinism/canonicalization rules.
- `docs/architecture/frontiers-evidence-shelf.md` — frontier updates, regression tracking, determinism score, best-known shelf/gallery.
- `docs/architecture/universe-blueprints.md` — three concrete universe designs: Fab shipping, code evolution, research/sim.
- `docs/architecture/galaxy-v1.md` — Galaxy control plane: Universe-as-World, meta-frontiers, and routing.

Related (overview-level):
- `docs/universe.md`
- `docs/universe-evolution-quickstart.md`
