"""
World Manifest Generation and Tracking.

Creates and maintains manifest.json for world builds,
tracking all outputs with SHA256 hashes for reproducibility.
"""

import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class WorldManifest:
    """Tracks build progress and outputs in manifest.json."""

    def __init__(self, run_dir: Path, world_config, seed: int, params: dict[str, Any]):
        """Initialize manifest."""
        self.run_dir = run_dir
        self.world_config = world_config
        self.manifest_path = run_dir / "manifest.json"

        # Initialize manifest structure
        self.data = {
            "schema_version": "1.0",
            "world_id": world_config.world_id,
            "world_config_id": world_config.world_config_id or world_config.world_id,
            "world_version": world_config.version,
            "run_id": self._generate_run_id(world_config.world_id, seed),
            "created_at": datetime.now(UTC).isoformat(),
            "generator": world_config.generator,
            "determinism": {
                "seed": seed,
                **world_config.get_determinism_config(),
            },
            "versions": self._collect_versions(),
            "parameters": params,
            "stages": [],
            "final_outputs": [],
        }

    def _generate_run_id(self, world_id: str, seed: int) -> str:
        """Generate unique run ID."""
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        return f"world_{world_id}_seed{seed}_{timestamp}"

    def _collect_versions(self) -> dict[str, str]:
        """Collect tool versions for reproducibility."""
        versions = {}

        # Get Blender version if available
        blender_exe = "blender"
        if hasattr(self.world_config, "get_blender_executable"):
            blender_exe = self.world_config.get_blender_executable()

        try:
            result = subprocess.run(
                [blender_exe, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                # Parse "Blender 4.0.2" from output
                for line in result.stdout.split("\n"):
                    if line.startswith("Blender "):
                        versions["blender_version"] = line.split()[1]
                        break
        except (FileNotFoundError, subprocess.TimeoutExpired):
            versions["blender_version"] = "unknown"

        # Get kernel version
        try:
            from cyntra import __version__

            versions["dev_kernel_version"] = __version__
        except (ImportError, AttributeError):
            versions["dev_kernel_version"] = "development"

        # Get git commit
        versions["git_commit"] = "unknown"
        repo_root = self._find_repo_root()
        if repo_root is not None:
            try:
                result = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    cwd=repo_root,
                )
                if result.returncode == 0:
                    versions["git_commit"] = result.stdout.strip()[:7]
            except (FileNotFoundError, subprocess.TimeoutExpired):
                pass

        # Python version
        import sys

        versions["python_version"] = (
            f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        )

        return versions

    def _find_repo_root(self) -> Path | None:
        """
        Best-effort repo root detection (to record git commit).

        Prefers the nearest parent containing `.git`, starting from the world directory.
        """
        start = getattr(self.world_config, "world_dir", None)
        if not isinstance(start, Path):
            return None

        for candidate in [start.resolve(), *start.resolve().parents]:
            if (candidate / ".git").exists():
                return candidate

        return None

    def start_stage(self, stage_id: str) -> dict[str, Any]:
        """Mark stage as started."""
        stage_entry = {
            "id": stage_id,
            "status": "running",
            "started_at": datetime.now(UTC).isoformat(),
            "duration_ms": 0,
            "outputs": [],
            "metadata": {},
            "errors": [],
        }

        self.data["stages"].append(stage_entry)
        self.save()

        return stage_entry

    def complete_stage(
        self,
        stage_id: str,
        success: bool,
        outputs: list[str],
        metadata: dict[str, Any],
        errors: list[str],
        duration_ms: int,
        *,
        optional: bool = False,
        status: str | None = None,
    ):
        """Mark stage as completed."""
        # Find stage entry
        stage_entry = None
        for stage in self.data["stages"]:
            if stage["id"] == stage_id:
                stage_entry = stage
                break

        if not stage_entry:
            raise ValueError(f"Stage {stage_id} not found in manifest")

        # Update stage
        stage_entry["status"] = status or ("success" if success else "failed")
        stage_entry["duration_ms"] = duration_ms
        stage_entry["metadata"] = metadata
        stage_entry["errors"] = errors
        stage_entry["optional"] = bool(optional)

        # Add outputs with SHA256 hashes
        for output_path in outputs:
            output_file = Path(output_path)
            if output_file.exists():
                file_hash = self._sha256_file(output_file)
                file_size = output_file.stat().st_size

                # Make path relative to run_dir for portability
                try:
                    rel_path = output_file.relative_to(self.run_dir)
                except ValueError:
                    # Path is outside run_dir, use absolute
                    rel_path = output_file

                stage_entry["outputs"].append(
                    {
                        "path": str(rel_path),
                        "sha256": file_hash,
                        "size_bytes": file_size,
                    }
                )

        self.save()

    def add_final_outputs(self, output_patterns: list[str]):
        """
        Add final outputs from completed build.

        Args:
            output_patterns: List of output paths or glob patterns
        """
        from glob import glob

        for pattern in output_patterns:
            # Resolve pattern relative to run_dir
            if "*" in pattern:
                # Glob pattern
                search_path = self.run_dir / pattern
                matches = glob(str(search_path))
            else:
                # Direct path
                matches = [str(self.run_dir / pattern)]

            for match_path in matches:
                output_file = Path(match_path)
                if output_file.exists():
                    file_hash = self._sha256_file(output_file)
                    file_size = output_file.stat().st_size

                    try:
                        rel_path = output_file.relative_to(self.run_dir)
                    except ValueError:
                        rel_path = output_file

                    self.data["final_outputs"].append(
                        {
                            "path": str(rel_path),
                            "sha256": file_hash,
                            "size_bytes": file_size,
                        }
                    )

        self.save()

    def _sha256_file(self, file_path: Path) -> str:
        """Calculate SHA256 hash of file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            # Read in chunks to handle large files
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def save(self):
        """Save manifest to disk."""
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.manifest_path, "w") as f:
            json.dump(self.data, f, indent=2)

    def get_run_id(self) -> str:
        """Get the run ID."""
        return self.data["run_id"]

    def is_success(self) -> bool:
        """Check if all stages succeeded."""
        for stage in self.data["stages"]:
            status = stage.get("status")
            if status == "success":
                continue
            if stage.get("optional") and status in ("optional_failed", "skipped"):
                continue
            return False

        return True

    def get_stage_status(self, stage_id: str) -> str:
        """Get status of a specific stage."""
        for stage in self.data["stages"]:
            if stage["id"] == stage_id:
                return stage["status"]
        return "not_started"

    def to_dict(self) -> dict[str, Any]:
        """Get manifest as dictionary."""
        return self.data
