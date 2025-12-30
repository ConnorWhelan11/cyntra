"""
Research quality gates for the Cyntra knowledge system.

Gates:
- Schema: Validate memory YAML frontmatter
- Citations: Verify all claims have valid citations
- Dedup: Detect duplicate memories
- Safety: Scan for PII and secrets
"""

from cyntra.research.gates.base import GateContext, GateResult, GateRunner

__all__ = [
    "GateContext",
    "GateResult",
    "GateRunner",
]
