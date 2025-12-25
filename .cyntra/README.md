# Cyntra Local Store

This directory is Cyntra’s local-first store.

Tracked files:

- `config.yaml`: Cyntra kernel configuration
- `README.md`: this document

Runtime layout (ignored by git):

- `logs/`: kernel event logs (e.g. `logs/events.jsonl`)
- `archives/`: archived workcells (manifest/proof/logs)
- `state/`: local kernel state (e.g. flaky test DB)
- `runs/`: reserved for Cyntra runs (world builds, gates, rollouts)

Work graph + workcells live alongside this store:

- `.beads/`: canonical work graph
- `.workcells/`: active workcell git worktrees
