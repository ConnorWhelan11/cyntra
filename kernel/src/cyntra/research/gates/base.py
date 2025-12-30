"""
Base gate infrastructure for research quality checks.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from cyntra.research.models import DraftMemory, Evidence

logger = logging.getLogger(__name__)


@dataclass
class GateResult:
    """Result of a single gate check."""

    gate_name: str
    passed: bool
    blocking: bool = True  # If true, failure blocks the memory
    issues: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class GateContext:
    """Context for running gates."""

    memory: DraftMemory
    evidence: list[Evidence]
    existing_memories: list[DraftMemory]
    run_dir: Path


class BaseGate(ABC):
    """Base class for research gates."""

    name: str = "base"
    blocking: bool = True

    @abstractmethod
    def check(self, context: GateContext) -> GateResult:
        """Run the gate check."""
        raise NotImplementedError


class GateRunner:
    """Runs all gates on a memory."""

    def __init__(self, gates: list[BaseGate] | None = None):
        self.gates = gates or []

    def add_gate(self, gate: BaseGate) -> None:
        """Add a gate to the runner."""
        self.gates.append(gate)

    def run_all(self, context: GateContext) -> list[GateResult]:
        """Run all gates and return results."""
        results = []
        for gate in self.gates:
            try:
                result = gate.check(context)
                results.append(result)
            except Exception as e:
                logger.error(f"Gate {gate.name} failed with error: {e}")
                results.append(
                    GateResult(
                        gate_name=gate.name,
                        passed=False,
                        blocking=gate.blocking,
                        issues=[f"Gate error: {e}"],
                    )
                )
        return results

    def all_passed(self, results: list[GateResult]) -> bool:
        """Check if all blocking gates passed."""
        return all(r.passed or not r.blocking for r in results)

    def get_blocking_failures(self, results: list[GateResult]) -> list[GateResult]:
        """Get all blocking gate failures."""
        return [r for r in results if not r.passed and r.blocking]
