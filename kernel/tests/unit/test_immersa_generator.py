from __future__ import annotations

import json
import uuid
from pathlib import Path

from cyntra.immersa.generator import (
    IMMERSA_NAMESPACE,
    ImmersaAsset,
    generate_deck,
    scan_glb_assets,
    write_deck_json,
)


def test_scan_glb_assets_finds_outora_and_run_artifacts(tmp_path: Path) -> None:
    outora_dir = tmp_path / "fab" / "assets"
    outora_dir.mkdir(parents=True)
    (outora_dir / "car.glb").write_bytes(b"glb")

    artifacts_dir = tmp_path / ".cyntra" / "runs" / "run_1" / "artifacts"
    artifacts_dir.mkdir(parents=True)
    (artifacts_dir / "artifact.glb").write_bytes(b"glb2")

    ignored_dir = tmp_path / ".cyntra" / "runs" / "run_1" / "other"
    ignored_dir.mkdir(parents=True)
    (ignored_dir / "ignored.glb").write_bytes(b"nope")

    assets = scan_glb_assets(tmp_path)
    rel_paths = {a.rel_path for a in assets}

    assert "fab/assets/car.glb" in rel_paths
    assert ".cyntra/runs/run_1/artifacts/artifact.glb" in rel_paths
    assert ".cyntra/runs/run_1/other/ignored.glb" not in rel_paths

    outora_asset = next(a for a in assets if a.rel_path == "fab/assets/car.glb")
    assert outora_asset.url == "/artifacts/fab/assets/car.glb"


def test_generate_deck_uses_stable_ids_and_expected_shape() -> None:
    rel_path = "fab/assets/car.glb"
    asset = ImmersaAsset(
        name="car.glb",
        rel_path=rel_path,
        url=f"/artifacts/{rel_path}",
        size=3,
        mtime_ns=0,
    )

    deck = generate_deck([asset], deck_id="deck_1", title="My Deck")
    assert deck["id"] == "deck_1"
    assert deck["title"] == "My Deck"
    assert deck["thumbnails"] == {}

    slides = deck["slides"]
    assert isinstance(slides, list)
    assert len(slides) == 1

    expected_slide_id = str(uuid.uuid5(IMMERSA_NAMESPACE, f"slide:{rel_path}"))
    expected_model_id = str(uuid.uuid5(IMMERSA_NAMESPACE, f"model:{rel_path}"))
    expected_title_id = str(uuid.uuid5(IMMERSA_NAMESPACE, f"title:{rel_path}"))

    slide = slides[0]
    assert slide["id"] == expected_slide_id

    data = slide["data"]
    assert "camera" in data
    assert "skybox" in data
    assert "ground" in data

    assert expected_model_id in data
    model = data[expected_model_id]
    assert model["type"] == "glb"
    assert model["asset-type"] == "model"
    assert model["path"] == f"/artifacts/{rel_path}"

    assert expected_title_id in data
    title = data[expected_title_id]
    assert title["type"] == "text3D"
    assert title["text"] == "car.glb"


def test_write_deck_json_defaults_to_cyntra_presentations_dir(tmp_path: Path) -> None:
    deck = generate_deck([], deck_id="latest", title="Latest")
    out_path = write_deck_json(tmp_path, deck_id="latest", deck=deck)

    assert out_path == tmp_path / ".cyntra" / "immersa" / "presentations" / "latest.json"
    loaded = json.loads(out_path.read_text())
    assert loaded["id"] == "latest"
    assert loaded["title"] == "Latest"
