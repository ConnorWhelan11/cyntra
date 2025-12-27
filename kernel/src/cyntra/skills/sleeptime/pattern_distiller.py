"""
Pattern Distiller - Extract recurring patterns from run summaries.

Analyzes tool sequences, error signatures, and outcomes to identify:
- Successful patterns worth repeating
- Anti-patterns to avoid
- Novel sequences for exploration
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class Pattern:
    """A recurring pattern extracted from runs."""

    pattern_id: str
    pattern_type: str
    signature: str
    frequency: int
    confidence: float
    example_run_ids: list[str]
    outcome_distribution: dict[str, int]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AntiPattern:
    """A pattern strongly correlated with failure."""

    signature: str
    failure_rate: float
    frequency: int
    suggested_avoidance: str

    def to_dict(self) -> dict:
        return asdict(self)


class PatternDistiller:
    """Extract patterns from run summaries."""

    def __init__(
        self,
        min_frequency: int = 2,
        similarity_threshold: float = 0.85,
    ):
        self.min_frequency = min_frequency
        self.similarity_threshold = similarity_threshold

    def _ngrams(self, sequence: list[str], n: int) -> list[tuple[str, ...]]:
        """Generate n-grams from tool sequence."""
        if len(sequence) < n:
            return []
        return [tuple(sequence[i : i + n]) for i in range(len(sequence) - n + 1)]

    def _signature_hash(self, signature: str) -> str:
        """Generate short hash for pattern ID."""
        return hashlib.sha256(signature.encode()).hexdigest()[:8]

    def extract_tool_chain_patterns(
        self,
        run_summaries: list[dict],
    ) -> list[Pattern]:
        """Find recurring tool sequences."""
        # Collect all n-grams (2-5 tools)
        ngram_runs: dict[tuple, list[dict]] = defaultdict(list)

        for run in run_summaries:
            seq = run.get("tool_sequence", [])
            for n in range(2, min(6, len(seq) + 1)):
                for ngram in self._ngrams(seq, n):
                    ngram_runs[ngram].append(run)

        patterns = []
        for ngram, runs in ngram_runs.items():
            if len(runs) < self.min_frequency:
                continue

            signature = " -> ".join(ngram)
            outcomes = Counter(r.get("outcome", "unknown") for r in runs)
            success_rate = outcomes.get("success", 0) / len(runs)

            patterns.append(
                Pattern(
                    pattern_id=f"tc_{self._signature_hash(signature)}",
                    pattern_type="tool_chains",
                    signature=signature,
                    frequency=len(runs),
                    confidence=success_rate,
                    example_run_ids=[r["run_id"] for r in runs[:5]],
                    outcome_distribution=dict(outcomes),
                )
            )

        # Sort by frequency * confidence
        patterns.sort(key=lambda p: p.frequency * p.confidence, reverse=True)
        return patterns[:50]  # Top 50

    def extract_error_patterns(
        self,
        run_summaries: list[dict],
    ) -> list[Pattern]:
        """Cluster similar error signatures."""
        error_runs: dict[str, list[dict]] = defaultdict(list)

        for run in run_summaries:
            sig = run.get("error_signature")
            if sig:
                error_runs[sig].append(run)

        patterns = []
        for sig, runs in error_runs.items():
            if len(runs) < self.min_frequency:
                continue

            patterns.append(
                Pattern(
                    pattern_id=f"err_{sig[:8]}",
                    pattern_type="error_signatures",
                    signature=sig,
                    frequency=len(runs),
                    confidence=1.0,  # All failures
                    example_run_ids=[r["run_id"] for r in runs[:5]],
                    outcome_distribution={"failure": len(runs)},
                )
            )

        patterns.sort(key=lambda p: p.frequency, reverse=True)
        return patterns[:30]

    def extract_gate_failure_patterns(
        self,
        run_summaries: list[dict],
    ) -> list[Pattern]:
        """Find recurring gate failures."""
        gate_runs: dict[str, list[dict]] = defaultdict(list)

        for run in run_summaries:
            for gate, passed in run.get("gate_results", {}).items():
                if not passed:
                    gate_runs[gate].append(run)

        patterns = []
        for gate, runs in gate_runs.items():
            if len(runs) < self.min_frequency:
                continue

            patterns.append(
                Pattern(
                    pattern_id=f"gate_{self._signature_hash(gate)}",
                    pattern_type="gate_failures",
                    signature=gate,
                    frequency=len(runs),
                    confidence=1.0,
                    example_run_ids=[r["run_id"] for r in runs[:5]],
                    outcome_distribution={"gate_failed": len(runs)},
                )
            )

        return patterns

    def identify_anti_patterns(
        self,
        patterns: list[Pattern],
        threshold: float = 0.7,
    ) -> list[AntiPattern]:
        """Identify patterns with high failure rates."""
        anti_patterns = []

        for p in patterns:
            if p.pattern_type != "tool_chains":
                continue

            failures = p.outcome_distribution.get("failure", 0)
            total = sum(p.outcome_distribution.values())
            failure_rate = failures / total if total > 0 else 0

            if failure_rate >= threshold and p.frequency >= self.min_frequency:
                # Generate avoidance suggestion
                tools = p.signature.split(" -> ")
                if len(tools) >= 2:
                    suggestion = (
                        f"Consider adding Read before {tools[0]}"
                        if tools[0] == "Edit"
                        else f"Verify output after {tools[-2]} before {tools[-1]}"
                    )
                else:
                    suggestion = "Review this tool sequence for alternatives"

                anti_patterns.append(
                    AntiPattern(
                        signature=p.signature,
                        failure_rate=failure_rate,
                        frequency=p.frequency,
                        suggested_avoidance=suggestion,
                    )
                )

        return anti_patterns

    def find_novel_sequences(
        self,
        run_summaries: list[dict],
        known_patterns: list[Pattern],
    ) -> list[dict]:
        """Find tool sequences not matching known patterns."""
        known_sigs = {p.signature for p in known_patterns}
        novel = []

        for run in run_summaries:
            seq = run.get("tool_sequence", [])
            if len(seq) < 3:
                continue

            # Check if any 3-gram matches known
            matches_known = False
            for ngram in self._ngrams(seq, 3):
                sig = " -> ".join(ngram)
                if sig in known_sigs:
                    matches_known = True
                    break

            if not matches_known and run.get("outcome") == "success":
                novel.append(
                    {
                        "run_id": run["run_id"],
                        "sequence": seq,
                        "outcome": run.get("outcome"),
                    }
                )

        return novel[:20]

    def distill(
        self,
        run_summaries: list[dict],
        pattern_types: list[str] | None = None,
    ) -> dict:
        """
        Main entry point - extract all patterns from summaries.

        Returns:
            {
                "patterns": [...],
                "anti_patterns": [...],
                "novel_sequences": [...],
            }
        """
        if pattern_types is None:
            pattern_types = ["tool_chains", "error_signatures", "gate_failures"]

        all_patterns = []

        if "tool_chains" in pattern_types:
            all_patterns.extend(self.extract_tool_chain_patterns(run_summaries))

        if "error_signatures" in pattern_types:
            all_patterns.extend(self.extract_error_patterns(run_summaries))

        if "gate_failures" in pattern_types:
            all_patterns.extend(self.extract_gate_failure_patterns(run_summaries))

        anti_patterns = self.identify_anti_patterns(all_patterns)
        novel = self.find_novel_sequences(run_summaries, all_patterns)

        return {
            "patterns": [p.to_dict() for p in all_patterns],
            "anti_patterns": [a.to_dict() for a in anti_patterns],
            "novel_sequences": novel,
        }


if __name__ == "__main__":
    import sys

    # Read summaries from stdin or file
    if len(sys.argv) > 1:
        summaries = json.loads(Path(sys.argv[1]).read_text())
    else:
        summaries = json.loads(sys.stdin.read())

    distiller = PatternDistiller()
    result = distiller.distill(summaries.get("run_summaries", summaries))
    print(json.dumps(result, indent=2))
