#!/usr/bin/env python3
"""
Generate Agent Skills (.claude/skills/) from Cyntra skill YAMLs.

This script converts the Cyntra-specific YAML format to the standard
Agent Skills format (SKILL.md) for Claude Code and Codex discovery.

Usage:
    python skills/generate.py              # Generate all skills
    python skills/generate.py --clean      # Clean and regenerate
    python skills/generate.py --dry-run    # Show what would be generated
"""

from pathlib import Path
import yaml
import shutil
import argparse
import os

REPO_ROOT = Path(__file__).parent.parent
SKILLS_SOURCE = REPO_ROOT / "skills"
CLAUDE_SKILLS_OUT = REPO_ROOT / ".claude" / "skills"
CODEX_SKILLS_OUT = REPO_ROOT / ".codex" / "skills"

# Categories to process
CATEGORIES = ["development", "dynamics", "evolution", "fab", "search", "sleeptime"]


def load_yaml(path: Path) -> dict:
    """Load a YAML file."""
    with open(path) as f:
        return yaml.safe_load(f)


def generate_skill_md(spec: dict, yaml_path: Path) -> str:
    """Generate SKILL.md content from a Cyntra skill spec."""
    name = spec.get("name", "unnamed-skill")
    description = spec.get("description", "").strip()

    # Ensure description includes "when to use" guidance
    desc_lower = description.lower()
    if "use when" not in desc_lower and "use for" not in desc_lower:
        category = spec.get("category", "related")
        description += f"\n\nUse when working on {category} tasks."

    # Build the SKILL.md content
    lines = [
        "---",
        f"name: {name}",
        f"description: |",
    ]

    # Multi-line description in YAML
    for line in description.split("\n"):
        lines.append(f"  {line.strip()}")

    # Add optional metadata
    metadata = {}
    if "version" in spec:
        metadata["version"] = spec["version"]
    if "category" in spec:
        metadata["category"] = spec["category"]
    if "priority" in spec:
        metadata["priority"] = spec["priority"]

    if metadata:
        lines.append("metadata:")
        for k, v in metadata.items():
            lines.append(f"  {k}: \"{v}\"")

    lines.append("---")
    lines.append("")

    # Title
    title = name.replace("-", " ").title()
    lines.append(f"# {title}")
    lines.append("")

    # Description
    lines.append(description.split("\n")[0])  # First line as intro
    lines.append("")

    # Inputs section
    inputs = spec.get("inputs", [])
    if inputs:
        lines.append("## Inputs")
        lines.append("")
        lines.append("| Parameter | Type | Required | Default | Description |")
        lines.append("|-----------|------|----------|---------|-------------|")
        for inp in inputs:
            req = "Yes" if inp.get("required", False) else "No"
            default = inp.get("default", "-")
            if default is None:
                default = "-"
            elif isinstance(default, bool):
                default = str(default).lower()
            elif isinstance(default, list):
                default = f"`{default}`"
            desc = inp.get("description", "").replace("\n", " ").strip()
            lines.append(f"| `{inp['name']}` | {inp['type']} | {req} | {default} | {desc} |")
        lines.append("")

    # Outputs section
    outputs = spec.get("outputs", [])
    if outputs:
        lines.append("## Outputs")
        lines.append("")
        lines.append("| Field | Type | Description |")
        lines.append("|-------|------|-------------|")
        for out in outputs:
            desc = out.get("description", "").replace("\n", " ").strip()
            lines.append(f"| `{out['name']}` | {out['type']} | {desc} |")
        lines.append("")

    # Usage section
    impl = spec.get("implementation", {})
    if impl:
        script_name = impl.get("path", "main.py")
        lines.append("## Usage")
        lines.append("")
        lines.append("```bash")
        lines.append(f"python scripts/{script_name} [arguments]")
        lines.append("```")
        lines.append("")

    # Examples section
    examples = spec.get("examples", [])
    if examples:
        lines.append("## Examples")
        lines.append("")
        for ex in examples:
            if "description" in ex:
                lines.append(f"### {ex['description']}")
                lines.append("")
            if "inputs" in ex:
                lines.append("**Inputs:**")
                lines.append("```yaml")
                lines.append(yaml.dump(ex["inputs"], default_flow_style=False).strip())
                lines.append("```")
                lines.append("")
            if "outputs" in ex:
                lines.append("**Outputs:**")
                lines.append("```yaml")
                lines.append(yaml.dump(ex["outputs"], default_flow_style=False).strip())
                lines.append("```")
                lines.append("")

    # Link to source
    rel_yaml = yaml_path.relative_to(REPO_ROOT)
    lines.append("---")
    lines.append("")
    lines.append(f"*Generated from [`{rel_yaml}`](../../{rel_yaml})*")
    lines.append("")

    return "\n".join(lines)


def generate_skill(yaml_path: Path, output_root: Path, dry_run: bool = False) -> bool:
    """Generate a single skill from YAML to SKILL.md format."""
    try:
        spec = load_yaml(yaml_path)
    except Exception as e:
        print(f"  ERROR: Failed to parse {yaml_path}: {e}")
        return False

    if not spec:
        print(f"  SKIP: Empty file {yaml_path}")
        return False

    name = spec.get("name")
    if not name:
        print(f"  SKIP: No name in {yaml_path}")
        return False

    skill_dir = output_root / name
    skill_md_path = skill_dir / "SKILL.md"
    scripts_dir = skill_dir / "scripts"

    if dry_run:
        print(f"  Would create: {skill_dir}/")
        print(f"    - SKILL.md")
        impl = spec.get("implementation", {})
        if impl:
            py_name = impl.get("path", "main.py")
            print(f"    - scripts/{py_name} -> {yaml_path.parent / py_name}")
        return True

    # Create directories
    skill_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(exist_ok=True)

    # Generate SKILL.md
    skill_md_content = generate_skill_md(spec, yaml_path)
    skill_md_path.write_text(skill_md_content)

    # Symlink the Python implementation
    impl = spec.get("implementation", {})
    if impl:
        py_name = impl.get("path", "main.py")
        src_py = yaml_path.parent / py_name
        dst_py = scripts_dir / py_name

        # Remove existing symlink/file
        if dst_py.exists() or dst_py.is_symlink():
            dst_py.unlink()

        if src_py.exists():
            # Create relative symlink
            rel_path = os.path.relpath(src_py, scripts_dir)
            dst_py.symlink_to(rel_path)
        else:
            # Create placeholder
            dst_py.write_text(f"# TODO: Implement {name}\n# Source: {src_py}\n")

    return True


def clean_output(output_root: Path):
    """Remove generated skills directory."""
    if output_root.exists():
        shutil.rmtree(output_root)
        print(f"Cleaned: {output_root}")


def generate_all(dry_run: bool = False):
    """Generate all skills from YAML sources."""
    print(f"Source: {SKILLS_SOURCE}")
    print(f"Output: {CLAUDE_SKILLS_OUT}")
    print()

    # Ensure output directory exists
    if not dry_run:
        CLAUDE_SKILLS_OUT.mkdir(parents=True, exist_ok=True)

    total = 0
    success = 0

    for category in CATEGORIES:
        category_dir = SKILLS_SOURCE / category
        if not category_dir.exists():
            continue

        yaml_files = list(category_dir.glob("*.yaml"))
        if not yaml_files:
            continue

        print(f"[{category}]")
        for yaml_path in sorted(yaml_files):
            total += 1
            print(f"  {yaml_path.name}...", end=" ")
            if generate_skill(yaml_path, CLAUDE_SKILLS_OUT, dry_run):
                success += 1
                if not dry_run:
                    print("OK")
            else:
                print("FAILED")
        print()

    print(f"Generated {success}/{total} skills")

    # Create .codex symlink
    if not dry_run and success > 0:
        codex_parent = CODEX_SKILLS_OUT.parent
        codex_parent.mkdir(parents=True, exist_ok=True)

        if CODEX_SKILLS_OUT.exists() or CODEX_SKILLS_OUT.is_symlink():
            CODEX_SKILLS_OUT.unlink()

        rel_path = os.path.relpath(CLAUDE_SKILLS_OUT, codex_parent)
        CODEX_SKILLS_OUT.symlink_to(rel_path)
        print(f"\nCreated symlink: {CODEX_SKILLS_OUT} -> {rel_path}")

    # Create .gitignore if needed
    if not dry_run:
        gitignore = CLAUDE_SKILLS_OUT / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text("# Generated files - regenerate with: python skills/generate.py\n")


def main():
    parser = argparse.ArgumentParser(
        description="Generate Agent Skills from Cyntra YAML definitions"
    )
    parser.add_argument(
        "--clean", action="store_true",
        help="Clean output directory before generating"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be generated without writing files"
    )
    args = parser.parse_args()

    if args.clean and not args.dry_run:
        clean_output(CLAUDE_SKILLS_OUT)
        if CODEX_SKILLS_OUT.is_symlink():
            CODEX_SKILLS_OUT.unlink()
            print(f"Removed symlink: {CODEX_SKILLS_OUT}")
        print()

    generate_all(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
