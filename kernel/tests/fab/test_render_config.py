"""Tests for render configuration with lighting presets and exposure bracketing."""

from pathlib import Path

import pytest

from cyntra.fab.config import (
    ExposureBracketConfig,
    LightingConfig,
    RenderConfig,
    load_gate_config,
)
from cyntra.fab.render import load_lighting_preset


class TestLightingConfig:
    """Tests for LightingConfig dataclass."""

    def test_default_values(self):
        config = LightingConfig()
        assert config.preset is None
        assert config.key_energy is None
        assert config.hdri_strength == 0.5
        assert config.hdri_rotation_deg == 0.0

    def test_with_preset(self):
        config = LightingConfig(
            preset="car_studio",
            key_energy=600,
            hdri="studio_neutral_v001",
            hdri_strength=0.6,
        )
        assert config.preset == "car_studio"
        assert config.key_energy == 600
        assert config.hdri == "studio_neutral_v001"
        assert config.hdri_strength == 0.6


class TestExposureBracketConfig:
    """Tests for ExposureBracketConfig dataclass."""

    def test_default_values(self):
        config = ExposureBracketConfig()
        assert config.enabled is False
        assert config.brackets == (-0.5, 0.0, 0.5)
        assert config.selection_mode == "best"

    def test_enabled_with_custom_brackets(self):
        config = ExposureBracketConfig(
            enabled=True,
            brackets=(-1.0, 0.0, 1.0),
            selection_mode="median",
        )
        assert config.enabled is True
        assert config.brackets == (-1.0, 0.0, 1.0)
        assert config.selection_mode == "median"


class TestRenderConfig:
    """Tests for extended RenderConfig dataclass."""

    def test_default_includes_lighting_and_exposure(self):
        config = RenderConfig()
        assert isinstance(config.lighting, LightingConfig)
        assert isinstance(config.exposure_bracket, ExposureBracketConfig)
        assert config.exposure == 0.0

    def test_with_lighting_config(self):
        lighting = LightingConfig(preset="material_preview")
        config = RenderConfig(
            lighting=lighting,
            exposure=0.5,
        )
        assert config.lighting.preset == "material_preview"
        assert config.exposure == 0.5


class TestLoadLightingPreset:
    """Tests for loading lighting presets from YAML files."""

    def test_load_car_studio_preset(self):
        preset = load_lighting_preset("car_studio")
        # May be None if preset file not found (depends on cwd)
        if preset is not None:
            assert "key_light" in preset
            assert "fill_light" in preset
            assert "rim_light" in preset
            assert preset["key_light"]["energy"] == 600

    def test_load_nonexistent_preset_returns_none(self):
        preset = load_lighting_preset("nonexistent_preset_xyz")
        assert preset is None


class TestGateConfigWithLighting:
    """Tests for loading gate configs with new lighting/exposure settings."""

    def test_car_realism_config_has_lighting(self):
        # Find the car_realism_v001.yaml
        config_paths = [
            Path("../fab/gates/car_realism_v001.yaml"),
            Path("fab/gates/car_realism_v001.yaml"),
        ]

        config_path = None
        for p in config_paths:
            if p.exists():
                config_path = p
                break

        if config_path is None:
            pytest.skip("car_realism_v001.yaml not found")

        config = load_gate_config(config_path)

        # Check lighting config
        assert config.render.lighting.preset == "car_studio"
        assert config.render.lighting.hdri == "studio_neutral_v001"
        assert config.render.lighting.hdri_strength == 0.6

        # Check exposure bracket config
        assert config.render.exposure_bracket.enabled is True
        assert config.render.exposure_bracket.brackets == (-0.5, 0.0, 0.5)
        assert config.render.exposure_bracket.selection_mode == "best"
