"""
RunReceipt generation and canonicalization.

A RunReceipt is the attestable record of a completed run,
containing references to the universe, world, run artifacts,
and quality verdict.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path


@dataclass
class Universe:
    """Universe reference."""

    id: str
    name: str


@dataclass
class World:
    """World reference."""

    id: str
    name: str
    version: str | None = None


@dataclass
class Run:
    """Run metadata."""

    id: str
    timestamp: str
    git_sha: str
    toolchain: str  # codex, claude, opencode, crush, blender, fab


@dataclass
class Artifacts:
    """Artifact references."""

    manifest_hash: str  # 0x-prefixed SHA256
    proof_hash: str | None = None
    primary_asset_hash: str | None = None
    ipfs_cid: str | None = None


@dataclass
class Verdict:
    """Quality gate verdict."""

    passed: bool
    gate_id: str | None = None
    scores: dict = field(default_factory=dict)


@dataclass
class Attestation:
    """Attestation reference (filled after publishing)."""

    uid: str
    chain_id: int
    attester: str
    timestamp: str


@dataclass
class RunReceipt:
    """
    Complete run receipt for attestation.

    This structure matches the TypeScript RunReceiptSchema
    in packages/membrane/src/types/receipt.ts
    """

    version: str
    universe: Universe
    world: World
    run: Run
    artifacts: Artifacts
    verdict: Verdict
    attestation: Attestation | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary, excluding None values."""

        def clean(obj):
            if isinstance(obj, dict):
                return {k: clean(v) for k, v in obj.items() if v is not None}
            elif isinstance(obj, list):
                return [clean(v) for v in obj]
            else:
                return obj

        return clean(asdict(self))

    def to_canonical(self) -> str:
        """
        Return canonical JSON representation.

        Keys are sorted, no whitespace, consistent encoding.
        Matches the canonicalize() function in membrane.
        """
        return json.dumps(
            self.to_dict(),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )

    def hash(self) -> str:
        """
        Compute keccak256 hash of canonical representation.

        Returns 0x-prefixed hex string matching membrane's hashObject().
        """
        try:
            from eth_hash.auto import keccak

            canonical = self.to_canonical()
            hash_bytes = keccak(canonical.encode("utf-8"))
            return "0x" + hash_bytes.hex()
        except ImportError:
            # Fallback to SHA256 if eth_hash not available
            canonical = self.to_canonical()
            hash_bytes = hashlib.sha256(canonical.encode("utf-8")).digest()
            return "0x" + hash_bytes.hex()

    def save(self, path: Path) -> None:
        """Save receipt to JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, path: Path) -> RunReceipt:
        """Load receipt from JSON file."""
        with open(path) as f:
            data = json.load(f)
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: dict) -> RunReceipt:
        """Create RunReceipt from dictionary."""
        attestation = None
        if data.get("attestation"):
            attestation = Attestation(**data["attestation"])

        return cls(
            version=data["version"],
            universe=Universe(**data["universe"]),
            world=World(**data["world"]),
            run=Run(**data["run"]),
            artifacts=Artifacts(**data["artifacts"]),
            verdict=Verdict(**data["verdict"]),
            attestation=attestation,
        )


def hash_file(path: Path) -> str:
    """
    Compute SHA256 hash of a file.

    Returns 0x-prefixed hex string.
    """
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)
    return "0x" + hasher.hexdigest()


def generate_receipt(run_dir: Path) -> RunReceipt:
    """
    Generate a RunReceipt from a completed run directory.

    Expects the run directory to contain:
    - context.json: Run context with universe/world/toolchain info
    - manifest.json: Manifest of all run artifacts
    - proof.json: Quality gate proof with verdict

    Args:
        run_dir: Path to the run directory (e.g., .cyntra/runs/<run_id>/)

    Returns:
        RunReceipt ready for publishing
    """
    run_dir = Path(run_dir)

    # Load context
    context_path = run_dir / "context.json"
    if not context_path.exists():
        raise FileNotFoundError(f"context.json not found in {run_dir}")

    with open(context_path) as f:
        context = json.load(f)

    # Load manifest
    manifest_path = run_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found in {run_dir}")

    manifest_hash = hash_file(manifest_path)

    # Load proof
    proof_path = run_dir / "proof.json"
    proof_hash = None
    verdict_data = {"passed": False}

    if proof_path.exists():
        proof_hash = hash_file(proof_path)
        with open(proof_path) as f:
            proof = json.load(f)
        verdict_data = proof.get("verdict", verdict_data)

    # Extract universe/world info from context
    universe_id = context.get("universe_id", "default")
    universe_name = context.get("universe_name", universe_id)
    world_id = context.get("world_id", "default")
    world_name = context.get("world_name", world_id)
    world_version = context.get("world_version")

    # Build receipt
    return RunReceipt(
        version="0.1.0",
        universe=Universe(
            id=universe_id,
            name=universe_name,
        ),
        world=World(
            id=world_id,
            name=world_name,
            version=world_version,
        ),
        run=Run(
            id=run_dir.name,
            timestamp=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            git_sha=context.get("git_sha", "0" * 40),
            toolchain=context.get("toolchain", "unknown"),
        ),
        artifacts=Artifacts(
            manifest_hash=manifest_hash,
            proof_hash=proof_hash,
            primary_asset_hash=context.get("primary_asset_hash"),
        ),
        verdict=Verdict(
            passed=verdict_data.get("passed", False),
            gate_id=verdict_data.get("gate_id"),
            scores=verdict_data.get("scores", {}),
        ),
    )
