"""
Material Library - Organize and export PBR materials for game engines.

Provides:
- Material organization with metadata
- Godot material resource generation (.tres files)
- Material manifest for library management
"""

from __future__ import annotations

import json
import shutil
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class PBRMaps:
    """Paths to PBR texture maps."""

    basecolor: Path | None = None
    normal: Path | None = None
    roughness: Path | None = None
    metalness: Path | None = None
    height: Path | None = None
    ao: Path | None = None  # Ambient occlusion (optional)
    emission: Path | None = None  # Emission map (optional)

    def to_dict(self) -> dict[str, str | None]:
        return {k: str(v) if v else None for k, v in asdict(self).items()}

    @classmethod
    def from_directory(cls, directory: Path) -> PBRMaps:
        """
        Auto-detect PBR maps from a directory.

        Looks for common naming patterns:
        - basecolor/albedo/diffuse
        - normal
        - roughness
        - metalness/metallic
        - height/displacement
        - ao/ambient_occlusion
        - emission/emissive
        """
        maps = cls()

        if not directory.exists():
            return maps

        # Common patterns for each map type
        patterns = {
            "basecolor": ["basecolor", "albedo", "diffuse", "color", "base_color"],
            "normal": ["normal", "norm", "nrm"],
            "roughness": ["roughness", "rough"],
            "metalness": ["metalness", "metallic", "metal"],
            "height": ["height", "displacement", "disp", "bump"],
            "ao": ["ao", "ambient_occlusion", "occlusion"],
            "emission": ["emission", "emissive", "emit"],
        }

        for map_type, keywords in patterns.items():
            for file in directory.iterdir():
                if not file.is_file():
                    continue
                name_lower = file.stem.lower()
                if any(kw in name_lower for kw in keywords):
                    setattr(maps, map_type, file)
                    break

        return maps

    def copy_to(self, dest_dir: Path, prefix: str = "") -> PBRMaps:
        """
        Copy all maps to destination directory with optional prefix.

        Returns new PBRMaps with updated paths.
        """
        dest_dir.mkdir(parents=True, exist_ok=True)
        new_maps = PBRMaps()

        for map_type in [
            "basecolor",
            "normal",
            "roughness",
            "metalness",
            "height",
            "ao",
            "emission",
        ]:
            src = getattr(self, map_type)
            if src and src.exists():
                suffix = src.suffix
                dest_name = f"{prefix}{map_type}{suffix}" if prefix else f"{map_type}{suffix}"
                dest = dest_dir / dest_name
                shutil.copy2(src, dest)
                setattr(new_maps, map_type, dest)

        return new_maps


@dataclass
class MaterialMetadata:
    """Metadata for a PBR material."""

    name: str
    description: str = ""
    category: str = "uncategorized"
    tags: list[str] = field(default_factory=list)
    prompt: str = ""  # Generation prompt if AI-generated
    seed: int | None = None
    workflow: str = ""  # ComfyUI workflow used
    resolution: tuple[int, int] = (1024, 1024)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    source: str = "comfyui"  # comfyui, substance, photogrammetry, etc.

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "tags": self.tags,
            "prompt": self.prompt,
            "seed": self.seed,
            "workflow": self.workflow,
            "resolution": list(self.resolution),
            "created_at": self.created_at,
            "source": self.source,
        }


@dataclass
class Material:
    """A complete PBR material with maps and metadata."""

    id: str
    metadata: MaterialMetadata
    maps: PBRMaps
    library_path: Path | None = None  # Path in material library

    def to_manifest_entry(self) -> dict[str, Any]:
        """Generate manifest entry for this material."""
        return {
            "id": self.id,
            "metadata": self.metadata.to_dict(),
            "maps": self.maps.to_dict(),
            "library_path": str(self.library_path) if self.library_path else None,
        }


class MaterialLibrary:
    """
    Manages a library of PBR materials.

    Structure:
    ```
    library_root/
      manifest.json           # Library manifest
      materials/
        terrain/
          grass_01/
            metadata.json
            basecolor.png
            normal.png
            roughness.png
            metalness.png
            height.png
            grass_01.tres      # Godot material resource
          stone_01/
            ...
        architecture/
          brick_01/
            ...
    ```
    """

    def __init__(self, library_root: Path) -> None:
        self.root = library_root
        self.materials_dir = library_root / "materials"
        self.manifest_path = library_root / "manifest.json"
        self._manifest: dict[str, Any] | None = None

    def _ensure_dirs(self) -> None:
        """Ensure library directories exist."""
        self.root.mkdir(parents=True, exist_ok=True)
        self.materials_dir.mkdir(parents=True, exist_ok=True)

    def _load_manifest(self) -> dict[str, Any]:
        """Load or create library manifest."""
        if self._manifest is not None:
            return self._manifest

        if self.manifest_path.exists():
            self._manifest = json.loads(self.manifest_path.read_text())
        else:
            self._manifest = {
                "version": "1.0",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
                "materials": {},
                "categories": [],
                "tags": [],
            }

        return self._manifest

    def _save_manifest(self) -> None:
        """Save library manifest."""
        if self._manifest is None:
            return

        self._manifest["updated_at"] = datetime.now(UTC).isoformat()

        # Update category and tag lists
        categories = set()
        tags = set()
        for mat in self._manifest.get("materials", {}).values():
            meta = mat.get("metadata", {})
            if meta.get("category"):
                categories.add(meta["category"])
            for tag in meta.get("tags", []):
                tags.add(tag)

        self._manifest["categories"] = sorted(categories)
        self._manifest["tags"] = sorted(tags)

        self.manifest_path.write_text(json.dumps(self._manifest, indent=2, ensure_ascii=False))

    def add_material(
        self,
        material: Material,
        category: str | None = None,
        generate_godot: bool = True,
    ) -> Path:
        """
        Add a material to the library.

        Args:
            material: Material to add
            category: Override category (uses metadata.category if None)
            generate_godot: Generate Godot .tres resource file

        Returns:
            Path to material directory in library
        """
        self._ensure_dirs()
        manifest = self._load_manifest()

        # Determine category
        cat = category or material.metadata.category or "uncategorized"

        # Create material directory
        mat_dir = self.materials_dir / cat / material.id
        mat_dir.mkdir(parents=True, exist_ok=True)

        # Copy maps to library
        new_maps = material.maps.copy_to(mat_dir)
        material.maps = new_maps
        material.library_path = mat_dir

        # Write metadata
        metadata_path = mat_dir / "metadata.json"
        metadata_path.write_text(
            json.dumps(material.metadata.to_dict(), indent=2, ensure_ascii=False)
        )

        # Generate Godot material if requested
        if generate_godot:
            tres_path = mat_dir / f"{material.id}.tres"
            self._generate_godot_material(material, tres_path)

        # Update manifest
        manifest["materials"][material.id] = material.to_manifest_entry()
        self._save_manifest()

        logger.info(
            "Added material to library",
            material_id=material.id,
            category=cat,
            path=str(mat_dir),
        )

        return mat_dir

    def _generate_godot_material(self, material: Material, output_path: Path) -> None:
        """
        Generate a Godot StandardMaterial3D resource file (.tres).

        Creates a text-based .tres file that can be loaded in Godot 4.x.
        """
        maps = material.maps

        # Build resource file
        lines = [
            '[gd_resource type="StandardMaterial3D" format=3]',
            "",
        ]

        # Add external resources (textures)
        ext_resources = []
        resource_id = 1

        def add_texture(map_path: Path | None, hint: str = "") -> int | None:
            nonlocal resource_id
            if not map_path or not map_path.exists():
                return None

            # Use relative path from material directory
            rel_path = map_path.name
            ext_resources.append(
                f'[ext_resource type="Texture2D" path="{rel_path}" id="{resource_id}"]'
            )
            current_id = resource_id
            resource_id += 1
            return current_id

        # Add textures
        albedo_id = add_texture(maps.basecolor)
        normal_id = add_texture(maps.normal)
        roughness_id = add_texture(maps.roughness)
        metallic_id = add_texture(maps.metalness)
        height_id = add_texture(maps.height)
        ao_id = add_texture(maps.ao)
        emission_id = add_texture(maps.emission)

        # Add external resources to file
        for ext_res in ext_resources:
            lines.append(ext_res)

        if ext_resources:
            lines.append("")

        # Build material resource
        lines.append("[resource]")
        lines.append(f'resource_name = "{material.id}"')

        # Albedo
        if albedo_id:
            lines.append(f'albedo_texture = ExtResource("{albedo_id}")')

        # Normal map
        if normal_id:
            lines.append("normal_enabled = true")
            lines.append(f'normal_texture = ExtResource("{normal_id}")')

        # Roughness
        if roughness_id:
            lines.append(f'roughness_texture = ExtResource("{roughness_id}")')
            lines.append("roughness_texture_channel = 0")  # Red channel

        # Metallic
        if metallic_id:
            lines.append(f'metallic_texture = ExtResource("{metallic_id}")')
            lines.append("metallic_texture_channel = 0")  # Red channel

        # Height/depth (parallax mapping)
        if height_id:
            lines.append("heightmap_enabled = true")
            lines.append(f'heightmap_texture = ExtResource("{height_id}")')
            lines.append("heightmap_scale = 0.05")  # Conservative default
            lines.append("heightmap_deep_parallax = false")

        # Ambient occlusion
        if ao_id:
            lines.append("ao_enabled = true")
            lines.append(f'ao_texture = ExtResource("{ao_id}")')
            lines.append("ao_texture_channel = 0")

        # Emission
        if emission_id:
            lines.append("emission_enabled = true")
            lines.append(f'emission_texture = ExtResource("{emission_id}")')

        # UV settings for tiling
        lines.append("uv1_scale = Vector3(1, 1, 1)")
        lines.append("uv1_offset = Vector3(0, 0, 0)")

        # Write file
        output_path.write_text("\n".join(lines) + "\n")

        logger.debug(
            "Generated Godot material",
            material_id=material.id,
            path=str(output_path),
        )

    def get_material(self, material_id: str) -> Material | None:
        """Get a material by ID."""
        manifest = self._load_manifest()
        entry = manifest.get("materials", {}).get(material_id)

        if not entry:
            return None

        # Reconstruct material from manifest
        metadata = MaterialMetadata(**entry.get("metadata", {}))

        maps_data = entry.get("maps", {})
        maps = PBRMaps(
            basecolor=Path(maps_data["basecolor"]) if maps_data.get("basecolor") else None,
            normal=Path(maps_data["normal"]) if maps_data.get("normal") else None,
            roughness=Path(maps_data["roughness"]) if maps_data.get("roughness") else None,
            metalness=Path(maps_data["metalness"]) if maps_data.get("metalness") else None,
            height=Path(maps_data["height"]) if maps_data.get("height") else None,
            ao=Path(maps_data["ao"]) if maps_data.get("ao") else None,
            emission=Path(maps_data["emission"]) if maps_data.get("emission") else None,
        )

        library_path = Path(entry["library_path"]) if entry.get("library_path") else None

        return Material(
            id=material_id,
            metadata=metadata,
            maps=maps,
            library_path=library_path,
        )

    def list_materials(
        self,
        category: str | None = None,
        tag: str | None = None,
    ) -> list[str]:
        """List material IDs, optionally filtered."""
        manifest = self._load_manifest()
        materials = manifest.get("materials", {})

        result = []
        for mat_id, entry in materials.items():
            meta = entry.get("metadata", {})

            if category and meta.get("category") != category:
                continue

            if tag and tag not in meta.get("tags", []):
                continue

            result.append(mat_id)

        return result

    def list_categories(self) -> list[str]:
        """List all categories in the library."""
        manifest = self._load_manifest()
        return manifest.get("categories", [])

    def list_tags(self) -> list[str]:
        """List all tags in the library."""
        manifest = self._load_manifest()
        return manifest.get("tags", [])

    def export_for_godot(self, output_dir: Path) -> list[Path]:
        """
        Export all materials to a Godot-ready directory structure.

        Creates:
        - materials/ directory with .tres files
        - textures/ directory with all texture files

        Returns list of exported .tres paths.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        materials_out = output_dir / "materials"
        textures_out = output_dir / "textures"
        materials_out.mkdir(exist_ok=True)
        textures_out.mkdir(exist_ok=True)

        exported = []
        manifest = self._load_manifest()

        for mat_id in manifest.get("materials", {}):
            material = self.get_material(mat_id)
            if not material:
                continue

            # Copy textures
            tex_dir = textures_out / mat_id
            new_maps = material.maps.copy_to(tex_dir)

            # Update material with new paths
            material.maps = new_maps

            # Generate .tres in materials directory
            tres_path = materials_out / f"{mat_id}.tres"
            self._generate_godot_material(material, tres_path)
            exported.append(tres_path)

        logger.info(
            "Exported materials for Godot",
            count=len(exported),
            output_dir=str(output_dir),
        )

        return exported


def create_material_from_comfyui_output(
    output_dir: Path,
    material_id: str,
    prompt: str,
    seed: int,
    workflow: str = "chord_pbr",
    category: str = "generated",
    tags: list[str] | None = None,
) -> Material:
    """
    Create a Material from ComfyUI CHORD output.

    Args:
        output_dir: Directory containing ComfyUI outputs
        material_id: Unique ID for the material
        prompt: Generation prompt used
        seed: Random seed used
        workflow: Workflow ID
        category: Material category
        tags: Optional tags

    Returns:
        Material object ready to add to library
    """
    # Auto-detect maps
    maps = PBRMaps.from_directory(output_dir)

    # Create metadata
    metadata = MaterialMetadata(
        name=material_id.replace("_", " ").title(),
        description=f"Generated from prompt: {prompt[:100]}",
        category=category,
        tags=tags or [],
        prompt=prompt,
        seed=seed,
        workflow=workflow,
        source="comfyui",
    )

    return Material(
        id=material_id,
        metadata=metadata,
        maps=maps,
    )
