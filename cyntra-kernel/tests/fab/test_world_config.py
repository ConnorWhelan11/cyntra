"""
Tests for world configuration loading and validation.
"""

import pytest
from pathlib import Path
from cyntra.fab.world_config import WorldConfig, load_world_config


def test_world_config_load():
    """Test loading Outora Library world config."""
    # Get repo root (tests/fab -> tests -> cyntra-kernel -> repo root)
    repo_root = Path(__file__).parents[3]
    world_path = repo_root / "fab" / "worlds" / "outora_library"

    # Skip if world doesn't exist yet
    if not (world_path / "world.yaml").exists():
        pytest.skip("Outora Library world not yet created")

    config = load_world_config(world_path)

    # Validate basic fields
    assert config.world_id == "outora_library"
    assert config.world_type == "interior_architecture"
    assert config.schema_version == "1.0"


def test_world_config_validation():
    """Test world config validation catches errors."""
    # This would test invalid configs, but we need fixtures for that
    pass


def test_stage_ordering():
    """Test stage dependency resolution."""
    repo_root = Path(__file__).parents[3]
    world_path = repo_root / "fab" / "worlds" / "outora_library"

    if not (world_path / "world.yaml").exists():
        pytest.skip("Outora Library world not yet created")

    config = load_world_config(world_path)

    # Get stage order
    order = config.get_stage_order()

    # Verify prepare comes before generate
    assert order.index("prepare") < order.index("generate")

    # Verify generate comes before bake
    assert order.index("generate") < order.index("bake")

    # Verify export comes before validate
    assert order.index("export") < order.index("validate")


def test_parameter_resolution():
    """Test parameter override resolution."""
    repo_root = Path(__file__).parents[3]
    world_path = repo_root / "fab" / "worlds" / "outora_library"

    if not (world_path / "world.yaml").exists():
        pytest.skip("Outora Library world not yet created")

    config = load_world_config(world_path)

    # Test default params
    defaults = config.resolve_parameters({})
    assert "lighting" in defaults
    assert defaults["lighting"]["preset"] == "dramatic"

    # Test override
    overridden = config.resolve_parameters({"lighting.preset": "cosmic"})
    assert overridden["lighting"]["preset"] == "cosmic"


def test_determinism_config():
    """Test determinism configuration."""
    repo_root = Path(__file__).parents[3]
    world_path = repo_root / "fab" / "worlds" / "outora_library"

    if not (world_path / "world.yaml").exists():
        pytest.skip("Outora Library world not yet created")

    config = load_world_config(world_path)

    det = config.get_determinism_config()
    assert det["seed"] == 42
    assert det["pythonhashseed"] == 0
    assert det["cycles_seed"] == 42
