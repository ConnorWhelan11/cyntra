#!/usr/bin/env python3
"""
Download HDRIs from Poly Haven for lookdev rendering.

Usage:
    python download_hdris.py [--resolution 2k|4k]

Downloads all HDRIs defined in manifest.json to this directory.
Updates SHA256 hashes in manifest for deterministic builds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path


def download_hdri(
    name: str, source_name: str, resolution: str, output_path: Path
) -> str | None:
    """Download an HDRI from Poly Haven and return its SHA256."""

    # Poly Haven API format
    url = f"https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/{resolution}/{source_name}_{resolution}.hdr"

    print(f"Downloading {name} from Poly Haven...")
    print(f"  URL: {url}")

    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()

        output_path.write_bytes(data)

        # Calculate SHA256
        sha256 = hashlib.sha256(data).hexdigest()

        size_mb = len(data) / (1024 * 1024)
        print(f"  Saved: {output_path.name} ({size_mb:.1f} MB)")
        print(f"  SHA256: {sha256[:16]}...")

        return sha256

    except Exception as e:
        print(f"  ERROR: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Download HDRIs from Poly Haven")
    parser.add_argument(
        "--resolution",
        choices=["1k", "2k", "4k"],
        default="2k",
        help="HDRI resolution (default: 2k)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if files exist",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    manifest_path = script_dir / "manifest.json"

    if not manifest_path.exists():
        print(f"ERROR: manifest.json not found at {manifest_path}")
        return 1

    with open(manifest_path) as f:
        manifest = json.load(f)

    hdris = manifest.get("hdris", {})
    updated = False

    for name, config in hdris.items():
        filename = config["filename"]
        output_path = script_dir / filename

        if output_path.exists() and not args.force:
            print(f"Skipping {name} (already exists)")
            continue

        sha256 = download_hdri(
            name=name,
            source_name=config["source_name"],
            resolution=args.resolution,
            output_path=output_path,
        )

        if sha256:
            config["sha256"] = sha256
            config["resolution"] = args.resolution
            updated = True

    if updated:
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"\nUpdated {manifest_path.name} with SHA256 hashes")

    print("\nDone!")
    return 0


if __name__ == "__main__":
    exit(main())
