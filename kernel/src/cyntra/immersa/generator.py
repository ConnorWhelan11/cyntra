from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

IMMERSA_NAMESPACE = uuid.UUID("a1c4f4df-9a36-4e40-9ef1-6c9dcde1e6d1")


@dataclass(frozen=True)
class ImmersaAsset:
    name: str
    rel_path: str
    url: str
    size: int
    mtime_ns: int


def _safe_rel_posix(path: Path, root: Path) -> str:
    try:
        rel = path.relative_to(root)
    except ValueError:
        rel = path
    return rel.as_posix()


def scan_glb_assets(
    repo_root: Path,
    *,
    include_outora: bool = True,
    include_runs: bool = True,
) -> list[ImmersaAsset]:
    repo_root = repo_root.resolve()
    results: dict[str, ImmersaAsset] = {}

    def add(path: Path) -> None:
        if not path.is_file():
            return
        rel_path = _safe_rel_posix(path, repo_root)
        try:
            stat = path.stat()
        except OSError:
            return
        results[rel_path] = ImmersaAsset(
            name=path.name,
            rel_path=rel_path,
            url=f"/artifacts/{rel_path}",
            size=stat.st_size,
            mtime_ns=stat.st_mtime_ns,
        )

    if include_outora:
        outora_dir = repo_root / "fab" / "assets"
        if outora_dir.is_dir():
            for path in outora_dir.rglob("*.glb"):
                add(path)

    if include_runs:
        runs_dir = repo_root / ".cyntra" / "runs"
        if runs_dir.is_dir():
            for path in runs_dir.rglob("*.glb"):
                if "artifacts" not in path.parts:
                    continue
                add(path)

    return [results[k] for k in sorted(results.keys())]


def compute_assets_signature(assets: list[ImmersaAsset]) -> str:
    h = sha256()
    for asset in assets:
        h.update(asset.rel_path.encode("utf-8"))
        h.update(b"\0")
        h.update(str(asset.size).encode("utf-8"))
        h.update(b"\0")
        h.update(str(asset.mtime_ns).encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def _uuid_for(kind: str, value: str) -> str:
    return str(uuid.uuid5(IMMERSA_NAMESPACE, f"{kind}:{value}"))


def generate_deck(
    assets: list[ImmersaAsset],
    *,
    deck_id: str,
    title: str,
) -> dict[str, object]:
    camera = {
        "position": [0, 5, -10],
        "rotation": [0.17453292519943295, 0, 0],
        "initial-position": [0, 5, -10],
        "initial-rotation": [0.17453292519943295, 0, 0],
        "locked?": True,
    }

    skybox = {"background": {"color": [87, 97, 166], "brightness": 0.1}}
    ground = {"enabled?": True}

    slides: list[dict[str, object]] = []

    for asset in assets:
        slide_id = _uuid_for("slide", asset.rel_path)
        model_id = _uuid_for("model", asset.rel_path)
        text_id = _uuid_for("title", asset.rel_path)

        slide_data: dict[str, object] = {
            "camera": camera,
            "skybox": skybox,
            "ground": ground,
            model_id: {
                "type": "glb",
                "asset-type": "model",
                "path": asset.url,
                "position": [0, 0.8, 0],
                "rotation": [0, 0, 0],
                "scale": [1, 1, 1],
                "initial-position": [0, 0.8, 0],
                "initial-rotation": [0, 0, 0],
                "initial-scale": [1, 1, 1],
            },
            text_id: {
                "type": "text3D",
                "text": asset.name,
                "position": [-4.5, 3.5, 0],
                "rotation": [0, 0, 0],
                "scale": [0.2, 0.2, 1],
                "initial-position": [-4.5, 3.5, 0],
                "initial-rotation": [0, 0, 0],
                "initial-scale": [0.2, 0.2, 1],
                "size": 1,
                "depth": 0.01,
                "color": [255, 255, 255],
                "roughness": 1,
                "metallic": 0,
                "emissive-intensity": 1,
                "face-to-screen?": True,
                "visibility": 1,
            },
        }

        slides.append({"id": slide_id, "data": slide_data})

    return {
        "id": deck_id,
        "title": title,
        "slides": slides,
        "thumbnails": {},
    }


def write_deck_json(
    repo_root: Path,
    *,
    deck_id: str,
    deck: dict[str, object],
    output: Path | None = None,
) -> Path:
    repo_root = repo_root.resolve()
    path = output or (repo_root / ".cyntra" / "immersa" / "presentations" / f"{deck_id}.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(deck, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    return path


def watch_deck(
    repo_root: Path,
    *,
    deck_id: str,
    title: str,
    poll_seconds: float = 2.0,
    include_outora: bool = True,
    include_runs: bool = True,
    limit: int | None = None,
    output: Path | None = None,
) -> None:
    last_sig: str | None = None
    while True:
        assets = scan_glb_assets(
            repo_root,
            include_outora=include_outora,
            include_runs=include_runs,
        )
        if limit is not None:
            assets = assets[:limit]
        sig = compute_assets_signature(assets)
        if sig != last_sig:
            deck = generate_deck(assets, deck_id=deck_id, title=title)
            out_path = write_deck_json(repo_root, deck_id=deck_id, deck=deck, output=output)
            print(f"[cyntra/immersa] wrote {out_path} ({len(assets)} assets)")
            last_sig = sig
        time.sleep(poll_seconds)
