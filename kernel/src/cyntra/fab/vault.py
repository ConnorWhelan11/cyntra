"""
UDE Vault - Curated Godot templates, addons, and tooling.

Provides:
1. Discovery of vault entries via catalog
2. Installation of addons to Godot projects
3. Hash verification for drift detection
4. Integration with world.yaml required_addons

Usage:
    from cyntra.fab.vault import get_vault_registry, install_addon

    vault = get_vault_registry()
    addon = vault.get_addon("gdunit4")
    vault.install_addon("gdunit4", project_path)
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)


@dataclass
class VaultEntry:
    """Base vault entry."""

    id: str
    kind: str
    version: str
    upstream: str | None
    pinned_ref: str | None
    sha256: str | None
    godot_min: str
    install_path: str
    why: str
    local_path: Path


@dataclass
class AddonEntry(VaultEntry):
    """Addon-specific vault entry."""

    dependencies: list[str] = field(default_factory=list)


@dataclass
class TemplateEntry(VaultEntry):
    """Template-specific vault entry."""

    features: dict[str, bool] = field(default_factory=dict)
    bundled_addons: list[str] = field(default_factory=list)


class VaultRegistry:
    """
    Registry for UDE Vault entries.

    Discovery follows the gate config pattern - searches upward from CWD.
    """

    def __init__(self, vault_root: Path | None = None):
        if vault_root is None:
            vault_root = self._find_vault_root()
        self.vault_root = vault_root
        self._catalog: dict[str, Any] | None = None
        self._addons: dict[str, AddonEntry] = {}
        self._templates: dict[str, TemplateEntry] = {}

    def _find_vault_root(self) -> Path:
        """Find vault root, searching upward like find_gate_config."""
        search_paths = [Path("fab/vault"), Path(".fab/vault")]

        cwd = Path.cwd().resolve()
        for parent in [cwd, *cwd.parents]:
            for rel in search_paths:
                candidate = parent / rel
                if (candidate / "catalog.yaml").exists():
                    return candidate

        # Default fallback
        return Path("fab/vault")

    def _load_catalog(self) -> None:
        """Load master catalog."""
        catalog_path = self.vault_root / "catalog.yaml"
        if not catalog_path.exists():
            logger.warning(f"Vault catalog not found: {catalog_path}")
            self._catalog = {"addons": [], "templates": [], "tooling": []}
            return

        with open(catalog_path) as f:
            self._catalog = yaml.safe_load(f)

        addon_count = len(self._catalog.get("addons", []))
        template_count = len(self._catalog.get("templates", []))
        logger.info(f"Loaded vault catalog: {addon_count} addons, {template_count} templates")

    def get_addon(self, addon_id: str) -> AddonEntry | None:
        """Get addon entry by ID."""
        if self._catalog is None:
            self._load_catalog()

        if addon_id in self._addons:
            return self._addons[addon_id]

        for entry in self._catalog.get("addons", []):
            if entry.get("id") == addon_id:
                addon = self._load_addon_manifest(entry)
                if addon:
                    self._addons[addon_id] = addon
                return addon

        return None

    def _load_addon_manifest(self, catalog_entry: dict[str, Any]) -> AddonEntry | None:
        """Load full addon manifest."""
        addon_id = catalog_entry["id"]
        manifest_path = self.vault_root / "godot/addons" / addon_id / "manifest.json"

        manifest: dict[str, Any] = {}
        if manifest_path.exists():
            with open(manifest_path) as f:
                manifest = json.load(f)

        return AddonEntry(
            id=addon_id,
            kind=catalog_entry.get("kind", "unknown"),
            version=catalog_entry.get("pinned_ref", "unknown"),
            upstream=catalog_entry.get("upstream"),
            pinned_ref=catalog_entry.get("pinned_ref"),
            sha256=catalog_entry.get("sha256"),
            godot_min=catalog_entry.get("godot_min", "4.0"),
            install_path=catalog_entry.get("install_path", f"addons/{addon_id}"),
            why=catalog_entry.get("why", ""),
            local_path=self.vault_root / "godot/addons" / addon_id / "addon",
            dependencies=manifest.get("compatibility", {}).get("dependencies", []),
        )

    def get_template(self, template_id: str) -> TemplateEntry | None:
        """Get template entry by ID."""
        if self._catalog is None:
            self._load_catalog()

        if template_id in self._templates:
            return self._templates[template_id]

        for entry in self._catalog.get("templates", []):
            if entry.get("id") == template_id:
                template = self._load_template_manifest(entry)
                if template:
                    self._templates[template_id] = template
                return template

        return None

    def _load_template_manifest(self, catalog_entry: dict[str, Any]) -> TemplateEntry | None:
        """Load full template manifest."""
        template_id = catalog_entry["id"]
        manifest_path = self.vault_root / "godot/templates" / template_id / "manifest.json"

        manifest: dict[str, Any] = {}
        if manifest_path.exists():
            with open(manifest_path) as f:
                manifest = json.load(f)

        return TemplateEntry(
            id=template_id,
            kind=catalog_entry.get("kind", "game"),
            version=catalog_entry.get("version", "1.0.0"),
            upstream=catalog_entry.get("upstream"),
            pinned_ref=catalog_entry.get("pinned_ref"),
            sha256=catalog_entry.get("sha256"),
            godot_min=catalog_entry.get("godot_min", "4.0"),
            install_path="",
            why=catalog_entry.get("why", ""),
            local_path=self.vault_root / "godot/templates" / template_id / "project",
            features=manifest.get("features", {}),
            bundled_addons=[a["id"] for a in manifest.get("bundled_addons", [])],
        )

    def list_addons(self, kind: str | None = None) -> list[dict[str, Any]]:
        """List available addons."""
        if self._catalog is None:
            self._load_catalog()

        addons = self._catalog.get("addons", [])
        if kind:
            addons = [a for a in addons if a.get("kind") == kind]
        return addons

    def list_templates(self, kind: str | None = None) -> list[dict[str, Any]]:
        """List available templates."""
        if self._catalog is None:
            self._load_catalog()

        templates = self._catalog.get("templates", [])
        if kind:
            templates = [t for t in templates if t.get("kind") == kind]
        return templates

    def install_addon(
        self,
        addon_id: str,
        target_project: Path,
        verify_hash: bool = True,
    ) -> bool:
        """
        Install addon to a Godot project.

        Args:
            addon_id: Addon identifier
            target_project: Path to Godot project directory
            verify_hash: Whether to verify SHA256 before install

        Returns:
            True if installed successfully
        """
        addon = self.get_addon(addon_id)
        if not addon:
            logger.error(f"Addon not found: {addon_id}")
            return False

        if not addon.local_path.exists():
            logger.error(f"Addon not cached: {addon.local_path}")
            return False

        if verify_hash and addon.sha256:
            actual_hash = self._compute_dir_hash(addon.local_path)
            if actual_hash != addon.sha256:
                logger.error(
                    f"Addon hash mismatch for {addon_id}: expected {addon.sha256}, got {actual_hash}"
                )
                return False

        target_path = target_project / addon.install_path
        target_path.parent.mkdir(parents=True, exist_ok=True)

        if target_path.exists():
            shutil.rmtree(target_path)

        shutil.copytree(addon.local_path, target_path)
        logger.info(f"Installed addon {addon_id} to {target_path}")
        return True

    def copy_template(
        self,
        template_id: str,
        target_path: Path,
        verify_hash: bool = True,
    ) -> bool:
        """
        Copy template to target directory.

        Args:
            template_id: Template identifier
            target_path: Target directory for template copy
            verify_hash: Whether to verify SHA256 before copy

        Returns:
            True if copied successfully
        """
        template = self.get_template(template_id)
        if not template:
            logger.error(f"Template not found: {template_id}")
            return False

        if not template.local_path.exists():
            logger.error(f"Template not cached: {template.local_path}")
            return False

        if verify_hash and template.sha256:
            actual_hash = self._compute_dir_hash(template.local_path)
            if actual_hash != template.sha256:
                logger.error(f"Template hash mismatch for {template_id}")
                return False

        if target_path.exists():
            shutil.rmtree(target_path)

        shutil.copytree(template.local_path, target_path)
        logger.info(f"Copied template {template_id} to {target_path}")
        return True

    def resolve_world_addons(
        self,
        required_addons: list[dict[str, Any]],
    ) -> list[AddonEntry]:
        """
        Resolve required_addons from world.yaml to vault entries.

        Args:
            required_addons: List from world.yaml generator.required_addons

        Returns:
            List of resolved AddonEntry objects
        """
        resolved = []
        for spec in required_addons:
            addon_id = spec.get("id")
            if not addon_id:
                continue

            addon = self.get_addon(addon_id)
            if addon:
                resolved.append(addon)
            elif spec.get("required", True):
                logger.warning(f"Required addon not in vault: {addon_id}")
        return resolved

    def _compute_dir_hash(self, dir_path: Path) -> str:
        """Compute SHA256 hash of directory contents."""
        hasher = hashlib.sha256()
        for file_path in sorted(dir_path.rglob("*")):
            if file_path.is_file():
                rel_path = file_path.relative_to(dir_path)
                hasher.update(str(rel_path).encode())
                hasher.update(file_path.read_bytes())
        return hasher.hexdigest()


# Module-level convenience functions
_global_registry: VaultRegistry | None = None


def get_vault_registry(vault_root: Path | None = None) -> VaultRegistry:
    """Get the global vault registry."""
    global _global_registry
    if _global_registry is None or vault_root is not None:
        _global_registry = VaultRegistry(vault_root)
    return _global_registry


def get_addon(addon_id: str) -> AddonEntry | None:
    """Get addon by ID."""
    return get_vault_registry().get_addon(addon_id)


def get_template(template_id: str) -> TemplateEntry | None:
    """Get template by ID."""
    return get_vault_registry().get_template(template_id)


def install_addon(addon_id: str, target_project: Path) -> bool:
    """Install addon to Godot project."""
    return get_vault_registry().install_addon(addon_id, target_project)


def copy_template(template_id: str, target_path: Path) -> bool:
    """Copy template to target directory."""
    return get_vault_registry().copy_template(template_id, target_path)
