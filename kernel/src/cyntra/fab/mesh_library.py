"""
Mesh Library - Organize and export 3D meshes for game engines.

Provides:
- 3D mesh organization with metadata
- Godot scene file generation (.tscn files)
- Mesh manifest for library management
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
class MeshFiles:
    """Paths to mesh files and textures."""

    glb: Path | None = None  # Main GLB/GLTF mesh file
    glb_untextured: Path | None = None  # Untextured version (optional)
    thumbnail: Path | None = None  # Preview image

    # Optional separate texture files (if not embedded in GLB)
    basecolor: Path | None = None
    normal: Path | None = None
    roughness: Path | None = None
    metalness: Path | None = None

    # Directory paths for additional assets
    textures: Path | None = None  # Directory containing PBR textures
    lods: Path | None = None  # Directory containing LOD meshes

    def to_dict(self) -> dict[str, str | None]:
        return {k: str(v) if v else None for k, v in asdict(self).items()}

    @classmethod
    def from_directory(cls, directory: Path) -> MeshFiles:
        """
        Auto-detect mesh files from a directory.

        Looks for:
        - .glb/.gltf files
        - Texture files (basecolor, normal, etc.)
        - Thumbnail images
        """
        files = cls()

        if not directory.exists():
            return files

        # Look for GLB files
        glb_files = list(directory.glob("*.glb")) + list(directory.glob("*.gltf"))
        if glb_files:
            # Prefer textured version
            for f in glb_files:
                if "textured" in f.stem.lower():
                    files.glb = f
                    break
            if not files.glb:
                files.glb = glb_files[0]

            # Look for untextured version
            for f in glb_files:
                if "untextured" in f.stem.lower() or f != files.glb:
                    files.glb_untextured = f
                    break

        # Look for thumbnail
        for pattern in ["thumb*.png", "thumb*.jpg", "preview*.png", "preview*.jpg"]:
            thumbs = list(directory.glob(pattern))
            if thumbs:
                files.thumbnail = thumbs[0]
                break

        # Look for separate textures
        texture_patterns = {
            "basecolor": ["basecolor", "albedo", "diffuse", "color"],
            "normal": ["normal", "norm", "nrm"],
            "roughness": ["roughness", "rough"],
            "metalness": ["metalness", "metallic", "metal"],
        }

        for tex_type, keywords in texture_patterns.items():
            for file in directory.iterdir():
                if not file.is_file() or file.suffix.lower() not in [".png", ".jpg", ".jpeg"]:
                    continue
                name_lower = file.stem.lower()
                if any(kw in name_lower for kw in keywords):
                    setattr(files, tex_type, file)
                    break

        return files

    def copy_to(self, dest_dir: Path, mesh_id: str = "") -> MeshFiles:
        """
        Copy all files to destination directory.

        Returns new MeshFiles with updated paths.
        """
        dest_dir.mkdir(parents=True, exist_ok=True)
        new_files = MeshFiles()

        file_mapping = {
            "glb": f"{mesh_id}.glb" if mesh_id else "mesh.glb",
            "glb_untextured": f"{mesh_id}_untextured.glb" if mesh_id else "mesh_untextured.glb",
            "thumbnail": f"{mesh_id}_thumb.png" if mesh_id else "thumbnail.png",
            "basecolor": "basecolor.png",
            "normal": "normal.png",
            "roughness": "roughness.png",
            "metalness": "metalness.png",
        }

        for attr, dest_name in file_mapping.items():
            src = getattr(self, attr)
            if src and src.exists():
                dest = dest_dir / dest_name
                shutil.copy2(src, dest)
                setattr(new_files, attr, dest)

        return new_files


@dataclass
class MeshMetadata:
    """Metadata for a 3D mesh."""

    name: str
    description: str = ""
    category: str = "uncategorized"
    tags: list[str] = field(default_factory=list)
    prompt: str = ""  # Generation prompt if AI-generated
    seed: int | None = None
    workflow: str = ""  # Which workflow was used (e.g., "hunyuan3d_v2")
    source: str = ""  # comfyui, meshy, manual, etc.

    # Mesh stats
    vertices: int | None = None
    faces: int | None = None
    file_size_bytes: int | None = None
    has_textures: bool = False
    has_uvs: bool = False

    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Mesh:
    """A 3D mesh with its files and metadata."""

    id: str
    metadata: MeshMetadata
    files: MeshFiles = field(default_factory=MeshFiles)
    library_path: Path | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "metadata": self.metadata.to_dict(),
            "files": self.files.to_dict(),
            "library_path": str(self.library_path) if self.library_path else None,
        }


class MeshLibrary:
    """
    Manages a library of 3D meshes organized by category.

    Structure:
        library_root/
        ├── manifest.json          # Library metadata and index
        └── meshes/
            ├── props/
            │   ├── chair/
            │   │   ├── chair.glb
            │   │   ├── chair.tscn
            │   │   └── metadata.json
            │   └── table/
            │       └── ...
            ├── characters/
            │   └── ...
            └── environments/
                └── ...
    """

    def __init__(self, library_root: Path):
        self.library_root = Path(library_root)
        self.meshes_dir = self.library_root / "meshes"
        self.manifest_path = self.library_root / "manifest.json"

        self._manifest: dict[str, Any] = {}
        self._load_manifest()

    def _load_manifest(self):
        """Load or initialize the library manifest."""
        if self.manifest_path.exists():
            with open(self.manifest_path) as f:
                self._manifest = json.load(f)
        else:
            self._manifest = {
                "version": "1.0",
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
                "meshes": {},
                "categories": [],
                "tags": [],
            }
            self._save_manifest()

    def _save_manifest(self):
        """Save the library manifest."""
        self.library_root.mkdir(parents=True, exist_ok=True)
        self._manifest["updated_at"] = datetime.now(UTC).isoformat()

        # Update category and tag lists
        categories = set()
        tags = set()
        for mesh_data in self._manifest.get("meshes", {}).values():
            cat = mesh_data.get("metadata", {}).get("category", "")
            if cat:
                categories.add(cat)
            for tag in mesh_data.get("metadata", {}).get("tags", []):
                tags.add(tag)

        self._manifest["categories"] = sorted(categories)
        self._manifest["tags"] = sorted(tags)

        with open(self.manifest_path, "w") as f:
            json.dump(self._manifest, f, indent=2)

    def add_mesh(
        self,
        mesh: Mesh,
        category: str | None = None,
        generate_godot: bool = True,
    ) -> Path:
        """
        Add a mesh to the library.

        Args:
            mesh: The mesh to add
            category: Override category (defaults to mesh.metadata.category)
            generate_godot: Whether to generate Godot scene file

        Returns:
            Path to the mesh directory in the library
        """
        cat = category or mesh.metadata.category
        mesh_dir = self.meshes_dir / cat / mesh.id
        mesh_dir.mkdir(parents=True, exist_ok=True)

        # Copy mesh files to library
        new_files = mesh.files.copy_to(mesh_dir, mesh_id=mesh.id)
        mesh.files = new_files
        mesh.library_path = mesh_dir

        # Save metadata JSON
        metadata_path = mesh_dir / "metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(mesh.to_dict(), f, indent=2)

        # Generate Godot scene file
        if generate_godot and new_files.glb:
            self._generate_godot_scene(mesh, mesh_dir)

        # Update manifest
        self._manifest["meshes"][mesh.id] = mesh.to_dict()
        self._save_manifest()

        logger.info(
            "Added mesh to library",
            mesh_id=mesh.id,
            category=cat,
            path=str(mesh_dir),
        )

        return mesh_dir

    def _generate_godot_scene(self, mesh: Mesh, mesh_dir: Path):
        """Generate a Godot scene file (.tscn) for the mesh."""
        if not mesh.files.glb:
            return

        glb_filename = mesh.files.glb.name
        tscn_path = mesh_dir / f"{mesh.id}.tscn"

        # Create a simple PackedScene that instances the GLB
        tscn_content = f'''[gd_scene load_steps=2 format=3]

[ext_resource type="PackedScene" path="{glb_filename}" id="1"]

[node name="{mesh.id}" instance=ExtResource("1")]
'''

        with open(tscn_path, "w") as f:
            f.write(tscn_content)

        logger.debug("Generated Godot scene", path=str(tscn_path))

    def get_mesh(self, mesh_id: str) -> Mesh | None:
        """Get a mesh by ID."""
        mesh_data = self._manifest.get("meshes", {}).get(mesh_id)
        if not mesh_data:
            return None

        return Mesh(
            id=mesh_data["id"],
            metadata=MeshMetadata(**mesh_data["metadata"]),
            files=MeshFiles(
                **{k: Path(v) if v else None for k, v in mesh_data.get("files", {}).items()}
            ),
            library_path=Path(mesh_data["library_path"]) if mesh_data.get("library_path") else None,
        )

    def list_meshes(
        self,
        category: str | None = None,
        tags: list[str] | None = None,
    ) -> list[Mesh]:
        """List meshes, optionally filtered by category or tags."""
        meshes = []

        for mesh_data in self._manifest.get("meshes", {}).values():
            # Filter by category
            if category and mesh_data.get("metadata", {}).get("category") != category:
                continue

            # Filter by tags
            if tags:
                mesh_tags = set(mesh_data.get("metadata", {}).get("tags", []))
                if not all(t in mesh_tags for t in tags):
                    continue

            mesh = Mesh(
                id=mesh_data["id"],
                metadata=MeshMetadata(**mesh_data["metadata"]),
                files=MeshFiles(
                    **{k: Path(v) if v else None for k, v in mesh_data.get("files", {}).items()}
                ),
                library_path=Path(mesh_data["library_path"])
                if mesh_data.get("library_path")
                else None,
            )
            meshes.append(mesh)

        return meshes

    def get_categories(self) -> list[str]:
        """Get all categories in the library."""
        return self._manifest.get("categories", [])

    def get_tags(self) -> list[str]:
        """Get all tags in the library."""
        return self._manifest.get("tags", [])


def get_mesh_stats(glb_path: Path) -> dict[str, Any]:
    """
    Get mesh statistics from a GLB file.

    Returns dict with vertices, faces, file_size_bytes, has_textures, has_uvs
    """
    stats = {
        "vertices": None,
        "faces": None,
        "file_size_bytes": glb_path.stat().st_size if glb_path.exists() else None,
        "has_textures": False,
        "has_uvs": False,
    }

    try:
        import trimesh

        mesh = trimesh.load(str(glb_path))

        if hasattr(mesh, "vertices"):
            stats["vertices"] = len(mesh.vertices)
            stats["faces"] = len(mesh.faces) if hasattr(mesh, "faces") else None
            stats["has_uvs"] = hasattr(mesh.visual, "uv") and mesh.visual.uv is not None
        elif hasattr(mesh, "geometry"):
            # Scene with multiple meshes
            total_verts = 0
            total_faces = 0
            for geom in mesh.geometry.values():
                if hasattr(geom, "vertices"):
                    total_verts += len(geom.vertices)
                if hasattr(geom, "faces"):
                    total_faces += len(geom.faces)
            stats["vertices"] = total_verts
            stats["faces"] = total_faces

        # Check for textures
        if hasattr(mesh, "visual") and hasattr(mesh.visual, "material"):
            mat = mesh.visual.material
            if hasattr(mat, "image") and mat.image is not None:
                stats["has_textures"] = True

    except ImportError:
        logger.warning("trimesh not installed - cannot get mesh stats")
    except Exception as e:
        logger.warning(f"Failed to get mesh stats: {e}")

    return stats
