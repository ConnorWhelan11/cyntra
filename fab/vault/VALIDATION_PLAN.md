# UDE Vault Validation Plan

Comprehensive test plan to verify all Godot addons, GDExtensions, and templates work correctly and can be leveraged by Cyntra.

## Inventory Summary

### GDScript Addons (14 total)

| ID                 | Kind                  | Version  | Status   |
| ------------------ | --------------------- | -------- | -------- |
| gdunit4            | testing               | v4.4.0   | vendored |
| gut                | testing               | v9.3.0   | vendored |
| debug_draw_3d      | debug                 | 1.4.5    | vendored |
| panku_console      | debug                 | v1.7.9   | vendored |
| phantom_camera     | camera                | v0.8.2   | vendored |
| dialogue_manager   | dialogue              | v3.0.1   | vendored |
| dialogic           | dialogue              | v1.5.1   | vendored |
| gloot              | inventory             | v3.0.1   | vendored |
| beehave            | ai                    | v2.9.2   | vendored |
| godot_state_charts | state_machine         | v0.9.1   | vendored |
| proton_scatter     | scattering            | 4.0      | vendored |
| gaea               | procedural_generation | 2.0      | vendored |
| aseprite_wizard    | animation             | v9.6.0-4 | vendored |
| smart_shape_2d     | 2d_tools              | v3.3.1   | vendored |

### GDExtensions (5 total - require binaries)

| ID           | Kind     | Version       | Platforms                     |
| ------------ | -------- | ------------- | ----------------------------- |
| terrain3d    | terrain  | v1.0.1        | win/linux/mac                 |
| godot_jolt   | physics  | v0.9.0-stable | win/linux/mac/android/ios     |
| limboai      | ai       | v1.5.3        | win/linux/mac/android/ios/web |
| godot_steam  | platform | v4.17         | win/linux/mac                 |
| godot_sqlite | database | v4.6          | win/linux/mac/android/ios/web |

### Templates (3 vendored + 1 placeholder)

| ID                   | Kind          | Version | Status      |
| -------------------- | ------------- | ------- | ----------- |
| fab_game_template    | game          | 1.0.0   | vendored    |
| maaack_game_template | game          | v1.4.2  | vendored    |
| cogito               | immersive_sim | v1.1.2  | vendored    |
| minimal_template     | minimal       | 1.0.0   | placeholder |

---

## Phase 1: Python API Tests

### 1.1 Unit Tests for vault.py

Create `kernel/tests/fab/test_vault.py`:

```python
"""Test vault.py module."""
import pytest
from pathlib import Path
from cyntra.fab.vault import (
    get_vault_registry,
    get_addon,
    get_template,
    install_addon,
    copy_template,
)

class TestVaultRegistry:
    def test_find_vault_root(self):
        """Vault root should be discoverable from CWD."""
        vault = get_vault_registry()
        assert vault.vault_root.exists()
        assert (vault.vault_root / "catalog.yaml").exists()

    def test_list_addons(self):
        """Should list all addons from catalog."""
        vault = get_vault_registry()
        addons = vault.list_addons()
        assert len(addons) >= 14
        addon_ids = [a["id"] for a in addons]
        assert "gdunit4" in addon_ids
        assert "beehave" in addon_ids

    def test_list_addons_by_kind(self):
        """Should filter addons by kind."""
        vault = get_vault_registry()
        testing_addons = vault.list_addons(kind="testing")
        assert len(testing_addons) == 2  # gdunit4, gut
        for a in testing_addons:
            assert a["kind"] == "testing"

    def test_list_templates(self):
        """Should list all templates."""
        vault = get_vault_registry()
        templates = vault.list_templates()
        assert len(templates) >= 3

    def test_get_addon_exists(self):
        """Should retrieve addon entry."""
        addon = get_addon("gdunit4")
        assert addon is not None
        assert addon.id == "gdunit4"
        assert addon.kind == "testing"
        assert addon.local_path.exists()

    def test_get_addon_missing(self):
        """Should return None for unknown addon."""
        addon = get_addon("nonexistent_addon")
        assert addon is None

    def test_get_template_exists(self):
        """Should retrieve template entry."""
        template = get_template("fab_game_template")
        assert template is not None
        assert template.id == "fab_game_template"
        assert template.local_path.exists()


class TestVaultInstall:
    @pytest.fixture
    def temp_project(self, tmp_path):
        """Create a temporary Godot project."""
        project = tmp_path / "test_project"
        project.mkdir()
        (project / "project.godot").write_text("[config]\nproject_name=Test\n")
        return project

    def test_install_addon(self, temp_project):
        """Should install addon to project."""
        result = install_addon("gdunit4", temp_project)
        assert result is True
        assert (temp_project / "addons" / "gdUnit4").exists()
        assert (temp_project / "addons" / "gdUnit4" / "plugin.cfg").exists()

    def test_install_multiple_addons(self, temp_project):
        """Should install multiple addons without conflicts."""
        assert install_addon("gdunit4", temp_project)
        assert install_addon("beehave", temp_project)
        assert install_addon("gloot", temp_project)
        assert (temp_project / "addons" / "gdUnit4").exists()
        assert (temp_project / "addons" / "beehave").exists()
        assert (temp_project / "addons" / "gloot").exists()

    def test_copy_template(self, tmp_path):
        """Should copy template to target."""
        target = tmp_path / "new_project"
        result = copy_template("fab_game_template", target)
        assert result is True
        assert target.exists()
        assert (target / "project.godot").exists()


class TestVaultHashes:
    def test_addon_hash_verification(self):
        """Addon hashes should match catalog."""
        vault = get_vault_registry()
        addon = vault.get_addon("gdunit4")
        if addon and addon.sha256:
            actual = vault._compute_dir_hash(addon.local_path)
            assert actual == addon.sha256, f"Hash mismatch for gdunit4"

    def test_template_hash_verification(self):
        """Template hashes should match catalog."""
        vault = get_vault_registry()
        template = vault.get_template("fab_game_template")
        if template and template.sha256:
            actual = vault._compute_dir_hash(template.local_path)
            assert actual == template.sha256
```

### 1.2 Run Unit Tests

```bash
cd kernel
pytest tests/fab/test_vault.py -v
```

---

## Phase 2: Godot Project Load Tests

### 2.1 Test Harness Setup

Create a test script that:

1. Creates a fresh Godot project from template
2. Installs each addon
3. Runs Godot in headless mode to check for load errors

```bash
# Location: fab/vault/scripts/test_addon_load.sh
#!/bin/bash

VAULT_ROOT="$(dirname "$0")/.."
GODOT_BIN="${GODOT_BIN:-godot}"
TEST_PROJECT="/tmp/vault_addon_test"

# Create fresh project
rm -rf "$TEST_PROJECT"
mkdir -p "$TEST_PROJECT"
cp -r "$VAULT_ROOT/godot/templates/fab_game_template/project/"* "$TEST_PROJECT/"

# Install addon
ADDON_ID="$1"
if [ -d "$VAULT_ROOT/godot/addons/$ADDON_ID/addon" ]; then
    cp -r "$VAULT_ROOT/godot/addons/$ADDON_ID/addon/"* "$TEST_PROJECT/addons/" 2>/dev/null || \
    mkdir -p "$TEST_PROJECT/addons" && cp -r "$VAULT_ROOT/godot/addons/$ADDON_ID/addon/"* "$TEST_PROJECT/addons/"
fi

# Run Godot headless to check for errors
cd "$TEST_PROJECT"
timeout 30 "$GODOT_BIN" --headless --import --quit 2>&1 | tee /tmp/godot_output.log

# Check for errors
if grep -qi "error\|failed\|exception" /tmp/godot_output.log; then
    echo "FAIL: $ADDON_ID has load errors"
    exit 1
else
    echo "PASS: $ADDON_ID loads without errors"
    exit 0
fi
```

### 2.2 Addon Load Test Matrix

Run for each addon:

| Addon              | Test Command                              | Expected Result                    |
| ------------------ | ----------------------------------------- | ---------------------------------- |
| gdunit4            | `./test_addon_load.sh gdunit4`            | Loads, plugin.cfg valid            |
| gut                | `./test_addon_load.sh gut`                | Loads, plugin.cfg valid            |
| debug_draw_3d      | `./test_addon_load.sh debug_draw_3d`      | Loads (GDScript portion)           |
| panku_console      | `./test_addon_load.sh panku_console`      | Loads, shows in singleton          |
| phantom_camera     | `./test_addon_load.sh phantom_camera`     | Loads, PhantomCameraManager exists |
| dialogue_manager   | `./test_addon_load.sh dialogue_manager`   | Loads, DialogueManager autoload    |
| dialogic           | `./test_addon_load.sh dialogic`           | Loads, Dialogic autoload           |
| gloot              | `./test_addon_load.sh gloot`              | Loads, inventory nodes available   |
| beehave            | `./test_addon_load.sh beehave`            | Loads, BeehaveTree node type       |
| godot_state_charts | `./test_addon_load.sh godot_state_charts` | Loads, StateChart node type        |
| proton_scatter     | `./test_addon_load.sh proton_scatter`     | Loads, Scatter node type           |
| gaea               | `./test_addon_load.sh gaea`               | Loads, Gaea nodes available        |
| aseprite_wizard    | `./test_addon_load.sh aseprite_wizard`    | Loads, import plugin               |
| smart_shape_2d     | `./test_addon_load.sh smart_shape_2d`     | Loads, SS2D nodes                  |

---

## Phase 3: Template Validation

### 3.1 Template Structure Tests

For each template, verify:

```python
def test_template_structure(template_id: str):
    """Verify template has required files."""
    vault = get_vault_registry()
    template = vault.get_template(template_id)
    project_dir = template.local_path

    # Must have project.godot
    assert (project_dir / "project.godot").exists()

    # Must have valid project file
    content = (project_dir / "project.godot").read_text()
    assert "[gd_resource_ext" in content or "config/name" in content

    # Check for bundled addons
    for addon_id in template.bundled_addons:
        addon_path = project_dir / "addons" / addon_id
        assert addon_path.exists(), f"Missing bundled addon: {addon_id}"
```

### 3.2 Template Launch Tests

| Template             | Test Steps               | Expected Result       |
| -------------------- | ------------------------ | --------------------- |
| fab_game_template    | Copy, open in Godot, run | Starts without errors |
| maaack_game_template | Copy, open in Godot, run | Shows main menu       |
| cogito               | Copy, open in Godot, run | Shows FPS demo scene  |

---

## Phase 4: GDExtension Validation

GDExtensions require downloading platform-specific binaries. Test process:

### 4.1 Binary Download Script

```bash
# Location: fab/vault/scripts/fetch_gdextension.sh
#!/bin/bash

EXTENSION_ID="$1"
PLATFORM="${2:-macos}"
VAULT_ROOT="$(dirname "$0")/.."
TARGET="$VAULT_ROOT/godot/gdextensions/$EXTENSION_ID/bin"

case "$EXTENSION_ID" in
    terrain3d)
        URL="https://github.com/TokisanGames/Terrain3D/releases/download/v1.0.1/"
        ;;
    godot_jolt)
        URL="https://github.com/godot-jolt/godot-jolt/releases/download/v0.9.0-stable/"
        ;;
    limboai)
        URL="https://github.com/limbonaut/limboai/releases/download/v1.5.3/"
        ;;
    godot_steam)
        URL="https://github.com/GodotSteam/GodotSteam/releases/download/v4.17/"
        ;;
    godot_sqlite)
        URL="https://github.com/2shady4u/godot-sqlite/releases/download/v4.6/"
        ;;
    *)
        echo "Unknown extension: $EXTENSION_ID"
        exit 1
        ;;
esac

mkdir -p "$TARGET"
echo "Download binaries from: $URL"
echo "Place in: $TARGET"
# Manual download required - check release page for exact file names
```

### 4.2 GDExtension Test Matrix

| Extension    | Validation Steps                                                 |
| ------------ | ---------------------------------------------------------------- |
| terrain3d    | Download binary, create Terrain3D node, verify sculpting API     |
| godot_jolt   | Download binary, set as physics engine, run physics test         |
| limboai      | Download binary, create BTPlayer, verify BT nodes                |
| godot_steam  | Download binary, verify Steam API calls (requires Steam running) |
| godot_sqlite | Download binary, create SQLite, run query test                   |

---

## Phase 5: Integration Tests

### 5.1 World Build with Addons

Test that `vault.py` integrates correctly with fab-godot:

```python
def test_world_build_with_addons():
    """Test that world builds can request and install vault addons."""
    # Create world.yaml with required_addons
    world_config = {
        "world_id": "test_world",
        "generator": {
            "required_addons": [
                {"id": "beehave", "required": True},
                {"id": "gloot", "required": True},
            ]
        }
    }

    # Resolve addons
    vault = get_vault_registry()
    addons = vault.resolve_world_addons(world_config["generator"]["required_addons"])

    assert len(addons) == 2
    assert addons[0].id == "beehave"
    assert addons[1].id == "gloot"
```

### 5.2 Full Pipeline Test

```bash
# Run fab-godot with a world that uses vault addons
cd /Users/connor/Medica/glia-fab
fab-godot --world fab/worlds/outora_library/world.yaml --output /tmp/test_build
```

---

## Phase 6: Cyntra Kernel Integration

### 6.1 Verify fab/godot.py Uses Vault

Check that `kernel/src/cyntra/fab/godot.py` properly:

1. Discovers vault via `get_vault_registry()`
2. Uses vault templates when available
3. Installs addons from world.yaml `required_addons`

### 6.2 End-to-End Test

```bash
# Create a test bead that triggers fab-godot
cyntra run --once --issue TEST_VAULT_INTEGRATION

# Verify:
# 1. Template copied from vault
# 2. Addons installed from vault
# 3. Godot project runs successfully
```

---

## Validation Checklist

### Addons (check when validated)

- [ ] gdunit4 - loads, tests run
- [ ] gut - loads, tests run
- [ ] debug_draw_3d - loads, draws work
- [ ] panku_console - loads, console opens
- [ ] phantom_camera - loads, camera works
- [ ] dialogue_manager - loads, dialogue plays
- [ ] dialogic - loads, timeline plays
- [ ] gloot - loads, inventory works
- [ ] beehave - loads, BT executes
- [ ] godot_state_charts - loads, states transition
- [ ] proton_scatter - loads, scattering works
- [ ] gaea - loads, generation works
- [ ] aseprite_wizard - loads, imports .aseprite
- [ ] smart_shape_2d - loads, shapes render

### GDExtensions (check when validated)

- [ ] terrain3d - binary fetched, terrain creates
- [ ] godot_jolt - binary fetched, physics works
- [ ] limboai - binary fetched, BT works
- [ ] godot_steam - binary fetched, API accessible
- [ ] godot_sqlite - binary fetched, queries work

### Templates (check when validated)

- [ ] fab_game_template - opens, runs
- [ ] maaack_game_template - opens, runs, menus work
- [ ] cogito - opens, runs, FPS controls work

### Integration (check when validated)

- [ ] vault.py API tests pass
- [ ] fab-godot uses vault correctly
- [ ] world.yaml addons resolve correctly
- [ ] cyntra kernel end-to-end works

---

## Automation Script

Create `fab/vault/scripts/validate_all.py`:

```python
#!/usr/bin/env python3
"""Run full vault validation suite."""

import subprocess
import sys
from pathlib import Path

def main():
    vault_root = Path(__file__).parent.parent

    print("=" * 60)
    print("UDE Vault Validation Suite")
    print("=" * 60)

    # Phase 1: Hash validation
    print("\n[Phase 1] Hash Validation")
    result = subprocess.run(
        ["python", vault_root / "scripts/validate_hashes.py"],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print("FAIL: Hash validation failed")
        return 1

    # Phase 2: Python unit tests
    print("\n[Phase 2] Python Unit Tests")
    result = subprocess.run(
        ["pytest", "tests/fab/test_vault.py", "-v"],
        cwd=vault_root.parent.parent / "kernel",
        capture_output=True, text=True
    )
    print(result.stdout)
    print(result.stderr)

    # Phase 3: Addon load tests (requires Godot)
    print("\n[Phase 3] Addon Load Tests")
    print("Run manually: ./scripts/test_addon_load.sh <addon_id>")

    # Phase 4: Template tests
    print("\n[Phase 4] Template Tests")
    print("Run manually: Open each template in Godot Editor")

    print("\n" + "=" * 60)
    print("Validation complete. See checklist above for manual tests.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

---

## Next Steps

1. **Create test files**: Implement `tests/fab/test_vault.py`
2. **Create shell scripts**: Implement `test_addon_load.sh` and `fetch_gdextension.sh`
3. **Run validation**: Execute validation suite
4. **Fix issues**: Address any failures found
5. **Document results**: Update checklist with pass/fail status
