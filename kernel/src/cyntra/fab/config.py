"""
Fab Gate Configuration Loading

Handles loading and validation of gate configurations from YAML files.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class LightingConfig:
    """Lighting setup configuration."""

    preset: str | None = None  # e.g., "car_studio", "furniture_showroom"
    key_energy: float | None = None
    fill_energy: float | None = None
    rim_energy: float | None = None
    hdri: str | None = None  # e.g., "studio_neutral_v001"
    hdri_strength: float = 0.5
    hdri_rotation_deg: float = 0.0
    ambient_strength: float = 0.1


@dataclass
class ExposureBracketConfig:
    """Exposure bracketing configuration for robust evaluation."""

    enabled: bool = False
    brackets: tuple[float, ...] = (-0.5, 0.0, 0.5)  # EV offsets
    selection_mode: str = "best"  # "best" or "all"


@dataclass
class RenderConfig:
    """Render settings for determinism."""

    engine: str = "CYCLES"
    device: str = "CPU"
    resolution: tuple[int, int] = (768, 512)
    samples: int = 128
    seed: int = 1337
    denoise: bool = False
    threads: int = 4
    output_format: str = "PNG"
    color_depth: int = 16

    # Lighting configuration
    lighting: LightingConfig = field(default_factory=LightingConfig)

    # Exposure settings
    exposure: float = 0.0  # EV offset from default
    exposure_bracket: ExposureBracketConfig = field(default_factory=ExposureBracketConfig)


@dataclass
class CriticConfig:
    """Configuration for a single critic."""

    enabled: bool = True
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class DecisionConfig:
    """Gate decision parameters."""

    weights: dict[str, float] = field(
        default_factory=lambda: {
            "category": 0.35,
            "alignment": 0.20,
            "realism": 0.20,
            "geometry": 0.25,
        }
    )
    overall_pass_min: float = 0.75
    subscore_floors: dict[str, float] = field(
        default_factory=lambda: {
            "category": 0.70,
            "geometry": 0.60,
            "alignment": 0.50,
            "realism": 0.40,
        }
    )


@dataclass
class IterationConfig:
    """Iteration loop settings."""

    max_iterations: int = 5
    vote_pack_on_uncertainty: bool = True
    uncertainty_band: float = 0.03


@dataclass
class TrapDetectionConfig:
    """Trap detection settings based on detailed balance paper."""

    enabled: bool = True
    action_threshold: float = 0.1  # From paper's action_low
    delta_v_threshold: float = 0.05  # From paper's delta_v_low
    min_observations: int = 3  # Minimum transitions before detecting


@dataclass
class DynamicsConfig:
    """
    Dynamics tracking configuration for detailed balance analysis.

    Based on: "Detailed balance in LLM-driven agents" (arXiv:2512.10047)

    Enables logging of state transitions to understand and control
    the LLM's implicit potential function during asset generation.
    """

    enabled: bool = False
    log_to_db: bool = True
    db_path: str | None = None  # Default: .cyntra/dynamics/fab_transitions.db

    # State space configuration
    score_buckets: int = 5  # Granularity of score discretization
    track_mesh_fingerprint: bool = True  # Include geometry hash in state

    # Temperature control (β in paper)
    temperature: float = 1.0  # Lower = more exploitation, higher = more exploration
    min_temperature: float = 0.5  # Floor to prevent collapse
    temperature_decay: float = 1.0  # Multiplier per iteration (1.0 = no decay)

    # Trap detection
    trap_detection: TrapDetectionConfig = field(default_factory=TrapDetectionConfig)

    # Detailed balance verification
    verify_balance: bool = False  # Run verification after each batch
    balance_chi2_threshold: float = 3.0  # χ²/ndf threshold from paper


@dataclass
class GateConfig:
    """Complete gate configuration."""

    gate_config_id: str
    category: str
    version: str = "1.0.0"

    # Scene references
    lookdev_scene_id: str | None = None
    camera_rig_id: str | None = None

    # Sub-configs
    render: RenderConfig = field(default_factory=RenderConfig)
    critics: dict[str, CriticConfig] = field(default_factory=dict)
    decision: DecisionConfig = field(default_factory=DecisionConfig)
    iteration: IterationConfig = field(default_factory=IterationConfig)

    # Failure handling
    hard_fail_codes: list[str] = field(default_factory=list)
    repair_playbook: dict[str, dict[str, Any]] = field(default_factory=dict)
    library_checks: dict[str, Any] = field(default_factory=dict)

    # Dynamics tracking (detailed balance analysis)
    dynamics: DynamicsConfig = field(default_factory=DynamicsConfig)


def load_gate_config(config_path: Path) -> GateConfig:
    """
    Load gate configuration from YAML file.

    Args:
        config_path: Path to gate config YAML file

    Returns:
        Parsed GateConfig object

    Raises:
        FileNotFoundError: If config file doesn't exist
        ValueError: If config is invalid
    """
    if not config_path.exists():
        raise FileNotFoundError(f"Gate config not found: {config_path}")

    with open(config_path) as f:
        raw = yaml.safe_load(f)

    if not isinstance(raw, dict):
        raise ValueError(f"Invalid config format in {config_path}")

    # Parse render config
    render_raw = raw.get("render", {})

    # Parse lighting config
    lighting_raw = render_raw.get("lighting", {})
    lighting = LightingConfig(
        preset=lighting_raw.get("preset"),
        key_energy=lighting_raw.get("key_energy"),
        fill_energy=lighting_raw.get("fill_energy"),
        rim_energy=lighting_raw.get("rim_energy"),
        hdri=lighting_raw.get("hdri"),
        hdri_strength=lighting_raw.get("hdri_strength", 0.5),
        hdri_rotation_deg=lighting_raw.get("hdri_rotation_deg", 0.0),
        ambient_strength=lighting_raw.get("ambient_strength", 0.1),
    )

    # Parse exposure bracket config
    bracket_raw = render_raw.get("exposure_bracket", {})
    brackets = bracket_raw.get("brackets", [-0.5, 0.0, 0.5])
    exposure_bracket = ExposureBracketConfig(
        enabled=bracket_raw.get("enabled", False),
        brackets=tuple(brackets) if isinstance(brackets, list) else brackets,
        selection_mode=bracket_raw.get("selection_mode", "best"),
    )

    render = RenderConfig(
        engine=render_raw.get("engine", "CYCLES"),
        device=render_raw.get("device", "CPU"),
        resolution=tuple(render_raw.get("resolution", [768, 512])),
        samples=render_raw.get("samples", 128),
        seed=render_raw.get("seed", 1337),
        denoise=render_raw.get("denoise", False),
        threads=render_raw.get("threads", 4),
        output_format=render_raw.get("output", {}).get("format", "PNG"),
        color_depth=render_raw.get("output", {}).get("color_depth", 16),
        lighting=lighting,
        exposure=render_raw.get("exposure", 0.0),
        exposure_bracket=exposure_bracket,
    )

    # Parse critics config
    critics = {}
    for name, cfg in raw.get("critics", {}).items():
        if isinstance(cfg, dict):
            enabled = cfg.pop("enabled", True)
            critics[name] = CriticConfig(enabled=enabled, params=cfg)

    # Parse decision config
    decision_raw = raw.get("decision", {})
    decision = DecisionConfig(
        weights=decision_raw.get("weights", DecisionConfig().weights),
        overall_pass_min=decision_raw.get("overall_pass_min", 0.75),
        subscore_floors=decision_raw.get("subscore_floors", DecisionConfig().subscore_floors),
    )

    # Parse iteration config
    iteration_raw = raw.get("iteration", {})
    iteration = IterationConfig(
        max_iterations=iteration_raw.get("max_iterations", iteration_raw.get("max_iters", 5)),
        vote_pack_on_uncertainty=iteration_raw.get("vote_pack_on_uncertainty", True),
        uncertainty_band=iteration_raw.get("uncertainty_band", 0.03),
    )

    # Parse dynamics config
    dynamics_raw = raw.get("dynamics", {})
    trap_raw = dynamics_raw.get("trap_detection", {})
    trap_detection = TrapDetectionConfig(
        enabled=trap_raw.get("enabled", True),
        action_threshold=trap_raw.get("action_threshold", 0.1),
        delta_v_threshold=trap_raw.get("delta_v_threshold", 0.05),
        min_observations=trap_raw.get("min_observations", 3),
    )
    dynamics = DynamicsConfig(
        enabled=dynamics_raw.get("enabled", False),
        log_to_db=dynamics_raw.get("log_to_db", True),
        db_path=dynamics_raw.get("db_path"),
        score_buckets=dynamics_raw.get("score_buckets", 5),
        track_mesh_fingerprint=dynamics_raw.get("track_mesh_fingerprint", True),
        temperature=dynamics_raw.get("temperature", 1.0),
        min_temperature=dynamics_raw.get("min_temperature", 0.5),
        temperature_decay=dynamics_raw.get("temperature_decay", 1.0),
        trap_detection=trap_detection,
        verify_balance=dynamics_raw.get("verify_balance", False),
        balance_chi2_threshold=dynamics_raw.get("balance_chi2_threshold", 3.0),
    )

    return GateConfig(
        gate_config_id=raw.get("gate_config_id", config_path.stem),
        category=raw.get("category", "unknown"),
        version=raw.get("version", "1.0.0"),
        lookdev_scene_id=raw.get("lookdev_scene_id"),
        camera_rig_id=raw.get("camera_rig_id"),
        render=render,
        critics=critics,
        decision=decision,
        iteration=iteration,
        hard_fail_codes=raw.get("hard_fail_codes", []),
        repair_playbook=raw.get("repair_playbook", {}),
        library_checks=raw.get("library_checks", {}) or {},
        dynamics=dynamics,
    )


def find_gate_config(gate_config_id: str, search_paths: list[Path] = None) -> Path:
    """
    Find gate config file by ID.

    Args:
        gate_config_id: Gate configuration identifier (e.g., "car_realism_v001")
        search_paths: Paths to search for configs

    Returns:
        Path to config file

    Raises:
        FileNotFoundError: If config not found
    """
    if search_paths is None:
        # Default search paths (relative to repo root/workcell).
        search_paths = [Path("fab/gates"), Path(".fab/gates")]

        # Also search upwards from CWD to support running from subdirs (e.g. kernel/).
        cwd = Path.cwd().resolve()
        for parent in [cwd, *cwd.parents]:
            search_paths.append(parent / "fab" / "gates")
            search_paths.append(parent / ".fab" / "gates")

        # De-duplicate while preserving order.
        seen: set[Path] = set()
        search_paths = [p for p in search_paths if not (p in seen or seen.add(p))]

    for base_path in search_paths:
        config_path = base_path / f"{gate_config_id}.yaml"
        if config_path.exists():
            return config_path

    raise FileNotFoundError(f"Gate config '{gate_config_id}' not found in: {search_paths}")
