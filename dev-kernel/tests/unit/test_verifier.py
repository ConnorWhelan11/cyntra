"""Tests for the Verifier."""

from pathlib import Path

from dev_kernel.adapters.base import PatchProof
from dev_kernel.kernel.config import GatesConfig, KernelConfig
from dev_kernel.kernel.verifier import Verifier


def test_verifier_never_passes_failed_execution(tmp_path: Path) -> None:
    """A toolchain-level failure cannot be marked verified by downstream gates."""
    config = KernelConfig(
        max_concurrent_workcells=1,
        toolchain_priority=["codex"],
        gates=GatesConfig(
            test_command="pytest",
            typecheck_command="mypy .",
            lint_command="ruff check .",
        ),
    )
    verifier = Verifier(config)

    workcell_path = tmp_path / "wc-1"
    workcell_path.mkdir(parents=True, exist_ok=True)

    proof = PatchProof(
        schema_version="1.0.0",
        workcell_id="wc-1",
        issue_id="1",
        status="failed",
        patch={},
        verification={"all_passed": True},
        metadata={},
    )

    passed = verifier.verify(proof, workcell_path)

    assert passed is False
    assert isinstance(proof.verification, dict)
    assert proof.verification.get("all_passed") is False
    assert "status:failed" in (proof.verification.get("blocking_failures") or [])

    assert (workcell_path / "proof.json").exists()

