"""
Sleeptime Agent - Background consolidation for kernel.

Runs asynchronously between primary agent tasks to:
- Ingest run history
- Extract patterns
- Update shared memory blocks
- Detect dynamics traps

Inspired by Letta's sleeptime agent architecture.
"""

from cyntra.sleeptime.config import SleeptimeConfig
from cyntra.sleeptime.orchestrator import SleeptimeOrchestrator

__all__ = ["SleeptimeOrchestrator", "SleeptimeConfig"]
