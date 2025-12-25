"""
Working Memory Trinkets - Dynamic context injection for agent prompts.

Trinkets are modular context providers that generate content for agent prompts.
Adapted from Mira OS's trinket architecture for agent swarm context.
"""

from .base import AgentTrinket, RunContext
from .patterns import PatternsTrinket
from .failures import FailuresTrinket
from .dynamics import DynamicsTrinket
from .codebase import CodebaseTrinket
from .playbook import PlaybookTrinket
from .task_context import TaskContextTrinket

__all__ = [
    "AgentTrinket",
    "RunContext",
    "PatternsTrinket",
    "FailuresTrinket",
    "DynamicsTrinket",
    "CodebaseTrinket",
    "PlaybookTrinket",
    "TaskContextTrinket",
]
