"""Tests for the Fab game contract validation.

This tests the marker contract that ensures Blender exports are
compatible with Godot import conventions.
"""

from __future__ import annotations

import pytest

from cyntra.fab.outora.game_contract import (
    FabGameContractReport,
    FabRole,
    GameplayValidationReport,
    extract_id_from_marker,
    infer_role_from_name,
    validate_fab_game_contract,
    validate_full_fab_contract,
    validate_gameplay_against_markers,
)


class TestFabRole:
    """Test FabRole enum."""

    def test_all_roles_defined(self):
        """All expected roles should be defined."""
        expected = [
            "SPAWN_PLAYER",
            "COLLIDER",
            "TRIGGER",
            "INTERACT",
            "NAVMESH",
            "NPC_SPAWN",
            "ITEM_SPAWN",
            "AUDIO_ZONE",
            "WAYPOINT",
        ]
        for role_name in expected:
            assert hasattr(FabRole, role_name), f"Missing role: {role_name}"

    def test_role_values(self):
        """Role values should be snake_case strings."""
        assert FabRole.SPAWN_PLAYER.value == "spawn_player"
        assert FabRole.COLLIDER.value == "collider"
        assert FabRole.NPC_SPAWN.value == "npc_spawn"


class TestInferRoleFromName:
    """Test infer_role_from_name function."""

    # === Core markers ===
    def test_spawn_player_exact(self):
        """Exact SPAWN_PLAYER should match."""
        assert infer_role_from_name("SPAWN_PLAYER") == FabRole.SPAWN_PLAYER
        assert infer_role_from_name("OL_SPAWN_PLAYER") == FabRole.SPAWN_PLAYER

    def test_spawn_player_with_suffix(self):
        """SPAWN_PLAYER with suffix should match."""
        assert infer_role_from_name("SPAWN_PLAYER_01") == FabRole.SPAWN_PLAYER
        assert infer_role_from_name("OL_SPAWN_PLAYER_main") == FabRole.SPAWN_PLAYER

    def test_spawn_player_case_insensitive(self):
        """Role detection should be case-insensitive."""
        assert infer_role_from_name("spawn_player") == FabRole.SPAWN_PLAYER
        assert infer_role_from_name("Spawn_Player") == FabRole.SPAWN_PLAYER

    def test_collider_prefix(self):
        """COLLIDER_ prefix should match."""
        assert infer_role_from_name("COLLIDER_ground") == FabRole.COLLIDER
        assert infer_role_from_name("COLLIDER_walls") == FabRole.COLLIDER
        assert infer_role_from_name("OL_COLLIDER_floor") == FabRole.COLLIDER

    def test_trigger_prefix(self):
        """TRIGGER_ prefix should match."""
        assert infer_role_from_name("TRIGGER_entrance") == FabRole.TRIGGER
        assert infer_role_from_name("TRIGGER_secret_room") == FabRole.TRIGGER
        assert infer_role_from_name("OL_TRIGGER_zone") == FabRole.TRIGGER

    def test_interact_prefix(self):
        """INTERACT_ prefix should match."""
        assert infer_role_from_name("INTERACT_door") == FabRole.INTERACT
        assert infer_role_from_name("OL_INTERACT_lever") == FabRole.INTERACT

    # === Extended markers ===
    def test_nav_prefix(self):
        """NAV_ prefix should match NAVMESH role."""
        assert infer_role_from_name("NAV_floor") == FabRole.NAVMESH
        assert infer_role_from_name("NAV_WALKABLE") == FabRole.NAVMESH
        assert infer_role_from_name("OL_NAV_mezzanine") == FabRole.NAVMESH

    def test_npc_spawn_prefix(self):
        """NPC_SPAWN_ prefix should match."""
        assert infer_role_from_name("NPC_SPAWN_librarian") == FabRole.NPC_SPAWN
        assert infer_role_from_name("NPC_SPAWN_scholar_01") == FabRole.NPC_SPAWN
        assert infer_role_from_name("OL_NPC_SPAWN_guard") == FabRole.NPC_SPAWN

    def test_item_spawn_prefix(self):
        """ITEM_SPAWN_ prefix should match."""
        assert infer_role_from_name("ITEM_SPAWN_book_01") == FabRole.ITEM_SPAWN
        assert infer_role_from_name("ITEM_SPAWN_key") == FabRole.ITEM_SPAWN
        assert infer_role_from_name("OL_ITEM_SPAWN_potion") == FabRole.ITEM_SPAWN

    def test_audio_zone_prefix(self):
        """AUDIO_ZONE_ prefix should match."""
        assert infer_role_from_name("AUDIO_ZONE_reading_room") == FabRole.AUDIO_ZONE
        assert infer_role_from_name("AUDIO_ZONE_ambient") == FabRole.AUDIO_ZONE
        assert infer_role_from_name("OL_AUDIO_ZONE_fountain") == FabRole.AUDIO_ZONE

    def test_waypoint_prefix(self):
        """WAYPOINT_ prefix should match."""
        assert infer_role_from_name("WAYPOINT_01") == FabRole.WAYPOINT
        assert infer_role_from_name("WAYPOINT_02") == FabRole.WAYPOINT
        assert infer_role_from_name("OL_WAYPOINT_start") == FabRole.WAYPOINT

    # === Non-matching names ===
    def test_no_match_for_regular_names(self):
        """Regular object names should return None."""
        assert infer_role_from_name("Cube") is None
        assert infer_role_from_name("Table_01") is None
        assert infer_role_from_name("Bookshelf") is None

    def test_partial_prefix_no_match(self):
        """Partial prefixes should not match."""
        assert infer_role_from_name("COLLIDE") is None  # Missing underscore
        assert infer_role_from_name("SPAWN") is None  # Missing _PLAYER
        assert infer_role_from_name("NPC_") is None  # Missing SPAWN


class TestFabGameContractReport:
    """Test FabGameContractReport dataclass."""

    def test_default_values(self):
        """Default report should have empty lists."""
        report = FabGameContractReport()
        assert report.spawns == []
        assert report.colliders == []
        assert report.triggers == []
        assert report.navmeshes == []
        assert report.npc_spawns == []
        assert report.errors == []
        assert report.warnings == []

    def test_playable_with_no_errors(self):
        """Playable should be True when no errors."""
        report = FabGameContractReport(
            spawns=["SPAWN_PLAYER"],
            colliders=["COLLIDER_ground"],
        )
        assert report.playable is True

    def test_not_playable_with_errors(self):
        """Playable should be False when errors exist."""
        report = FabGameContractReport(errors=["Missing spawn"])
        assert report.playable is False

    def test_npc_ready(self):
        """NPC ready should require both navmesh and spawns."""
        # Missing both
        report1 = FabGameContractReport()
        assert report1.npc_ready is False

        # Only navmesh
        report2 = FabGameContractReport(navmeshes=["NAV_floor"])
        assert report2.npc_ready is False

        # Only NPC spawns
        report3 = FabGameContractReport(npc_spawns=["NPC_SPAWN_librarian"])
        assert report3.npc_ready is False

        # Both present
        report4 = FabGameContractReport(navmeshes=["NAV_floor"], npc_spawns=["NPC_SPAWN_librarian"])
        assert report4.npc_ready is True

    def test_to_dict(self):
        """to_dict should serialize all fields."""
        report = FabGameContractReport(
            spawns=["SPAWN_PLAYER"],
            colliders=["COLLIDER_ground"],
            navmeshes=["NAV_floor"],
            npc_spawns=["NPC_SPAWN_test"],
            errors=["Some error"],
            warnings=["Some warning"],
        )
        d = report.to_dict()
        assert d["spawns"] == ["SPAWN_PLAYER"]
        assert d["colliders"] == ["COLLIDER_ground"]
        assert d["navmeshes"] == ["NAV_floor"]
        assert d["npc_spawns"] == ["NPC_SPAWN_test"]
        assert d["errors"] == ["Some error"]
        assert d["warnings"] == ["Some warning"]
        assert d["playable"] is False  # Has errors
        assert d["npc_ready"] is True  # Has both navmesh and npc_spawns


class TestValidateFabGameContract:
    """Test validate_fab_game_contract function."""

    def test_minimal_valid_export(self):
        """Minimal valid export should pass."""
        names = ["SPAWN_PLAYER", "COLLIDER_ground"]
        report = validate_fab_game_contract(names)
        assert report.playable is True
        assert report.errors == []
        assert len(report.spawns) == 1
        assert len(report.colliders) == 1

    def test_missing_spawn(self):
        """Missing spawn should error."""
        names = ["COLLIDER_ground", "COLLIDER_walls"]
        report = validate_fab_game_contract(names)
        assert report.playable is False
        assert any("spawn marker" in e.lower() for e in report.errors)

    def test_multiple_spawns_error(self):
        """Multiple spawns should error."""
        names = ["SPAWN_PLAYER", "OL_SPAWN_PLAYER", "COLLIDER_ground"]
        report = validate_fab_game_contract(names)
        assert report.playable is False
        assert any("multiple player spawns" in e.lower() for e in report.errors)

    def test_missing_colliders_when_required(self):
        """Missing colliders should error when required."""
        names = ["SPAWN_PLAYER"]
        report = validate_fab_game_contract(names, require_colliders=True)
        assert report.playable is False
        assert any("collider" in e.lower() for e in report.errors)

    def test_missing_colliders_when_not_required(self):
        """Missing colliders should not error when not required."""
        names = ["SPAWN_PLAYER"]
        report = validate_fab_game_contract(names, require_colliders=False)
        assert report.playable is True

    def test_require_navmesh(self):
        """Should error when navmesh required but missing."""
        names = ["SPAWN_PLAYER", "COLLIDER_ground"]
        report = validate_fab_game_contract(names, require_navmesh=True)
        assert report.playable is False
        assert any("navigation mesh" in e.lower() for e in report.errors)

    def test_require_npc_spawns(self):
        """Should error when NPC spawns required but missing."""
        names = ["SPAWN_PLAYER", "COLLIDER_ground", "NAV_floor"]
        report = validate_fab_game_contract(names, require_npc_spawns=True)
        assert report.playable is False
        assert any("npc spawn" in e.lower() for e in report.errors)

    def test_warning_npc_without_navmesh(self):
        """Should warn when NPC spawns exist without navmesh."""
        names = ["SPAWN_PLAYER", "COLLIDER_ground", "NPC_SPAWN_librarian"]
        report = validate_fab_game_contract(names)
        assert report.playable is True  # Not an error
        assert any("won't pathfind" in w.lower() for w in report.warnings)

    def test_warning_waypoints_without_npcs(self):
        """Should warn when waypoints exist without NPC spawns."""
        names = ["SPAWN_PLAYER", "COLLIDER_ground", "WAYPOINT_01", "WAYPOINT_02"]
        report = validate_fab_game_contract(names)
        assert report.playable is True
        assert any("patrol paths unused" in w.lower() for w in report.warnings)

    def test_full_gameplay_export(self):
        """Full gameplay export should pass all checks."""
        names = [
            "SPAWN_PLAYER",
            "COLLIDER_ground",
            "COLLIDER_walls",
            "TRIGGER_entrance",
            "NAV_WALKABLE",
            "NPC_SPAWN_librarian",
            "NPC_SPAWN_scholar_01",
            "ITEM_SPAWN_book_01",
            "AUDIO_ZONE_reading_room",
            "WAYPOINT_01",
            "WAYPOINT_02",
            "WAYPOINT_03",
            "INTERACT_door",
        ]
        report = validate_fab_game_contract(
            names,
            require_colliders=True,
            require_navmesh=True,
            require_npc_spawns=True,
        )
        assert report.playable is True
        assert report.npc_ready is True
        assert len(report.errors) == 0
        assert len(report.warnings) == 0
        assert len(report.spawns) == 1
        assert len(report.colliders) == 2
        assert len(report.triggers) == 1
        assert len(report.navmeshes) == 1
        assert len(report.npc_spawns) == 2
        assert len(report.item_spawns) == 1
        assert len(report.audio_zones) == 1
        assert len(report.waypoints) == 3
        assert len(report.interactables) == 1

    def test_ignores_non_marker_names(self):
        """Should ignore regular object names."""
        names = [
            "SPAWN_PLAYER",
            "COLLIDER_ground",
            "Cube",
            "Bookshelf_01",
            "Table",
            "Camera",
            "Light_Key",
        ]
        report = validate_fab_game_contract(names)
        assert report.playable is True
        assert len(report.spawns) == 1
        assert len(report.colliders) == 1

    def test_case_insensitive_detection(self):
        """Should detect markers regardless of case."""
        names = ["spawn_player", "collider_ground", "trigger_zone"]
        report = validate_fab_game_contract(names)
        assert report.playable is True
        assert len(report.spawns) == 1
        assert len(report.colliders) == 1
        assert len(report.triggers) == 1


# =============================================================================
# GAMEPLAY VALIDATION TESTS
# =============================================================================


class TestExtractIdFromMarker:
    """Test extract_id_from_marker function."""

    def test_npc_spawn_simple(self):
        """Simple NPC spawn marker extraction."""
        assert extract_id_from_marker("NPC_SPAWN_librarian", "NPC_SPAWN_") == "librarian"
        assert extract_id_from_marker("NPC_SPAWN_guard", "NPC_SPAWN_") == "guard"

    def test_npc_spawn_with_suffix(self):
        """NPC spawn with numeric suffix should strip suffix."""
        assert extract_id_from_marker("NPC_SPAWN_scholar_01", "NPC_SPAWN_") == "scholar"
        assert extract_id_from_marker("NPC_SPAWN_guard_001", "NPC_SPAWN_") == "guard"

    def test_ol_prefix_handling(self):
        """OL_ prefix should be handled correctly."""
        assert extract_id_from_marker("OL_NPC_SPAWN_librarian", "NPC_SPAWN_") == "librarian"
        assert extract_id_from_marker("OL_TRIGGER_entrance", "TRIGGER_") == "entrance"

    def test_trigger_extraction(self):
        """Trigger ID extraction."""
        assert extract_id_from_marker("TRIGGER_entrance", "TRIGGER_") == "entrance"
        assert extract_id_from_marker("TRIGGER_secret_room_01", "TRIGGER_") == "secret_room"

    def test_interact_extraction(self):
        """Interact ID extraction."""
        assert extract_id_from_marker("INTERACT_door", "INTERACT_") == "door"
        assert (
            extract_id_from_marker("INTERACT_bookshelf_ancient", "INTERACT_") == "bookshelf_ancient"
        )

    def test_item_spawn_extraction(self):
        """Item spawn ID extraction."""
        assert extract_id_from_marker("ITEM_SPAWN_key", "ITEM_SPAWN_") == "key"
        assert extract_id_from_marker("ITEM_SPAWN_ancient_tome_01", "ITEM_SPAWN_") == "ancient_tome"

    def test_audio_zone_extraction(self):
        """Audio zone ID extraction."""
        assert extract_id_from_marker("AUDIO_ZONE_reading_room", "AUDIO_ZONE_") == "reading_room"
        assert extract_id_from_marker("AUDIO_ZONE_main_hall_01", "AUDIO_ZONE_") == "main_hall"

    def test_waypoint_extraction(self):
        """Waypoint extraction with numeric handling."""
        assert extract_id_from_marker("WAYPOINT_main_hall_01", "WAYPOINT_") == "main_hall"
        assert extract_id_from_marker("WAYPOINT_patrol_02", "WAYPOINT_") == "patrol"

    def test_empty_on_wrong_prefix(self):
        """Should return empty string if prefix doesn't match."""
        assert extract_id_from_marker("TRIGGER_zone", "NPC_SPAWN_") == ""
        assert extract_id_from_marker("Cube", "TRIGGER_") == ""

    def test_case_preservation(self):
        """Should preserve case in extracted ID (lowercased)."""
        assert extract_id_from_marker("NPC_SPAWN_Librarian", "NPC_SPAWN_") == "librarian"


class TestGameplayValidationReport:
    """Test GameplayValidationReport dataclass."""

    def test_default_values(self):
        """Default report should have empty lists."""
        report = GameplayValidationReport()
        assert report.matched_npcs == []
        assert report.matched_items == []
        assert report.matched_triggers == []
        assert report.missing_markers == []
        assert report.orphaned_markers == []
        assert report.errors == []
        assert report.warnings == []

    def test_valid_with_no_errors(self):
        """Valid should be True when no errors."""
        report = GameplayValidationReport(
            matched_npcs=["librarian"],
            matched_triggers=["entrance"],
        )
        assert report.valid is True

    def test_not_valid_with_errors(self):
        """Valid should be False when errors exist."""
        report = GameplayValidationReport(errors=["Missing marker"])
        assert report.valid is False

    def test_to_dict(self):
        """to_dict should serialize all fields."""
        report = GameplayValidationReport(
            matched_npcs=["librarian"],
            matched_triggers=["entrance"],
            orphaned_markers=["TRIGGER_unused"],
            warnings=["Some warning"],
        )
        d = report.to_dict()
        assert d["matched_npcs"] == ["librarian"]
        assert d["matched_triggers"] == ["entrance"]
        assert d["orphaned_markers"] == ["TRIGGER_unused"]
        assert d["warnings"] == ["Some warning"]
        assert d["valid"] is True


class TestValidateGameplayAgainstMarkers:
    """Test validate_gameplay_against_markers function."""

    @pytest.fixture
    def sample_gameplay_config(self):
        """Sample gameplay.yaml as dict."""
        return {
            "entities": {
                "librarian": {
                    "display_name": "Head Librarian",
                    "behavior": "patrol_and_interact",
                    "patrol_path": "main_hall",
                },
                "scholar": {
                    "display_name": "Scholar",
                    "behavior": "stationary",
                },
                "ancient_tome": {
                    "display_name": "Ancient Tome",
                    "type": "key_item",
                },
                "library_key": {
                    "display_name": "Library Key",
                    "type": "key_item",
                },
            },
            "triggers": {
                "entrance": {"on_enter": [{"show_text": "Welcome"}]},
                "vault_entrance": {"on_enter": [{"trigger": "vault_opened"}]},
            },
            "interactions": {
                "bookshelf_ancient": {"action": "examine"},
                "vault_door": {"action": "use", "requires": {"item": "library_key"}},
            },
            "audio_zones": {
                "reading_room": {"ambient": "quiet_study"},
                "main_hall": {"ambient": "hall_echo"},
            },
        }

    @pytest.fixture
    def sample_markers(self):
        """Sample marker names from GLB export."""
        return [
            "SPAWN_PLAYER",
            "COLLIDER_ground",
            "NPC_SPAWN_librarian",
            "NPC_SPAWN_scholar",
            "ITEM_SPAWN_ancient_tome",
            "ITEM_SPAWN_library_key",
            "TRIGGER_entrance",
            "TRIGGER_vault_entrance",
            "INTERACT_bookshelf_ancient",
            "INTERACT_vault_door",
            "AUDIO_ZONE_reading_room",
            "AUDIO_ZONE_main_hall",
            "WAYPOINT_main_hall_01",
            "WAYPOINT_main_hall_02",
            "WAYPOINT_main_hall_03",
        ]

    def test_all_entities_matched(self, sample_gameplay_config, sample_markers):
        """All entities should match markers."""
        report = validate_gameplay_against_markers(sample_gameplay_config, sample_markers)
        assert report.valid is True
        assert "librarian" in report.matched_npcs
        assert "scholar" in report.matched_npcs
        assert "ancient_tome" in report.matched_items
        assert "library_key" in report.matched_items

    def test_all_triggers_matched(self, sample_gameplay_config, sample_markers):
        """All triggers should match markers."""
        report = validate_gameplay_against_markers(sample_gameplay_config, sample_markers)
        assert "entrance" in report.matched_triggers
        assert "vault_entrance" in report.matched_triggers

    def test_all_interactions_matched(self, sample_gameplay_config, sample_markers):
        """All interactions should match markers."""
        report = validate_gameplay_against_markers(sample_gameplay_config, sample_markers)
        assert "bookshelf_ancient" in report.matched_interactions
        assert "vault_door" in report.matched_interactions

    def test_all_audio_zones_matched(self, sample_gameplay_config, sample_markers):
        """All audio zones should match markers."""
        report = validate_gameplay_against_markers(sample_gameplay_config, sample_markers)
        assert "reading_room" in report.matched_audio_zones
        assert "main_hall" in report.matched_audio_zones

    def test_patrol_path_matched(self, sample_gameplay_config, sample_markers):
        """Patrol path should match waypoint markers."""
        report = validate_gameplay_against_markers(sample_gameplay_config, sample_markers)
        assert "main_hall" in report.matched_patrol_paths

    def test_missing_npc_marker(self, sample_gameplay_config):
        """Should error when NPC entity has no marker."""
        markers = ["SPAWN_PLAYER", "NPC_SPAWN_librarian"]  # Missing scholar
        report = validate_gameplay_against_markers(sample_gameplay_config, markers)
        assert report.valid is False
        assert any("scholar" in e for e in report.errors)
        assert "NPC_SPAWN_scholar" in report.missing_markers

    def test_missing_item_marker(self, sample_gameplay_config):
        """Should error when item entity has no marker."""
        markers = [
            "SPAWN_PLAYER",
            "NPC_SPAWN_librarian",
            "NPC_SPAWN_scholar",
            "ITEM_SPAWN_ancient_tome",  # Missing library_key
        ]
        report = validate_gameplay_against_markers(sample_gameplay_config, markers)
        assert report.valid is False
        assert any("library_key" in e for e in report.errors)

    def test_missing_trigger_marker(self, sample_gameplay_config):
        """Should error when trigger has no marker."""
        markers = [
            "SPAWN_PLAYER",
            "NPC_SPAWN_librarian",
            "NPC_SPAWN_scholar",
            "ITEM_SPAWN_ancient_tome",
            "ITEM_SPAWN_library_key",
            "TRIGGER_entrance",  # Missing vault_entrance
        ]
        report = validate_gameplay_against_markers(sample_gameplay_config, markers)
        assert report.valid is False
        assert any("vault_entrance" in e for e in report.errors)

    def test_orphaned_markers_warning(self, sample_gameplay_config):
        """Orphaned markers should generate warnings (not errors by default)."""
        markers = [
            "SPAWN_PLAYER",
            "NPC_SPAWN_librarian",
            "NPC_SPAWN_scholar",
            "NPC_SPAWN_ghost",  # Not in gameplay.yaml
            "ITEM_SPAWN_ancient_tome",
            "ITEM_SPAWN_library_key",
            "TRIGGER_entrance",
            "TRIGGER_vault_entrance",
            "TRIGGER_secret_room",  # Not in gameplay.yaml
            "INTERACT_bookshelf_ancient",
            "INTERACT_vault_door",
            "AUDIO_ZONE_reading_room",
            "AUDIO_ZONE_main_hall",
        ]
        report = validate_gameplay_against_markers(sample_gameplay_config, markers)
        # Should still be valid (orphaned markers are warnings)
        assert report.valid is True
        assert "NPC_SPAWN_ghost" in report.orphaned_markers
        assert "TRIGGER_secret_room" in report.orphaned_markers
        assert any("ghost" in w for w in report.warnings)

    def test_orphaned_markers_strict_mode(self, sample_gameplay_config):
        """In strict mode, orphaned markers should be errors."""
        markers = [
            "SPAWN_PLAYER",
            "NPC_SPAWN_librarian",
            "NPC_SPAWN_scholar",
            "NPC_SPAWN_ghost",  # Not in gameplay.yaml
            "ITEM_SPAWN_ancient_tome",
            "ITEM_SPAWN_library_key",
            "TRIGGER_entrance",
            "TRIGGER_vault_entrance",
            "INTERACT_bookshelf_ancient",
            "INTERACT_vault_door",
            "AUDIO_ZONE_reading_room",
            "AUDIO_ZONE_main_hall",
        ]
        report = validate_gameplay_against_markers(sample_gameplay_config, markers, strict=True)
        assert report.valid is False
        assert any("ghost" in e for e in report.errors)

    def test_missing_patrol_path_warning(self, sample_gameplay_config):
        """Missing patrol path markers should generate warning."""
        markers = [
            "SPAWN_PLAYER",
            "NPC_SPAWN_librarian",
            "NPC_SPAWN_scholar",
            "ITEM_SPAWN_ancient_tome",
            "ITEM_SPAWN_library_key",
            "TRIGGER_entrance",
            "TRIGGER_vault_entrance",
            "INTERACT_bookshelf_ancient",
            "INTERACT_vault_door",
            "AUDIO_ZONE_reading_room",
            "AUDIO_ZONE_main_hall",
            # No WAYPOINT_main_hall_* markers
        ]
        report = validate_gameplay_against_markers(sample_gameplay_config, markers)
        # Missing patrol path is a warning, not error
        assert any("patrol_path" in w for w in report.warnings)

    def test_empty_gameplay_config(self):
        """Empty gameplay config should produce empty report."""
        report = validate_gameplay_against_markers({}, ["SPAWN_PLAYER"])
        assert report.valid is True
        assert report.matched_npcs == []
        assert report.errors == []

    def test_ol_prefix_markers(self, sample_gameplay_config):
        """Should handle OL_ prefix markers correctly."""
        markers = [
            "SPAWN_PLAYER",
            "OL_NPC_SPAWN_librarian",  # OL_ prefix
            "OL_NPC_SPAWN_scholar",
            "OL_ITEM_SPAWN_ancient_tome",
            "OL_ITEM_SPAWN_library_key",
            "OL_TRIGGER_entrance",
            "OL_TRIGGER_vault_entrance",
            "OL_INTERACT_bookshelf_ancient",
            "OL_INTERACT_vault_door",
            "OL_AUDIO_ZONE_reading_room",
            "OL_AUDIO_ZONE_main_hall",
            "OL_WAYPOINT_main_hall_01",
        ]
        report = validate_gameplay_against_markers(sample_gameplay_config, markers)
        assert report.valid is True
        assert "librarian" in report.matched_npcs


class TestValidateFullFabContract:
    """Test validate_full_fab_contract function."""

    def test_both_reports_returned(self):
        """Should return both game contract and gameplay validation reports."""
        gameplay = {
            "entities": {"librarian": {"behavior": "idle"}},
            "triggers": {"entrance": {}},
        }
        markers = [
            "SPAWN_PLAYER",
            "COLLIDER_ground",
            "NPC_SPAWN_librarian",
            "TRIGGER_entrance",
        ]
        game_report, gameplay_report = validate_full_fab_contract(gameplay, markers)

        assert isinstance(game_report, FabGameContractReport)
        assert isinstance(gameplay_report, GameplayValidationReport)
        assert game_report.playable is True
        assert gameplay_report.valid is True

    def test_combined_validation(self):
        """Should validate both contracts together."""
        gameplay = {
            "entities": {
                "librarian": {"behavior": "patrol"},
                "tome": {"type": "key_item"},
            },
            "triggers": {"entrance": {}},
        }
        markers = [
            "SPAWN_PLAYER",
            "COLLIDER_ground",
            "NPC_SPAWN_librarian",
            "ITEM_SPAWN_tome",
            "TRIGGER_entrance",
        ]
        game_report, gameplay_report = validate_full_fab_contract(
            gameplay, markers, require_colliders=True
        )

        assert game_report.playable is True
        assert gameplay_report.valid is True
        assert len(game_report.spawns) == 1
        assert len(game_report.colliders) == 1
        assert "librarian" in gameplay_report.matched_npcs
        assert "tome" in gameplay_report.matched_items

    def test_game_contract_fails(self):
        """Game contract failure should be captured."""
        gameplay = {"entities": {"npc": {"behavior": "idle"}}}
        markers = ["NPC_SPAWN_npc"]  # Missing SPAWN_PLAYER

        game_report, gameplay_report = validate_full_fab_contract(gameplay, markers)

        assert game_report.playable is False
        assert any("spawn" in e.lower() for e in game_report.errors)

    def test_gameplay_validation_fails(self):
        """Gameplay validation failure should be captured."""
        gameplay = {
            "entities": {"missing_npc": {"behavior": "idle"}},
        }
        markers = ["SPAWN_PLAYER", "COLLIDER_ground"]  # No NPC marker

        game_report, gameplay_report = validate_full_fab_contract(gameplay, markers)

        assert game_report.playable is True  # Game contract passes
        assert gameplay_report.valid is False  # Gameplay validation fails
        assert any("missing_npc" in e for e in gameplay_report.errors)
