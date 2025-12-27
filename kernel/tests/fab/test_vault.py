"""Test vault.py module."""

from __future__ import annotations

from pathlib import Path

import pytest

from cyntra.fab.vault import (
    copy_template,
    get_addon,
    get_template,
    get_vault_registry,
    install_addon,
)


class TestVaultRegistry:
    """Test VaultRegistry discovery and loading."""

    def test_find_vault_root(self):
        """Vault root should be discoverable from CWD."""
        vault = get_vault_registry()
        assert vault.vault_root.exists(), "Vault root should exist"
        assert (vault.vault_root / "catalog.yaml").exists(), "catalog.yaml should exist"

    def test_list_addons(self):
        """Should list all addons from catalog."""
        vault = get_vault_registry()
        addons = vault.list_addons()
        assert len(addons) >= 14, f"Expected at least 14 addons, got {len(addons)}"

        addon_ids = [a["id"] for a in addons]
        expected = ["gdunit4", "gut", "beehave", "gloot", "dialogue_manager"]
        for expected_id in expected:
            assert expected_id in addon_ids, f"Missing addon: {expected_id}"

    def test_list_addons_by_kind(self):
        """Should filter addons by kind."""
        vault = get_vault_registry()
        testing_addons = vault.list_addons(kind="testing")
        assert len(testing_addons) == 2, "Expected 2 testing addons (gdunit4, gut)"
        for a in testing_addons:
            assert a["kind"] == "testing"

    def test_list_templates(self):
        """Should list all templates."""
        vault = get_vault_registry()
        templates = vault.list_templates()
        assert len(templates) >= 3, f"Expected at least 3 templates, got {len(templates)}"

    def test_get_addon_exists(self):
        """Should retrieve addon entry."""
        addon = get_addon("gdunit4")
        assert addon is not None
        assert addon.id == "gdunit4"
        assert addon.kind == "testing"
        assert addon.local_path.exists(), f"Addon path should exist: {addon.local_path}"

    def test_get_addon_missing(self):
        """Should return None for unknown addon."""
        addon = get_addon("nonexistent_addon_xyz")
        assert addon is None

    def test_get_template_exists(self):
        """Should retrieve template entry."""
        template = get_template("fab_game_template")
        assert template is not None
        assert template.id == "fab_game_template"
        assert template.local_path.exists()


class TestVaultInstall:
    """Test addon/template installation."""

    @pytest.fixture
    def temp_project(self, tmp_path: Path) -> Path:
        """Create a temporary Godot project."""
        project = tmp_path / "test_project"
        project.mkdir()
        (project / "project.godot").write_text(
            '[gd_resource type="ProjectSettings"]\n[application]\nconfig/name="TestProject"\n'
        )
        return project

    def test_install_addon(self, temp_project: Path):
        """Should install addon to project."""
        result = install_addon("gdunit4", temp_project)
        assert result is True

        addon_path = temp_project / "addons" / "gdUnit4"
        assert addon_path.exists(), f"Addon should be installed at {addon_path}"
        assert (addon_path / "plugin.cfg").exists(), "plugin.cfg should exist"

    def test_install_addon_missing(self, temp_project: Path):
        """Should return False for missing addon."""
        result = install_addon("nonexistent_addon", temp_project)
        assert result is False

    def test_install_multiple_addons(self, temp_project: Path):
        """Should install multiple addons without conflicts."""
        addons_to_install = ["gdunit4", "beehave", "gloot"]

        for addon_id in addons_to_install:
            result = install_addon(addon_id, temp_project)
            assert result is True, f"Failed to install {addon_id}"

        # Verify all installed
        assert (temp_project / "addons" / "gdUnit4").exists()
        assert (temp_project / "addons" / "beehave").exists()
        assert (temp_project / "addons" / "gloot").exists()

    def test_copy_template(self, tmp_path: Path):
        """Should copy template to target."""
        target = tmp_path / "new_project"
        result = copy_template("fab_game_template", target)
        assert result is True
        assert target.exists()
        assert (target / "project.godot").exists()

    def test_copy_template_missing(self, tmp_path: Path):
        """Should return False for missing template."""
        target = tmp_path / "new_project"
        result = copy_template("nonexistent_template", target)
        assert result is False


class TestVaultHashes:
    """Test hash verification."""

    def test_addon_hash_verification(self):
        """Addon hashes should match catalog."""
        vault = get_vault_registry()
        addon = vault.get_addon("gdunit4")
        assert addon is not None
        assert addon.sha256 is not None, "gdunit4 should have a hash"

        actual = vault._compute_dir_hash(addon.local_path)
        assert actual == addon.sha256, f"Hash mismatch for gdunit4: {actual} != {addon.sha256}"

    def test_template_hash_verification(self):
        """Template hashes should match catalog."""
        vault = get_vault_registry()
        template = vault.get_template("fab_game_template")
        assert template is not None
        assert template.sha256 is not None, "fab_game_template should have a hash"

        actual = vault._compute_dir_hash(template.local_path)
        assert actual == template.sha256


class TestVaultWorldIntegration:
    """Test world.yaml integration."""

    def test_resolve_world_addons(self):
        """Should resolve required_addons from world.yaml format."""
        vault = get_vault_registry()

        required_addons = [
            {"id": "beehave", "required": True},
            {"id": "gloot", "required": True},
            {"id": "nonexistent", "required": False},
        ]

        resolved = vault.resolve_world_addons(required_addons)

        # Should resolve existing addons
        assert len(resolved) == 2
        resolved_ids = [a.id for a in resolved]
        assert "beehave" in resolved_ids
        assert "gloot" in resolved_ids
        # nonexistent is optional so no warning/error

    def test_resolve_world_addons_empty(self):
        """Should handle empty addon list."""
        vault = get_vault_registry()
        resolved = vault.resolve_world_addons([])
        assert resolved == []


class TestAllAddonsVendored:
    """Verify all expected addons are properly vendored."""

    EXPECTED_ADDONS = [
        "gdunit4",
        "gut",
        "debug_draw_3d",
        "panku_console",
        "phantom_camera",
        "dialogue_manager",
        "dialogic",
        "gloot",
        "beehave",
        "godot_state_charts",
        "proton_scatter",
        "gaea",
        "aseprite_wizard",
        "smart_shape_2d",
    ]

    @pytest.mark.parametrize("addon_id", EXPECTED_ADDONS)
    def test_addon_vendored(self, addon_id: str):
        """Each addon should be properly vendored with local files."""
        addon = get_addon(addon_id)
        assert addon is not None, f"Addon {addon_id} not found in catalog"
        assert addon.local_path.exists(), f"Addon {addon_id} not vendored at {addon.local_path}"

        # Check for plugin.cfg (most addons have this)
        plugin_cfg = addon.local_path / "plugin.cfg"
        if not plugin_cfg.exists():
            # Some addons have nested structure
            plugin_files = list(addon.local_path.rglob("plugin.cfg"))
            assert len(plugin_files) > 0 or addon_id in [
                "debug_draw_3d"  # Has GDExtension component
            ], f"No plugin.cfg found for {addon_id}"


class TestAllTemplatesVendored:
    """Verify all expected templates are properly vendored."""

    EXPECTED_TEMPLATES = [
        "fab_game_template",
        "maaack_game_template",
        "cogito",
    ]

    @pytest.mark.parametrize("template_id", EXPECTED_TEMPLATES)
    def test_template_vendored(self, template_id: str):
        """Each template should be properly vendored."""
        template = get_template(template_id)
        assert template is not None, f"Template {template_id} not found"
        assert template.local_path.exists(), f"Template {template_id} not vendored"
        assert (template.local_path / "project.godot").exists(), (
            f"Template {template_id} missing project.godot"
        )
