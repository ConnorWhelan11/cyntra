"""
WorkcellManager - Creates and manages isolated git worktree execution environments.

Responsibilities:
- Create git worktrees for task isolation
- Manage workcell lifecycle
- Archive logs on cleanup
- Prevent cross-workcell contamination
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from cyntra.kernel.config import KernelConfig

logger = structlog.get_logger()


class WorkcellManager:
    """
    Manages isolated git worktree execution environments.
    """

    def __init__(self, config: KernelConfig, repo_root: Path) -> None:
        self.config = config
        self.repo_root = repo_root
        self.workcells_dir = config.workcells_dir
        self.archives_dir = config.archives_dir

        # Ensure directories exist
        self.workcells_dir.mkdir(parents=True, exist_ok=True)
        self.archives_dir.mkdir(parents=True, exist_ok=True)

    def create(
        self,
        issue_id: str,
        speculate_tag: str | None = None,
    ) -> Path:
        """
        Create an isolated workcell (git worktree) for a task.

        Returns the path to the workcell directory.
        """
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        tag_slug = self._slugify_speculate_tag(speculate_tag)
        suffix = ""
        workcell_name = ""
        branch_name = ""
        workcell_path = self.workcells_dir

        for _ in range(6):
            extra_parts = [part for part in (tag_slug, suffix) if part]
            name_suffix = "-".join([str(issue_id), timestamp, *extra_parts])
            workcell_name = f"wc-{name_suffix}"
            branch_tail = "-".join([timestamp, *extra_parts])
            branch_name = f"wc/{issue_id}/{branch_tail}"
            workcell_path = self.workcells_dir / workcell_name

            if not workcell_path.exists() and not self._branch_exists(branch_name):
                break

            suffix = uuid.uuid4().hex[:6]
        else:
            raise RuntimeError("Failed to allocate unique workcell name")

        logger.info(
            "Creating workcell",
            workcell_id=workcell_name,
            issue_id=issue_id,
            speculate_tag=speculate_tag,
        )

        # Create isolated worktree from main
        result = subprocess.run(
            [
                "git",
                "worktree",
                "add",
                str(workcell_path),
                "-b",
                branch_name,
                "main",
            ],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            self._cleanup_failed_worktree(workcell_path, branch_name)
            raise RuntimeError(f"Failed to create worktree: {result.stderr}")

        # Remove .beads from workcell (kernel owns it)
        beads_path = workcell_path / ".beads"
        if beads_path.exists():
            shutil.rmtree(beads_path, ignore_errors=True)

        # Remove .cyntra from workcell (kernel owns it)
        cyntra_path = workcell_path / ".cyntra"
        if cyntra_path.exists():
            shutil.rmtree(cyntra_path, ignore_errors=True)

        # Create logs directory
        logs_path = workcell_path / "logs"
        logs_path.mkdir(parents=True, exist_ok=True)

        # Sync prompt genomes/frontier into the workcell so adapters can load them
        # even when prompts are uncommitted locally.
        self._sync_prompts(workcell_path)

        # Create isolation marker
        marker = {
            "id": workcell_name,
            "issue_id": issue_id,
            "created": timestamp,
            "parent_commit": self._get_main_head(),
            "speculate_tag": speculate_tag,
            "branch_name": branch_name,
        }
        (workcell_path / ".workcell").write_text(json.dumps(marker, indent=2))

        logger.info("Workcell created", workcell_id=workcell_name, path=str(workcell_path))
        return workcell_path

    def cleanup(self, workcell_path: Path, keep_logs: bool = True) -> None:
        """
        Safely remove a workcell.

        Optionally archives logs before removal.
        """
        workcell_name = workcell_path.name

        logger.info("Cleaning up workcell", workcell_id=workcell_name, keep_logs=keep_logs)

        # Archive logs if requested
        if keep_logs:
            self._archive_logs(workcell_path)

        # Get branch name from marker
        branch_name = self._get_branch_for_workcell(workcell_path)

        # Remove worktree
        result = subprocess.run(
            ["git", "worktree", "remove", "--force", str(workcell_path)],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            logger.warning(
                "Failed to remove worktree",
                workcell_id=workcell_name,
                error=result.stderr,
            )

        # Delete branch (best effort)
        if branch_name:
            subprocess.run(
                ["git", "branch", "-D", branch_name],
                cwd=self.repo_root,
                capture_output=True,
            )

        logger.info("Workcell cleaned up", workcell_id=workcell_name)

    def list_active(self) -> list[Path]:
        """List all active workcells."""
        if not self.workcells_dir.exists():
            return []

        return [
            p for p in self.workcells_dir.iterdir() if p.is_dir() and (p / ".workcell").exists()
        ]

    def get_workcell_info(self, workcell_path: Path) -> dict | None:
        """Get metadata for a workcell."""
        marker_path = workcell_path / ".workcell"

        if not marker_path.exists():
            return None

        return json.loads(marker_path.read_text())

    def _get_main_head(self) -> str:
        """Get the current HEAD of main branch."""
        result = subprocess.run(
            ["git", "rev-parse", "main"],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return "unknown"

        return result.stdout.strip()

    def _get_branch_for_workcell(self, workcell_path: Path) -> str | None:
        """Get the branch name for a workcell."""
        info = self.get_workcell_info(workcell_path)

        if not info:
            return None

        branch_name = info.get("branch_name")
        if isinstance(branch_name, str) and branch_name:
            return branch_name

        issue_id = info.get("issue_id")
        created = info.get("created")

        if issue_id and created:
            return f"wc/{issue_id}/{created}"

        return None

    def _slugify_speculate_tag(self, speculate_tag: str | None) -> str | None:
        if not speculate_tag:
            return None
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", speculate_tag).strip("-").lower()
        return safe[:24] if safe else None

    def _branch_exists(self, branch_name: str) -> bool:
        result = subprocess.run(
            ["git", "show-ref", "--verify", f"refs/heads/{branch_name}"],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
        )
        return result.returncode == 0

    def _cleanup_failed_worktree(self, workcell_path: Path, branch_name: str) -> None:
        if workcell_path.exists():
            result = subprocess.run(
                ["git", "worktree", "remove", "--force", str(workcell_path)],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                logger.warning(
                    "Failed to remove partial worktree",
                    workcell_id=workcell_path.name,
                    error=result.stderr,
                )

        if branch_name and self._branch_exists(branch_name):
            result = subprocess.run(
                ["git", "branch", "-D", branch_name],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                logger.warning(
                    "Failed to delete partial worktree branch",
                    branch_name=branch_name,
                    error=result.stderr,
                )

    def _archive_logs(self, workcell_path: Path) -> None:
        """
        Archive workcell logs recursively.

        This preserves the full directory structure including nested directories
        like logs/fab/ for render artifacts and critic reports.
        """
        workcell_name = workcell_path.name
        logs_path = workcell_path / "logs"

        if not logs_path.exists():
            return

        archive_path = self.archives_dir / workcell_name
        archive_path.mkdir(parents=True, exist_ok=True)

        # Copy entire logs directory recursively (preserves fab/ subdirectories)
        archive_logs_path = archive_path / "logs"
        if archive_logs_path.exists():
            shutil.rmtree(archive_logs_path)
        shutil.copytree(logs_path, archive_logs_path, dirs_exist_ok=True)

        # Also copy core artifacts if they exist.
        for filename in [
            "proof.json",
            "manifest.json",
            "telemetry.jsonl",
            "rollout.json",
            "strategy_profile.json",
            "prompt.md",
            ".workcell",
        ]:
            src = workcell_path / filename
            if src.exists():
                shutil.copy(src, archive_path)

        # Copy any render output directories that may exist at workcell root
        for dirname in ["renders", "output", "assets"]:
            src_dir = workcell_path / dirname
            if src_dir.exists() and src_dir.is_dir():
                dst_dir = archive_path / dirname
                if dst_dir.exists():
                    shutil.rmtree(dst_dir)
                shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)

        logger.info(
            "Logs archived",
            workcell_id=workcell_name,
            archive=str(archive_path),
            preserved_structure=True,
        )

    def _sync_prompts(self, workcell_path: Path) -> None:
        """
        Copy repo-level prompts into the workcell.

        Workcells are git worktrees and do not include untracked files from the
        main working tree. Copying prompts ensures prompt genomes and frontier
        files are available for prompt composition during execution.
        """
        src_root = self.repo_root / "prompts"
        if not src_root.is_dir():
            return

        dst_root = workcell_path / "prompts"
        dst_root.mkdir(parents=True, exist_ok=True)

        for src in src_root.rglob("*"):
            if not src.is_file():
                continue
            if src.name in {".DS_Store"}:
                continue
            try:
                rel = src.relative_to(src_root)
            except ValueError:
                continue
            dst = dst_root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(src, dst)
            except OSError:
                # Best-effort; prompts are optional.
                continue
