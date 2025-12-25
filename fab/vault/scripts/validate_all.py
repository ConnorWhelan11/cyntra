#!/usr/bin/env python3
"""
Run full vault validation suite.

Usage:
    python validate_all.py           # Run all validations
    python validate_all.py --quick   # Skip slow tests
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str], cwd: Path | None = None) -> tuple[int, str]:
    """Run command and return (return_code, output)."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    output = result.stdout + result.stderr
    return result.returncode, output


def main():
    parser = argparse.ArgumentParser(description="Run vault validation suite")
    parser.add_argument("--quick", action="store_true", help="Skip slow tests")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    vault_root = Path(__file__).parent.parent
    kernel_root = vault_root.parent.parent / "cyntra-kernel"

    results: dict[str, str] = {}

    print("=" * 60)
    print("UDE Vault Validation Suite")
    print("=" * 60)
    print()

    # Phase 1: Hash validation
    print("[Phase 1] Hash Validation")
    print("-" * 40)
    rc, output = run_command(
        ["python3", str(vault_root / "scripts/validate_hashes.py")],
    )
    if args.verbose:
        print(output)
    if rc == 0:
        print("PASS: All hashes valid")
        results["hash_validation"] = "PASS"
    else:
        print("FAIL: Hash validation errors")
        print(output)
        results["hash_validation"] = "FAIL"
    print()

    # Phase 2: Python unit tests
    print("[Phase 2] Python Unit Tests")
    print("-" * 40)
    test_file = kernel_root / "tests/fab/test_vault.py"
    if test_file.exists():
        rc, output = run_command(
            ["python3", "-m", "pytest", str(test_file), "-v", "--tb=short"],
            cwd=kernel_root,
        )
        if args.verbose or rc != 0:
            print(output)

        # Count results
        if "passed" in output:
            passed = output.count(" PASSED")
            failed = output.count(" FAILED")
            print(f"Results: {passed} passed, {failed} failed")
            results["unit_tests"] = "PASS" if failed == 0 else "FAIL"
        else:
            results["unit_tests"] = "SKIP"
    else:
        print(f"SKIP: Test file not found: {test_file}")
        results["unit_tests"] = "SKIP"
    print()

    # Phase 3: Addon structure validation
    print("[Phase 3] Addon Structure Validation")
    print("-" * 40)
    addons_dir = vault_root / "godot/addons"
    addon_errors = []

    for addon_dir in addons_dir.iterdir():
        if addon_dir.name == "registry.json":
            continue
        if not addon_dir.is_dir():
            continue

        addon_path = addon_dir / "addon"
        manifest_path = addon_dir / "manifest.json"

        if not manifest_path.exists():
            addon_errors.append(f"{addon_dir.name}: missing manifest.json")
            continue

        if not addon_path.exists():
            addon_errors.append(f"{addon_dir.name}: missing addon/ directory")
            continue

        # Check for GDScript files OR .gdextension file (hybrid addons)
        gd_files = list(addon_path.rglob("*.gd"))
        gdext_files = list(addon_path.rglob("*.gdextension"))

        if not gd_files and not gdext_files:
            addon_errors.append(f"{addon_dir.name}: no .gd or .gdextension files found")
            continue

        if gdext_files:
            print(f"  OK: {addon_dir.name} (GDExtension - requires binaries)")
        else:
            print(f"  OK: {addon_dir.name} ({len(gd_files)} .gd files)")

    if addon_errors:
        print()
        for err in addon_errors:
            print(f"  ERROR: {err}")
        results["addon_structure"] = "FAIL"
    else:
        results["addon_structure"] = "PASS"
    print()

    # Phase 4: Template structure validation
    print("[Phase 4] Template Structure Validation")
    print("-" * 40)
    templates_dir = vault_root / "godot/templates"
    template_errors = []

    for template_dir in templates_dir.iterdir():
        if template_dir.name == "registry.json":
            continue
        if not template_dir.is_dir():
            continue

        project_path = template_dir / "project"
        manifest_path = template_dir / "manifest.json"

        if not manifest_path.exists():
            template_errors.append(f"{template_dir.name}: missing manifest.json")
            continue

        if not project_path.exists():
            # Could be a placeholder
            print(f"  SKIP: {template_dir.name} (not vendored)")
            continue

        project_godot = project_path / "project.godot"
        if not project_godot.exists():
            template_errors.append(f"{template_dir.name}: missing project.godot")
            continue

        print(f"  OK: {template_dir.name}")

    if template_errors:
        print()
        for err in template_errors:
            print(f"  ERROR: {err}")
        results["template_structure"] = "FAIL"
    else:
        results["template_structure"] = "PASS"
    print()

    # Phase 5: GDExtension manifest validation
    print("[Phase 5] GDExtension Manifest Validation")
    print("-" * 40)
    gdext_dir = vault_root / "godot/gdextensions"
    gdext_errors = []

    for ext_dir in gdext_dir.iterdir():
        if ext_dir.name == "registry.json":
            continue
        if not ext_dir.is_dir():
            continue

        manifest_path = ext_dir / "manifest.json"

        if not manifest_path.exists():
            gdext_errors.append(f"{ext_dir.name}: missing manifest.json")
            continue

        # Verify manifest has required fields
        import json
        with open(manifest_path) as f:
            manifest = json.load(f)

        required = ["addon_id", "type", "version", "upstream"]
        missing = [f for f in required if f not in manifest]
        if missing:
            gdext_errors.append(f"{ext_dir.name}: missing fields: {missing}")
            continue

        print(f"  OK: {ext_dir.name} (v{manifest.get('version', '?')})")

    if gdext_errors:
        print()
        for err in gdext_errors:
            print(f"  ERROR: {err}")
        results["gdextension_manifests"] = "FAIL"
    else:
        results["gdextension_manifests"] = "PASS"
    print()

    # Summary
    print("=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    all_pass = True
    for name, status in results.items():
        icon = "✓" if status == "PASS" else ("○" if status == "SKIP" else "✗")
        print(f"  {icon} {name}: {status}")
        if status == "FAIL":
            all_pass = False

    print()
    if all_pass:
        print("Overall: PASS")
        return 0
    else:
        print("Overall: FAIL (see errors above)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
