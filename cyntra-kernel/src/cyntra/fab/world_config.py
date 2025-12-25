"""
World Configuration Loading and Validation.

Loads and validates world.yaml files according to the Fab World schema.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional
import os
import sys
import yaml
import json


class WorldConfig:
    """Parsed and validated world configuration."""

    def __init__(self, config_path: Path):
        """Load and validate world.yaml."""
        self.config_path = config_path
        self.world_dir = config_path.parent

        # Load YAML
        with open(config_path) as f:
            self.raw_config = yaml.safe_load(f)

        # Validate against schema
        self._validate_schema()

        # Parse required fields
        self.schema_version = self.raw_config["schema_version"]
        self.world_id = self.raw_config["world_id"]
        self.world_type = self.raw_config["world_type"]
        self.version = self.raw_config["version"]

        # Optional fields
        self.world_config_id = self.raw_config.get("world_config_id")
        self.generator = self.raw_config.get("generator", {})
        self.build = self.raw_config.get("build", {})
        self.parameters = self.raw_config.get("parameters", {})
        self.stages = self.raw_config.get("stages", [])
        self.budgets = self.raw_config.get("budgets", {})
        self.publish = self.raw_config.get("publish", {})

        # Validate stage dependencies
        self._validate_stage_dependencies()

    def _validate_schema(self):
        """Validate configuration against JSON schema."""
        # Load schema
        schema_path = Path(__file__).parent / "world_schema.json"
        with open(schema_path) as f:
            schema = json.load(f)

        # Validate (using jsonschema if available, otherwise basic checks)
        try:
            import jsonschema
            jsonschema.validate(instance=self.raw_config, schema=schema)
        except ImportError:
            # Fallback to basic validation
            self._basic_validation()

    def _basic_validation(self):
        """Basic validation when jsonschema not available."""
        required = ["schema_version", "world_id", "world_type", "version", "stages"]
        for field in required:
            if field not in self.raw_config:
                raise ValueError(f"Missing required field: {field}")

        if not self.raw_config["stages"]:
            raise ValueError("At least one stage is required")

    def _validate_stage_dependencies(self):
        """Validate stage dependency DAG."""
        stage_ids = {stage["id"] for stage in self.stages}

        for stage in self.stages:
            requires = stage.get("requires", [])
            for dep_id in requires:
                if dep_id not in stage_ids:
                    raise ValueError(
                        f"Stage '{stage['id']}' requires non-existent stage '{dep_id}'"
                    )

        # Check for circular dependencies (simple cycle detection)
        self._check_circular_deps()

    def _check_circular_deps(self):
        """Check for circular dependencies in stage graph."""
        # Build adjacency list
        graph: Dict[str, List[str]] = {}
        for stage in self.stages:
            stage_id = stage["id"]
            graph[stage_id] = stage.get("requires", [])

        # DFS to detect cycles
        visited = set()
        rec_stack = set()

        def has_cycle(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)

            for neighbor in graph.get(node, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True

            rec_stack.remove(node)
            return False

        for stage_id in graph:
            if stage_id not in visited:
                if has_cycle(stage_id):
                    raise ValueError(f"Circular dependency detected involving stage '{stage_id}'")

    def get_stage_order(self) -> List[str]:
        """Get topologically sorted stage execution order."""
        # Build adjacency list
        graph: Dict[str, List[str]] = {}
        in_degree: Dict[str, int] = {}

        for stage in self.stages:
            stage_id = stage["id"]
            graph[stage_id] = stage.get("requires", [])
            in_degree[stage_id] = 0

        # Calculate in-degrees
        for stage_id, deps in graph.items():
            for dep in deps:
                in_degree[dep] = in_degree.get(dep, 0) + 1

        # Wait, this is backwards - we want stages that depend ON us, not stages WE depend on
        # Let me fix the topological sort

        # Build reverse graph (dependencies)
        dependencies: Dict[str, List[str]] = {}
        in_degree_correct: Dict[str, int] = {}

        for stage in self.stages:
            stage_id = stage["id"]
            dependencies[stage_id] = []
            in_degree_correct[stage_id] = 0

        for stage in self.stages:
            stage_id = stage["id"]
            requires = stage.get("requires", [])
            in_degree_correct[stage_id] = len(requires)
            for dep in requires:
                if dep not in dependencies:
                    dependencies[dep] = []
                dependencies[dep].append(stage_id)

        # Kahn's algorithm for topological sort
        queue = [sid for sid, deg in in_degree_correct.items() if deg == 0]
        result = []

        while queue:
            current = queue.pop(0)
            result.append(current)

            for dependent in dependencies.get(current, []):
                in_degree_correct[dependent] -= 1
                if in_degree_correct[dependent] == 0:
                    queue.append(dependent)

        if len(result) != len(self.stages):
            raise ValueError("Cannot resolve stage execution order (cycle detected)")

        return result

    def get_stage(self, stage_id: str) -> Optional[Dict[str, Any]]:
        """Get stage configuration by ID."""
        for stage in self.stages:
            if stage["id"] == stage_id:
                return stage
        return None

    def resolve_parameters(self, overrides: Dict[str, Any]) -> Dict[str, Any]:
        """
        Resolve parameters with CLI overrides.

        Args:
            overrides: Dict with dot-path keys like {"lighting.preset": "cosmic"}

        Returns:
            Fully resolved parameters dict
        """
        import copy

        # Start with defaults
        resolved = copy.deepcopy(self.parameters.get("defaults", {}))

        # Apply overrides using dot-path notation
        for key, value in overrides.items():
            parts = key.split(".")
            current = resolved

            # Navigate/create nested structure
            for part in parts[:-1]:
                if part not in current:
                    current[part] = {}
                current = current[part]

            # Set the value
            current[parts[-1]] = value

        return resolved

    def get_template_blend_path(self) -> Path:
        """Get absolute path to template blend file."""
        template_rel = self.build.get("template_blend", "blender/template.blend")
        return (self.world_dir / template_rel).resolve()

    def get_stage_script_path(self, stage: Dict[str, Any]) -> Path:
        """Get absolute path to stage script."""
        script_rel = stage.get("script", "")
        return (self.world_dir / script_rel).resolve()

    def get_determinism_config(self) -> Dict[str, Any]:
        """Get determinism configuration."""
        return self.build.get("determinism", {
            "seed": 42,
            "pythonhashseed": 0,
            "cycles_seed": 42,
        })

    def get_blender_args(self) -> List[str]:
        """Get Blender command-line arguments."""
        return self.build.get("blender", {}).get("args", ["--background", "--factory-startup"])

    def get_blender_executable(self) -> str:
        """
        Get Blender executable to use for stage execution.

        Resolution order:
        1) Environment override (`FAB_BLENDER` or `FAB_BLENDER_BIN`)
        2) `build.blender.executable` in world.yaml
        3) macOS fallback to `/Applications/Blender.app/...`
        4) Default `blender` from PATH
        """
        env_override = os.environ.get("FAB_BLENDER") or os.environ.get("FAB_BLENDER_BIN")
        if env_override and env_override.strip():
            return os.path.expanduser(env_override.strip())

        blender_cfg = self.build.get("blender", {}) or {}
        cfg_exec = blender_cfg.get("executable")
        if isinstance(cfg_exec, str) and cfg_exec.strip():
            return os.path.expanduser(cfg_exec.strip())

        if sys.platform == "darwin":
            app_bin = Path("/Applications/Blender.app/Contents/MacOS/Blender")
            if app_bin.exists():
                return str(app_bin)

        return "blender"

    def get_blender_env(self) -> Dict[str, str]:
        """Get Blender environment variables."""
        env = self.build.get("blender", {}).get("env", {})
        # Ensure determinism env vars are set
        determinism = self.get_determinism_config()
        if "PYTHONHASHSEED" not in env:
            env["PYTHONHASHSEED"] = str(determinism.get("pythonhashseed", 0))
        return env


def load_world_config(world_path: Path) -> WorldConfig:
    """
    Load world configuration from directory or world.yaml file.

    Args:
        world_path: Path to world directory or world.yaml file

    Returns:
        Validated WorldConfig instance
    """
    if world_path.is_dir():
        config_file = world_path / "world.yaml"
    else:
        config_file = world_path

    if not config_file.exists():
        raise FileNotFoundError(f"World config not found: {config_file}")

    return WorldConfig(config_file)
