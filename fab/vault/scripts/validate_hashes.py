#!/usr/bin/env python3
"""
Validate SHA256 hashes of vault entries.

Usage:
    python validate_hashes.py              # Check all entries
    python validate_hashes.py --update     # Update hashes in catalog
    python validate_hashes.py gdunit4      # Check specific addon
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

import yaml


def compute_dir_hash(dir_path: Path) -> str:
    """Compute SHA256 hash of directory contents."""
    hasher = hashlib.sha256()
    for file_path in sorted(dir_path.rglob("*")):
        if file_path.is_file():
            rel_path = file_path.relative_to(dir_path)
            hasher.update(str(rel_path).encode())
            hasher.update(file_path.read_bytes())
    return hasher.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Validate vault entry hashes")
    parser.add_argument("addon_id", nargs="?", help="Specific addon to check")
    parser.add_argument("--update", action="store_true", help="Update hashes in catalog")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    vault_root = Path(__file__).parent.parent
    catalog_path = vault_root / "catalog.yaml"

    with open(catalog_path) as f:
        catalog = yaml.safe_load(f)

    errors: list[str] = []
    updates: dict[str, str] = {}

    print("UDE Vault Hash Validation")
    print("=" * 60)
    print()

    # Validate addons
    print("Addons:")
    for addon in catalog.get("addons", []):
        addon_id = addon["id"]

        if args.addon_id and addon_id != args.addon_id:
            continue

        expected = addon.get("sha256")
        addon_path = vault_root / "godot/addons" / addon_id / "addon"

        if not addon_path.exists():
            print(f"  MISS: {addon_id} (not cached)")
            continue

        actual = compute_dir_hash(addon_path)

        if expected is None:
            print(f"  NEW:  {addon_id}")
            if args.verbose:
                print(f"        hash: {actual}")
            updates[addon_id] = actual
        elif actual == expected:
            print(f"  OK:   {addon_id}")
        else:
            print(f"  FAIL: {addon_id}")
            print(f"        expected: {expected}")
            print(f"        actual:   {actual}")
            errors.append(addon_id)
            updates[addon_id] = actual

    print()

    # Validate templates
    print("Templates:")
    for template in catalog.get("templates", []):
        template_id = template["id"]
        expected = template.get("sha256")
        template_path = vault_root / "godot/templates" / template_id / "project"

        if not template_path.exists():
            print(f"  MISS: {template_id} (not cached)")
            continue

        actual = compute_dir_hash(template_path)

        if expected is None:
            print(f"  NEW:  {template_id}")
            if args.verbose:
                print(f"        hash: {actual}")
            updates[f"template:{template_id}"] = actual
        elif actual == expected:
            print(f"  OK:   {template_id}")
        else:
            print(f"  FAIL: {template_id}")
            print(f"        expected: {expected}")
            print(f"        actual:   {actual}")
            errors.append(template_id)
            updates[f"template:{template_id}"] = actual

    print()

    if args.update and updates:
        print("Updating catalog.yaml with new hashes...")

        # Update addon hashes
        for addon in catalog.get("addons", []):
            addon_id = addon["id"]
            if addon_id in updates:
                addon["sha256"] = updates[addon_id]

        # Update template hashes
        for template in catalog.get("templates", []):
            template_id = template["id"]
            key = f"template:{template_id}"
            if key in updates:
                template["sha256"] = updates[key]

        catalog["updated_at"] = datetime.utcnow().isoformat() + "Z"

        with open(catalog_path, "w") as f:
            yaml.dump(catalog, f, default_flow_style=False, sort_keys=False)

        print(f"Updated {len(updates)} entries")

        # Also update individual manifest files
        for addon in catalog.get("addons", []):
            addon_id = addon["id"]
            if addon_id in updates:
                manifest_path = vault_root / "godot/addons" / addon_id / "manifest.json"
                if manifest_path.exists():
                    with open(manifest_path) as f:
                        manifest = json.load(f)
                    manifest["checksums"]["sha256"] = updates[addon_id]
                    manifest["checksums"]["verified_at"] = datetime.utcnow().isoformat() + "Z"
                    with open(manifest_path, "w") as f:
                        json.dump(manifest, f, indent=2)
                        f.write("\n")

        for template in catalog.get("templates", []):
            template_id = template["id"]
            key = f"template:{template_id}"
            if key in updates:
                manifest_path = vault_root / "godot/templates" / template_id / "manifest.json"
                if manifest_path.exists():
                    with open(manifest_path) as f:
                        manifest = json.load(f)
                    manifest["checksums"]["sha256"] = updates[key]
                    manifest["checksums"]["verified_at"] = datetime.utcnow().isoformat() + "Z"
                    with open(manifest_path, "w") as f:
                        json.dump(manifest, f, indent=2)
                        f.write("\n")

        print("Updated manifest files")
        print()

    # Summary
    print("=" * 60)
    if errors:
        print(f"FAILED: {len(errors)} hash mismatches detected")
        for e in errors:
            print(f"  - {e}")
        return 1
    elif updates and not args.update:
        print(f"INFO: {len(updates)} entries have no hash (run with --update to set)")
        return 0
    else:
        print("OK: All hashes valid")
        return 0


if __name__ == "__main__":
    sys.exit(main())
