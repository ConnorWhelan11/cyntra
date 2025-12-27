"""Tests for the Fab gameplay configuration loader.

Tests GameplayConfig, dataclasses, and validation logic.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from cyntra.fab.gameplay_config import (
    AudioZoneConfig,
    EntityConfig,
    GameplayConfig,
    InteractionConfig,
    ObjectiveConfig,
    PlayerConfig,
    RulesConfig,
    TriggerConfig,
    gameplay_exists,
    load_gameplay_config,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def minimal_gameplay_yaml():
    """Minimal valid gameplay.yaml content."""
    return """
schema_version: "1.0"
world_id: test_world
"""


@pytest.fixture
def full_gameplay_yaml():
    """Full gameplay.yaml with all sections."""
    return """
schema_version: "1.0"
world_id: test_library

player:
  controller: first_person
  capabilities: [walk, run, jump, interact, inventory]
  settings:
    move_speed: 5.0
    jump_height: 1.5
    interact_distance: 2.5

entities:
  librarian:
    display_name: "Head Librarian"
    behavior: patrol_and_interact
    patrol_path: main_hall
    dialogue: librarian.dialogue
    schedule:
      - time: [8, 18]
        location: desk
        behavior: idle

  scholar:
    display_name: "Visiting Scholar"
    behavior: stationary
    dialogue: scholar.dialogue

  ancient_tome:
    display_name: "Ancient Tome"
    type: key_item
    on_pickup:
      - add_to_inventory
      - trigger: found_tome

  library_key:
    display_name: "Library Key"
    type: key_item
    unlocks: [vault_door, archive_gate]

  health_potion:
    display_name: "Health Potion"
    type: consumable
    effect:
      restore_health: 25

interactions:
  bookshelf_ancient:
    action: examine
    result:
      - show_text: "Dusty tomes line the shelves."

  vault_door:
    action: use
    requires:
      item: library_key
    locked_message: "The door is locked."
    one_shot: true
    result:
      - play_animation: door_open
      - consume_item: library_key
      - enable_passage: vault_interior

triggers:
  entrance:
    on_enter:
      - play_music: ambient_library
      - show_hint: "Welcome to the library..."
    on_exit:
      - fade_music: 2.0

  vault_trigger:
    requires:
      objective_complete: find_key
    one_shot: true
    cooldown_seconds: 5.0
    on_enter:
      - spawn_npc: vault_guardian

audio_zones:
  reading_room:
    ambient: quiet_study
    music: null
    volume: 0.6
    fade_time: 1.5

  main_hall:
    ambient: hall_echo
    music: exploration_theme
    volume: 0.8
    reverb_preset: large_hall

objectives:
  - id: explore_library
    description: "Explore the Outora Library"
    type: discovery
    complete_when:
      triggers_activated: [entrance, wing_a, wing_b]
    rewards:
      xp: 50

  - id: find_librarian
    description: "Find and speak with the Head Librarian"
    requires: [explore_library]
    complete_when:
      dialogue_complete: librarian_intro
    hint: "Look for the main desk."

  - id: find_key
    description: "Obtain the Library Key"
    requires: [find_librarian]
    complete_when:
      item_acquired: library_key

  - id: escape_library
    description: "Escape the Library"
    type: final
    requires: [find_key]
    complete_when:
      trigger: exit_complete
    on_complete:
      - show_text: "You escaped!"
      - end_game: victory

rules:
  combat:
    enabled: false
  inventory:
    max_slots: 12
    weight_limit: null
  saving:
    mode: checkpoint
    checkpoints: [entrance, vault]
"""


@pytest.fixture
def temp_gameplay_file(minimal_gameplay_yaml):
    """Create a temporary gameplay.yaml file."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        f.write(minimal_gameplay_yaml)
        f.flush()
        yield Path(f.name)
    Path(f.name).unlink(missing_ok=True)


@pytest.fixture
def temp_gameplay_dir(full_gameplay_yaml):
    """Create a temporary world directory with gameplay.yaml."""
    with tempfile.TemporaryDirectory() as tmpdir:
        world_dir = Path(tmpdir)
        gameplay_file = world_dir / "gameplay.yaml"
        gameplay_file.write_text(full_gameplay_yaml)

        # Create dialogue directory
        dialogue_dir = world_dir / "dialogue"
        dialogue_dir.mkdir()
        (dialogue_dir / "librarian.dialogue").write_text("~ librarian_intro\nHello!")

        yield world_dir


# =============================================================================
# DATACLASS TESTS
# =============================================================================


class TestEntityConfig:
    """Test EntityConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        entity = EntityConfig(id="test")
        assert entity.id == "test"
        assert entity.display_name is None
        assert entity.entity_type is None
        assert entity.behavior is None
        assert entity.patrol_path is None
        assert entity.schedule == []
        assert entity.on_pickup == []
        assert entity.unlocks == []
        assert entity.effect == {}

    def test_with_values(self):
        """Should store provided values."""
        entity = EntityConfig(
            id="librarian",
            display_name="Head Librarian",
            behavior="patrol",
            patrol_path="main_hall",
        )
        assert entity.id == "librarian"
        assert entity.display_name == "Head Librarian"
        assert entity.behavior == "patrol"
        assert entity.patrol_path == "main_hall"


class TestInteractionConfig:
    """Test InteractionConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        interaction = InteractionConfig(id="test", action="use")
        assert interaction.id == "test"
        assert interaction.action == "use"
        assert interaction.requires is None
        assert interaction.locked_message is None
        assert interaction.result == []
        assert interaction.one_shot is False

    def test_with_requires(self):
        """Should store requirements."""
        interaction = InteractionConfig(
            id="vault_door",
            action="use",
            requires={"item": "key"},
            locked_message="Locked!",
            one_shot=True,
        )
        assert interaction.requires == {"item": "key"}
        assert interaction.locked_message == "Locked!"
        assert interaction.one_shot is True


class TestTriggerConfig:
    """Test TriggerConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        trigger = TriggerConfig(id="test")
        assert trigger.id == "test"
        assert trigger.requires is None
        assert trigger.on_enter == []
        assert trigger.on_exit == []
        assert trigger.on_stay == []
        assert trigger.one_shot is False
        assert trigger.cooldown_seconds == 0.0

    def test_with_actions(self):
        """Should store action lists."""
        trigger = TriggerConfig(
            id="entrance",
            on_enter=[{"show_text": "Hello"}],
            on_exit=[{"fade_music": 2.0}],
            cooldown_seconds=5.0,
        )
        assert len(trigger.on_enter) == 1
        assert len(trigger.on_exit) == 1
        assert trigger.cooldown_seconds == 5.0


class TestAudioZoneConfig:
    """Test AudioZoneConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        zone = AudioZoneConfig(id="test")
        assert zone.id == "test"
        assert zone.ambient is None
        assert zone.music is None
        assert zone.volume == 1.0
        assert zone.fade_time == 1.0
        assert zone.reverb_preset is None


class TestObjectiveConfig:
    """Test ObjectiveConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        obj = ObjectiveConfig(id="test", description="Test objective")
        assert obj.id == "test"
        assert obj.description == "Test objective"
        assert obj.objective_type == "main"
        assert obj.requires == []
        assert obj.complete_when == {}
        assert obj.hint is None
        assert obj.rewards == {}
        assert obj.on_complete == []


class TestPlayerConfig:
    """Test PlayerConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        player = PlayerConfig()
        assert player.controller == "first_person"
        assert player.capabilities == ["walk", "interact"]
        assert player.settings == {}


class TestRulesConfig:
    """Test RulesConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        rules = RulesConfig()
        assert rules.combat == {}
        assert rules.inventory == {}
        assert rules.saving == {}
        assert rules.time == {}


# =============================================================================
# GAMEPLAYCONFIG TESTS
# =============================================================================


class TestGameplayConfigLoading:
    """Test GameplayConfig loading and parsing."""

    def test_load_minimal(self, temp_gameplay_file):
        """Should load minimal gameplay.yaml."""
        config = GameplayConfig(temp_gameplay_file)
        assert config.schema_version == "1.0"
        assert config.world_id == "test_world"

    def test_load_full(self, temp_gameplay_dir):
        """Should load full gameplay.yaml with all sections."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert config.schema_version == "1.0"
        assert config.world_id == "test_library"

    def test_parse_player(self, temp_gameplay_dir):
        """Should parse player configuration."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert config.player.controller == "first_person"
        assert "walk" in config.player.capabilities
        assert "run" in config.player.capabilities
        assert "jump" in config.player.capabilities
        assert config.player.settings.get("move_speed") == 5.0

    def test_parse_entities(self, temp_gameplay_dir):
        """Should parse all entities."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert len(config.entities) == 5

        # Check NPC entity
        librarian = config.entities["librarian"]
        assert librarian.display_name == "Head Librarian"
        assert librarian.behavior == "patrol_and_interact"
        assert librarian.patrol_path == "main_hall"
        assert librarian.dialogue == "librarian.dialogue"
        assert len(librarian.schedule) == 1

        # Check item entity
        tome = config.entities["ancient_tome"]
        assert tome.entity_type == "key_item"
        assert len(tome.on_pickup) == 2

        # Check key with unlocks
        key = config.entities["library_key"]
        assert "vault_door" in key.unlocks

        # Check consumable
        potion = config.entities["health_potion"]
        assert potion.entity_type == "consumable"
        assert potion.effect.get("restore_health") == 25

    def test_parse_interactions(self, temp_gameplay_dir):
        """Should parse all interactions."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert len(config.interactions) == 2

        # Check examine interaction
        bookshelf = config.interactions["bookshelf_ancient"]
        assert bookshelf.action == "examine"
        assert len(bookshelf.result) == 1

        # Check locked interaction
        vault = config.interactions["vault_door"]
        assert vault.action == "use"
        assert vault.requires == {"item": "library_key"}
        assert vault.locked_message == "The door is locked."
        assert vault.one_shot is True

    def test_parse_triggers(self, temp_gameplay_dir):
        """Should parse all triggers."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert len(config.triggers) == 2

        entrance = config.triggers["entrance"]
        assert len(entrance.on_enter) == 2
        assert len(entrance.on_exit) == 1

        vault = config.triggers["vault_trigger"]
        assert vault.requires == {"objective_complete": "find_key"}
        assert vault.one_shot is True
        assert vault.cooldown_seconds == 5.0

    def test_parse_audio_zones(self, temp_gameplay_dir):
        """Should parse all audio zones."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert len(config.audio_zones) == 2

        reading = config.audio_zones["reading_room"]
        assert reading.ambient == "quiet_study"
        assert reading.music is None
        assert reading.volume == 0.6

        hall = config.audio_zones["main_hall"]
        assert hall.music == "exploration_theme"
        assert hall.reverb_preset == "large_hall"

    def test_parse_objectives(self, temp_gameplay_dir):
        """Should parse all objectives."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert len(config.objectives) == 4

        explore = config.objectives[0]
        assert explore.id == "explore_library"
        assert explore.objective_type == "discovery"
        assert explore.rewards.get("xp") == 50

        find_librarian = config.objectives[1]
        assert "explore_library" in find_librarian.requires

        escape = config.objectives[3]
        assert escape.objective_type == "final"
        assert len(escape.on_complete) == 2

    def test_parse_rules(self, temp_gameplay_dir):
        """Should parse game rules."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        assert config.rules.combat.get("enabled") is False
        assert config.rules.inventory.get("max_slots") == 12
        assert config.rules.saving.get("mode") == "checkpoint"


class TestGameplayConfigValidation:
    """Test GameplayConfig validation."""

    def test_missing_required_field(self):
        """Should error on missing required fields."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write("world_id: test\n")  # Missing schema_version
            f.flush()
            path = Path(f.name)

        try:
            import jsonschema

            with pytest.raises((ValueError, jsonschema.exceptions.ValidationError)):
                GameplayConfig(path)
        finally:
            path.unlink(missing_ok=True)

    def test_invalid_objective_dependency(self):
        """Should error when objective requires non-existent objective."""
        yaml_content = """
schema_version: "1.0"
world_id: test

objectives:
  - id: obj_a
    description: "Objective A"
    requires: [non_existent]
    complete_when:
      trigger: done
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()
            path = Path(f.name)

        try:
            with pytest.raises(ValueError, match="non-existent objective"):
                GameplayConfig(path)
        finally:
            path.unlink(missing_ok=True)

    def test_circular_objective_dependency(self):
        """Should error on circular objective dependencies."""
        yaml_content = """
schema_version: "1.0"
world_id: test

objectives:
  - id: obj_a
    description: "Objective A"
    requires: [obj_b]
    complete_when:
      trigger: a_done

  - id: obj_b
    description: "Objective B"
    requires: [obj_c]
    complete_when:
      trigger: b_done

  - id: obj_c
    description: "Objective C"
    requires: [obj_a]
    complete_when:
      trigger: c_done
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()
            path = Path(f.name)

        try:
            with pytest.raises(ValueError, match="[Cc]ircular"):
                GameplayConfig(path)
        finally:
            path.unlink(missing_ok=True)


class TestGameplayConfigMethods:
    """Test GameplayConfig helper methods."""

    def test_get_entity(self, temp_gameplay_dir):
        """Should get entity by ID."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        librarian = config.get_entity("librarian")
        assert librarian is not None
        assert librarian.display_name == "Head Librarian"

        missing = config.get_entity("nonexistent")
        assert missing is None

    def test_get_interaction(self, temp_gameplay_dir):
        """Should get interaction by ID."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        bookshelf = config.get_interaction("bookshelf_ancient")
        assert bookshelf is not None
        assert bookshelf.action == "examine"

    def test_get_trigger(self, temp_gameplay_dir):
        """Should get trigger by ID."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        entrance = config.get_trigger("entrance")
        assert entrance is not None
        assert len(entrance.on_enter) == 2

    def test_get_audio_zone(self, temp_gameplay_dir):
        """Should get audio zone by ID."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        zone = config.get_audio_zone("reading_room")
        assert zone is not None
        assert zone.volume == 0.6

    def test_get_objective(self, temp_gameplay_dir):
        """Should get objective by ID."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        obj = config.get_objective("find_key")
        assert obj is not None
        assert "find_librarian" in obj.requires

    def test_get_npc_entities(self, temp_gameplay_dir):
        """Should filter to NPC entities."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        npcs = config.get_npc_entities()
        assert "librarian" in npcs
        assert "scholar" in npcs
        assert "ancient_tome" not in npcs
        assert "health_potion" not in npcs

    def test_get_item_entities(self, temp_gameplay_dir):
        """Should filter to item entities."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        items = config.get_item_entities()
        assert "ancient_tome" in items
        assert "library_key" in items
        assert "health_potion" in items
        assert "librarian" not in items

    def test_get_dialogue_files(self, temp_gameplay_dir):
        """Should find referenced dialogue files."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        dialogues = config.get_dialogue_files()
        assert len(dialogues) >= 1
        assert any("librarian.dialogue" in str(d) for d in dialogues)

    def test_get_objective_order(self, temp_gameplay_dir):
        """Should return topologically sorted objective order."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")

        order = config.get_objective_order()
        assert len(order) == 4

        # explore_library should come first (no dependencies)
        explore_idx = order.index("explore_library")
        find_librarian_idx = order.index("find_librarian")
        find_key_idx = order.index("find_key")
        escape_idx = order.index("escape_library")

        assert explore_idx < find_librarian_idx
        assert find_librarian_idx < find_key_idx
        assert find_key_idx < escape_idx


class TestGameplayConfigExport:
    """Test GameplayConfig JSON export."""

    def test_export_to_json(self, temp_gameplay_dir):
        """Should export to JSON-serializable dict."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        exported = config.export_to_json()

        # Should be JSON-serializable
        json_str = json.dumps(exported)
        assert len(json_str) > 0

        # Check structure
        assert exported["schema_version"] == "1.0"
        assert exported["world_id"] == "test_library"
        assert "player" in exported
        assert "entities" in exported
        assert "interactions" in exported
        assert "triggers" in exported
        assert "audio_zones" in exported
        assert "objectives" in exported
        assert "rules" in exported

    def test_export_entities(self, temp_gameplay_dir):
        """Should export entities correctly."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        exported = config.export_to_json()

        librarian = exported["entities"]["librarian"]
        assert librarian["id"] == "librarian"
        assert librarian["display_name"] == "Head Librarian"
        assert librarian["behavior"] == "patrol_and_interact"

    def test_export_objectives(self, temp_gameplay_dir):
        """Should export objectives as list."""
        config = GameplayConfig(temp_gameplay_dir / "gameplay.yaml")
        exported = config.export_to_json()

        objectives = exported["objectives"]
        assert isinstance(objectives, list)
        assert len(objectives) == 4
        assert objectives[0]["id"] == "explore_library"


# =============================================================================
# HELPER FUNCTION TESTS
# =============================================================================


class TestLoadGameplayConfig:
    """Test load_gameplay_config function."""

    def test_load_from_file(self, temp_gameplay_file):
        """Should load from gameplay.yaml file path."""
        config = load_gameplay_config(temp_gameplay_file)
        assert config.world_id == "test_world"

    def test_load_from_directory(self, temp_gameplay_dir):
        """Should load from world directory."""
        config = load_gameplay_config(temp_gameplay_dir)
        assert config.world_id == "test_library"

    def test_file_not_found(self):
        """Should raise FileNotFoundError for missing file."""
        with pytest.raises(FileNotFoundError):
            load_gameplay_config(Path("/nonexistent/gameplay.yaml"))


class TestGameplayExists:
    """Test gameplay_exists function."""

    def test_exists_file(self, minimal_gameplay_yaml):
        """Should return True for existing gameplay.yaml file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gameplay_file = Path(tmpdir) / "gameplay.yaml"
            gameplay_file.write_text(minimal_gameplay_yaml)
            assert gameplay_exists(gameplay_file) is True

    def test_exists_directory(self, temp_gameplay_dir):
        """Should return True for directory with gameplay.yaml."""
        assert gameplay_exists(temp_gameplay_dir) is True

    def test_not_exists(self):
        """Should return False for missing file."""
        assert gameplay_exists(Path("/nonexistent")) is False

    def test_directory_without_gameplay(self):
        """Should return False for directory without gameplay.yaml."""
        with tempfile.TemporaryDirectory() as tmpdir:
            assert gameplay_exists(Path(tmpdir)) is False
