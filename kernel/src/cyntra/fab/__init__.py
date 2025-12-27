"""
Fab - Asset Creation & Realism Gate Subsystem

This module provides deterministic asset evaluation through:
- Canonical headless renders via Blender
- Multi-signal critics (category, alignment, realism, geometry)
- Gate decision logic with iterate-until-pass repair loops
"""

from pathlib import Path

from .config import GateConfig, find_gate_config, load_gate_config
from .gate import GateResult, run_gate
from .iteration import (
    IterationManager,
    IterationState,
    RepairIssue,
    create_repair_context,
    should_create_repair_issue,
)
from .multi_category import (
    MultiCategoryGateRouter,
    detect_category_from_tags,
    list_supported_categories,
    route_to_gate,
)
from .render import RenderResult, run_render_harness
from .templates import (
    TemplateAdherenceResult,
    TemplateChecker,
    TemplateManifest,
    TemplateRegistry,
    check_template_adherence,
    get_template_registry,
)
from .vault import (
    AddonEntry,
    TemplateEntry,
    VaultRegistry,
    copy_template,
    get_addon,
    get_template,
    get_vault_registry,
    install_addon,
)
from .vote_pack import (
    VotePackConfig,
    VotePackResult,
    VotePackRunner,
    run_vote_pack_if_needed,
)

# Critics (optional - require ML dependencies)
try:
    from .critics import (
        AlignmentCritic,
        AlignmentResult,
        CategoryCritic,
        CategoryResult,
        GeometryCritic,
        GeometryResult,
        RealismCritic,
        RealismResult,
    )

    _HAS_CRITICS = True
except ImportError:
    _HAS_CRITICS = False
    CategoryCritic = None  # type: ignore
    CategoryResult = None  # type: ignore
    AlignmentCritic = None  # type: ignore
    AlignmentResult = None  # type: ignore
    RealismCritic = None  # type: ignore
    RealismResult = None  # type: ignore
    GeometryCritic = None  # type: ignore
    GeometryResult = None  # type: ignore

__version__ = "0.1.0"

# Module paths
FAB_ROOT = Path(__file__).parent
SCHEMAS_ROOT = FAB_ROOT.parent.parent.parent / "schemas" / "fab"

__all__ = [
    "__version__",
    "FAB_ROOT",
    "SCHEMAS_ROOT",
    # Config
    "GateConfig",
    "load_gate_config",
    "find_gate_config",
    # Gate
    "run_gate",
    "GateResult",
    # Render
    "run_render_harness",
    "RenderResult",
    # Templates
    "TemplateRegistry",
    "TemplateManifest",
    "TemplateChecker",
    "TemplateAdherenceResult",
    "get_template_registry",
    "check_template_adherence",
    # Iteration
    "IterationManager",
    "IterationState",
    "RepairIssue",
    "should_create_repair_issue",
    "create_repair_context",
    # Vote Pack
    "VotePackRunner",
    "VotePackConfig",
    "VotePackResult",
    "run_vote_pack_if_needed",
    # Multi-category
    "MultiCategoryGateRouter",
    "route_to_gate",
    "list_supported_categories",
    "detect_category_from_tags",
    # Vault
    "VaultRegistry",
    "AddonEntry",
    "TemplateEntry",
    "get_vault_registry",
    "get_addon",
    "get_template",
    "install_addon",
    "copy_template",
    # Critics
    "CategoryCritic",
    "CategoryResult",
    "AlignmentCritic",
    "AlignmentResult",
    "RealismCritic",
    "RealismResult",
    "GeometryCritic",
    "GeometryResult",
]
