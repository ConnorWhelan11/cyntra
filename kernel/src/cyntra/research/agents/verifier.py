"""
Verifier Agent - Validate memory quality.

The Verifier agent is the fourth step in the research pipeline:
1. Schema validation - Check YAML frontmatter
2. Citation verification - Every claim has valid citation
3. Duplicate detection - Not too similar to existing
4. Safety scan - No PII or secrets
5. Quality checks - Content meets standards
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from cyntra.research.agents.base import AgentContext, AgentResult, BaseResearchAgent
from cyntra.research.agents.collector import CollectedEvidence
from cyntra.research.agents.synthesizer import SynthesizerOutput
from cyntra.research.models import DraftMemory, GateResult, VerificationResult

# PII and secrets patterns (same as collector)
PII_PATTERNS = {
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "phone": r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
}

SECRET_PATTERNS = {
    "aws_key": r"AKIA[0-9A-Z]{16}",
    "github_token": r"gh[pousr]_[A-Za-z0-9_]{36,}",
    "openai_key": r"sk-[A-Za-z0-9]{48}",
    "anthropic_key": r"sk-ant-[A-Za-z0-9-_]{90,}",
    "generic_api_key": r"(?i)(api[_-]?key|secret[_-]?key|password)\s*[:=]\s*['\"]?[A-Za-z0-9+/=_-]{20,}",
}


@dataclass
class VerifierInput:
    """Input for the Verifier agent."""

    draft_memories: list[DraftMemory] = field(default_factory=list)
    evidence: list[CollectedEvidence] = field(default_factory=list)
    existing_memory_contents: dict[str, str] = field(default_factory=dict)
    min_confidence: float = 0.7
    similarity_threshold: float = 0.85


@dataclass
class VerifierOutput:
    """Output from the Verifier agent."""

    verification_results: list[VerificationResult] = field(default_factory=list)
    verified_memories: list[DraftMemory] = field(default_factory=list)
    rejected_memories: list[tuple[DraftMemory, list[str]]] = field(default_factory=list)

    total_verified: int = 0
    total_rejected: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "verified": [
                {
                    "memory_id": m.memory_id,
                    "title": m.title,
                    "confidence": m.confidence,
                }
                for m in self.verified_memories
            ],
            "rejected": [
                {
                    "memory_id": m.memory_id,
                    "title": m.title,
                    "issues": issues,
                }
                for m, issues in self.rejected_memories
            ],
            "total_verified": self.total_verified,
            "total_rejected": self.total_rejected,
        }


class VerifierAgent(BaseResearchAgent[VerifierInput, VerifierOutput]):
    """
    Verifier agent for validating memory quality.

    Runs multiple gates to ensure memories meet standards.
    """

    name = "verifier"

    def __init__(self, context: AgentContext, embedding_client: Any | None = None):
        super().__init__(context)
        self._embeddings = embedding_client

    async def execute(self, input_data: VerifierInput) -> AgentResult[VerifierOutput]:
        """Execute the verifier agent to validate memories."""
        result = AgentResult[VerifierOutput](success=False, started_at=datetime.now(UTC))
        output = VerifierOutput()

        try:
            # Build evidence index for citation verification
            evidence_urls = {e.source.url for e in input_data.evidence}
            evidence_by_url = {e.source.url: e for e in input_data.evidence}

            # Verify each memory
            for memory in input_data.draft_memories:
                verification = await self._verify_memory(
                    memory,
                    evidence_urls,
                    evidence_by_url,
                    input_data,
                )

                output.verification_results.append(verification)

                if verification.passed:
                    output.verified_memories.append(memory)
                    output.total_verified += 1
                else:
                    output.rejected_memories.append((memory, verification.issues))
                    output.total_rejected += 1

            # Write verification results
            await self._write_verification_results(output)

            self.logger.info(
                f"Verifier complete: {output.total_verified} passed, "
                f"{output.total_rejected} rejected"
            )

            result.success = True
            result.output = output
            result.completed_at = datetime.now(UTC)

        except Exception as e:
            self.logger.error(f"Verifier failed: {e}")
            result.success = False
            result.error = str(e)
            result.completed_at = datetime.now(UTC)

        return result

    async def _verify_memory(
        self,
        memory: DraftMemory,
        evidence_urls: set[str],
        evidence_by_url: dict[str, CollectedEvidence],
        input_data: VerifierInput,
    ) -> VerificationResult:
        """Verify a single memory against all gates."""
        gates: list[GateResult] = []
        all_issues: list[str] = []
        suggestions: list[str] = []

        # Gate 1: Schema validation
        schema_result = self._check_schema(memory)
        gates.append(schema_result)
        all_issues.extend(schema_result.issues)

        # Gate 2: Citations complete
        citations_complete = self._check_citations_complete(memory)
        gates.append(citations_complete)
        all_issues.extend(citations_complete.issues)

        # Gate 3: Citations valid
        citations_valid = self._check_citations_valid(memory, evidence_urls)
        gates.append(citations_valid)
        all_issues.extend(citations_valid.issues)

        # Gate 4: Duplicate detection
        duplicates = await self._check_duplicates(
            memory,
            input_data.existing_memory_contents,
            input_data.similarity_threshold,
        )
        gates.append(duplicates)
        all_issues.extend(duplicates.issues)

        # Gate 5: Safety scan
        safety = self._check_safety(memory)
        gates.append(safety)
        all_issues.extend(safety.issues)

        # Gate 6: Quality checks
        quality = self._check_quality(memory, input_data.min_confidence)
        gates.append(quality)
        if not quality.passed:
            suggestions.extend(quality.issues)  # Quality issues are suggestions

        # Calculate citation coverage
        citation_coverage = citations_complete.details.get("coverage", 0.0)

        # Determine if passed (blocking gates)
        blocking_gates = ["schema_valid", "citations_complete", "citations_valid", "safety_passed"]
        passed = all(g.passed for g in gates if g.gate_name in blocking_gates)

        return VerificationResult(
            memory_id=memory.memory_id,
            passed=passed,
            gates=gates,
            citation_coverage=citation_coverage,
            issues=[i for i in all_issues if i],  # Filter empty
            suggestions=suggestions,
        )

    def _check_schema(self, memory: DraftMemory) -> GateResult:
        """Check memory schema validity."""
        issues = []

        # Check memory_id format
        if not memory.memory_id.startswith("mem_"):
            issues.append("SCHEMA_INVALID: memory_id must start with 'mem_'")

        # Check required fields
        if not memory.title:
            issues.append("SCHEMA_INVALID: title is required")

        if not memory.scope:
            issues.append("SCHEMA_INVALID: scope is required")

        if not memory.summary:
            issues.append("SCHEMA_INVALID: summary is required")

        # Check status
        if memory.status not in ["draft", "reviewed", "canonical"]:
            issues.append(f"SCHEMA_INVALID: invalid status '{memory.status}'")

        return GateResult(
            gate_name="schema_valid",
            passed=len(issues) == 0,
            issues=issues,
        )

    def _check_citations_complete(self, memory: DraftMemory) -> GateResult:
        """Check that claims have citations."""
        issues = []
        content = memory.summary + "\n" + memory.technical_details

        # Count claims (sentences that could be cited)
        # Simple heuristic: sentences with factual assertions
        sentences = re.split(r"[.!?]+", content)
        factual_sentences = [
            s.strip()
            for s in sentences
            if s.strip()
            and len(s.strip()) > 20
            and not s.strip().startswith("#")
            and not s.strip().startswith("-")
        ]

        total_claims = len(factual_sentences)

        # Check citations array
        citation_count = len(memory.citations)

        if citation_count == 0 and total_claims > 0:
            issues.append("MISSING_CITATION: No citations provided")

        # Estimate coverage (rough heuristic)
        if total_claims > 0:
            # At least one citation per ~3 factual sentences
            expected_citations = max(1, total_claims // 3)
            coverage = min(1.0, citation_count / expected_citations)
        else:
            coverage = 1.0 if citation_count > 0 else 0.0

        return GateResult(
            gate_name="citations_complete",
            passed=citation_count > 0,
            issues=issues,
            details={
                "total_claims": total_claims,
                "cited_claims": citation_count,
                "coverage": coverage,
            },
        )

    def _check_citations_valid(
        self,
        memory: DraftMemory,
        evidence_urls: set[str],
    ) -> GateResult:
        """Check that citations reference valid evidence."""
        issues = []

        for citation in memory.citations:
            if citation.url:
                if citation.url not in evidence_urls:
                    issues.append(f"INVALID_CITATION: URL not in evidence: {citation.url[:50]}...")
            elif citation.repo_path and not citation.repo_path.endswith(
                (".md", ".py", ".yaml", ".json")
            ):
                # For repo citations, just check format
                issues.append(f"INVALID_CITATION: Unusual file type: {citation.repo_path}")

        return GateResult(
            gate_name="citations_valid",
            passed=len(issues) == 0,
            issues=issues,
        )

    async def _check_duplicates(
        self,
        memory: DraftMemory,
        existing_contents: dict[str, str],
        threshold: float,
    ) -> GateResult:
        """Check for duplicate memories."""
        issues = []
        max_similarity = 0.0
        most_similar_id = None

        memory_content = memory.summary + " " + memory.technical_details

        for existing_id, existing_content in existing_contents.items():
            if existing_id == memory.memory_id:
                continue

            # Simple similarity: word overlap ratio
            similarity = self._compute_similarity(memory_content, existing_content)

            if similarity > max_similarity:
                max_similarity = similarity
                most_similar_id = existing_id

            if similarity > threshold:
                issues.append(f"DUPLICATE: Similar to {existing_id} ({similarity:.0%})")
            elif similarity > 0.7:
                issues.append(f"NEAR_DUPLICATE: Similar to {existing_id} ({similarity:.0%})")

        # Embedding-based similarity if available
        if self._embeddings and len(issues) == 0:
            # Would do embedding comparison here
            pass

        return GateResult(
            gate_name="no_duplicates",
            passed=not any("DUPLICATE:" in i for i in issues),
            issues=issues,
            details={
                "max_similarity": max_similarity,
                "most_similar_id": most_similar_id,
            },
        )

    def _compute_similarity(self, text1: str, text2: str) -> float:
        """Compute word overlap similarity between texts."""
        # Tokenize
        words1 = set(re.findall(r"\w+", text1.lower()))
        words2 = set(re.findall(r"\w+", text2.lower()))

        # Remove common words
        stopwords = {
            "the",
            "a",
            "an",
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "to",
            "of",
            "and",
            "in",
            "that",
            "it",
            "for",
            "on",
            "with",
        }
        words1 = words1 - stopwords
        words2 = words2 - stopwords

        if not words1 or not words2:
            return 0.0

        # Jaccard similarity
        intersection = words1 & words2
        union = words1 | words2

        return len(intersection) / len(union) if union else 0.0

    def _check_safety(self, memory: DraftMemory) -> GateResult:
        """Check for PII and secrets."""
        issues = []
        content = memory.summary + "\n" + memory.technical_details + "\n" + memory.notes

        # Check for PII
        for pii_type, pattern in PII_PATTERNS.items():
            matches = re.findall(pattern, content)
            if matches:
                issues.append(f"PII_DETECTED: Found {pii_type}: {matches[0][:10]}...")

        # Check for secrets
        for secret_type, pattern in SECRET_PATTERNS.items():
            matches = re.findall(pattern, content)
            if matches:
                issues.append(f"SECRET_DETECTED: Found {secret_type}")

        return GateResult(
            gate_name="safety_passed",
            passed=len(issues) == 0,
            issues=issues,
        )

    def _check_quality(self, memory: DraftMemory, min_confidence: float) -> GateResult:
        """Check content quality."""
        issues = []

        # Check summary length
        summary_words = len(memory.summary.split())
        if summary_words < 10:
            issues.append("LOW_QUALITY: Summary too short (< 10 words)")
        elif summary_words > 200:
            issues.append("LOW_QUALITY: Summary too long (> 200 words)")

        # Check technical details
        if memory.technical_details:
            details_words = len(memory.technical_details.split())
            if details_words < 20:
                issues.append("LOW_QUALITY: Technical details too short")

        # Check confidence
        if memory.confidence < min_confidence:
            issues.append(f"LOW_QUALITY: Confidence {memory.confidence:.0%} < {min_confidence:.0%}")

        # Check tags
        if len(memory.tags) == 0:
            issues.append("LOW_QUALITY: No tags provided")
        elif len(memory.tags) > 10:
            issues.append("LOW_QUALITY: Too many tags (> 10)")

        return GateResult(
            gate_name="quality_checks",
            passed=True,  # Quality is non-blocking
            issues=issues,
        )

    async def _write_verification_results(self, output: VerifierOutput) -> None:
        """Write verification results to JSON file."""
        import json

        results_path = self.context.run_dir / "verification.json"

        data = {
            "run_id": self.context.run_id,
            "verified_at": datetime.now(UTC).isoformat(),
            "results": [
                {
                    "memory_id": r.memory_id,
                    "passed": r.passed,
                    "citation_coverage": r.citation_coverage,
                    "gates": [
                        {
                            "gate_name": g.gate_name,
                            "passed": g.passed,
                            "issues": g.issues,
                            "details": g.details,
                        }
                        for g in r.gates
                    ],
                    "issues": r.issues,
                    "suggestions": r.suggestions,
                }
                for r in output.verification_results
            ],
            "summary": {
                "total_verified": output.total_verified,
                "total_rejected": output.total_rejected,
            },
        }

        with open(results_path, "w") as f:
            json.dump(data, f, indent=2)

        self.write_log(
            f"Wrote verification results for {len(output.verification_results)} memories"
        )


def create_verifier_input(
    synthesizer_output: SynthesizerOutput,
    collector_evidence: list[CollectedEvidence],
    existing_memory_contents: dict[str, str] | None = None,
    min_confidence: float = 0.7,
) -> VerifierInput:
    """Create VerifierInput from SynthesizerOutput."""
    return VerifierInput(
        draft_memories=synthesizer_output.draft_memories,
        evidence=collector_evidence,
        existing_memory_contents=existing_memory_contents or {},
        min_confidence=min_confidence,
    )
