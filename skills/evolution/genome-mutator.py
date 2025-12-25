#!/usr/bin/env python3
"""
Genome Mutator Skill

Apply structured deltas to prompt YAML, track lineage.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import random
import sys
from pathlib import Path
from typing import Any

repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root / "cyntra-kernel" / "src"))

import yaml

from cyntra.evolve.genome import genome_id_from_data, load_genome
from cyntra.evolve.mutation import mutate_genome as _mutate_genome


def execute(
    genome_path: str | Path,
    mutation_type: str,
    mutation_spec: dict[str, Any],
    output_path: str | Path,
) -> dict[str, Any]:
    """
    Mutate prompt genome.

    Args:
        genome_path: Path to parent genome YAML
        mutation_type: random, targeted, or patch
        mutation_spec: Mutation parameters or patch definition
        output_path: Path for mutated genome

    Returns:
        {
            "genome_id": str,
            "genome_path": str,
            "delta": {...},
            "lineage": [...]
        }
    """
    genome_path = Path(genome_path)
    output_path = Path(output_path)

    if not genome_path.exists():
        return {
            "success": False,
            "error": f"Genome not found: {genome_path}",
        }

    try:
        parent_genome = load_genome(genome_path)

        def ensure_mapping(value: object) -> dict[str, Any]:
            return dict(value) if isinstance(value, dict) else {}

        def default_seed(parent: dict[str, Any], spec: dict[str, Any]) -> int:
            explicit = spec.get("seed")
            if isinstance(explicit, int):
                return explicit
            canonical = yaml.safe_dump({"parent": parent, "spec": spec}, sort_keys=True)
            digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            return int(digest[:8], 16)

        def apply_dotpath_set(root: dict[str, Any], key: str, value: Any) -> None:
            parts = [p for p in str(key).split(".") if p]
            if not parts:
                return
            current: dict[str, Any] = root
            for part in parts[:-1]:
                next_value = current.get(part)
                if not isinstance(next_value, dict):
                    next_value = {}
                    current[part] = next_value
                current = next_value
            current[parts[-1]] = value

        def get_or_create_list(root: dict[str, Any], key: str) -> list[Any]:
            parts = [p for p in str(key).split(".") if p]
            if not parts:
                raise ValueError("Empty key")
            current: dict[str, Any] = root
            for part in parts[:-1]:
                next_value = current.get(part)
                if not isinstance(next_value, dict):
                    next_value = {}
                    current[part] = next_value
                current = next_value
            leaf = parts[-1]
            existing = current.get(leaf)
            if not isinstance(existing, list):
                existing = []
                current[leaf] = existing
            return existing

        def json_pointer_parts(pointer: str) -> list[str]:
            if not str(pointer).startswith("/"):
                return [p for p in str(pointer).split(".") if p]
            parts = str(pointer).lstrip("/").split("/") if pointer != "/" else []
            return [p.replace("~1", "/").replace("~0", "~") for p in parts if p]

        def apply_pointer_set(root: dict[str, Any], pointer: str, value: Any) -> None:
            parts = json_pointer_parts(pointer)
            if not parts:
                return
            current: Any = root
            for part in parts[:-1]:
                if isinstance(current, dict):
                    if part not in current or not isinstance(current.get(part), (dict, list)):
                        current[part] = {}
                    current = current[part]
                    continue
                if isinstance(current, list):
                    idx = int(part)
                    while len(current) <= idx:
                        current.append({})
                    current = current[idx]
                    continue
                raise TypeError(f"Cannot traverse into {type(current).__name__}")

            leaf = parts[-1]
            if isinstance(current, dict):
                current[leaf] = value
                return
            if isinstance(current, list):
                if leaf == "-":
                    current.append(value)
                    return
                idx = int(leaf)
                while len(current) <= idx:
                    current.append(None)
                current[idx] = value
                return
            raise TypeError(f"Cannot set on {type(current).__name__}")

        def apply_pointer_remove(root: dict[str, Any], pointer: str) -> None:
            parts = json_pointer_parts(pointer)
            if not parts:
                return
            current: Any = root
            for part in parts[:-1]:
                if isinstance(current, dict):
                    current = current.get(part)
                    continue
                if isinstance(current, list):
                    current = current[int(part)]
                    continue
                return

            leaf = parts[-1]
            if isinstance(current, dict):
                current.pop(leaf, None)
            elif isinstance(current, list) and leaf.isdigit():
                idx = int(leaf)
                if 0 <= idx < len(current):
                    current.pop(idx)

        def diff_parent_child(parent: dict[str, Any], child: dict[str, Any]) -> dict[str, Any]:
            changed: dict[str, Any] = {}
            for key in ("system_prompt", "instruction_blocks", "tool_use_rules"):
                if parent.get(key) != child.get(key):
                    changed[key] = {"from": parent.get(key), "to": child.get(key)}

            old_sampling = ensure_mapping(parent.get("sampling"))
            new_sampling = ensure_mapping(child.get("sampling"))
            for skey in sorted(set(old_sampling.keys()) | set(new_sampling.keys())):
                if old_sampling.get(skey) != new_sampling.get(skey):
                    changed[f"sampling.{skey}"] = {"from": old_sampling.get(skey), "to": new_sampling.get(skey)}
            return changed

        spec = ensure_mapping(mutation_spec)

        parent_id = str(parent_genome.get("genome_id") or "").strip() or None
        lineage: list[str] = []
        parent_lineage = parent_genome.get("lineage")
        if isinstance(parent_lineage, list):
            lineage.extend([str(x) for x in parent_lineage if isinstance(x, str)])
        if parent_id:
            lineage.append(parent_id)

        mutation_type_norm = str(mutation_type).strip().lower()
        if mutation_type_norm == "random":
            rng_seed = default_seed(parent_genome, spec)
            strength = spec.get("mutation_strength", 1.0)
            try:
                strength_f = float(strength)
            except (TypeError, ValueError):
                strength_f = 1.0
            mutated_genome = _mutate_genome(parent_genome, random.Random(rng_seed), mutation_strength=strength_f)
            delta = {
                "mutation_type": "random",
                "seed": rng_seed,
                "mutation_strength": strength_f,
                "changed": diff_parent_child(parent_genome, mutated_genome),
            }

        elif mutation_type_norm == "targeted":
            mutated_genome = deepcopy(parent_genome)
            mutated_genome["parent_id"] = parent_id

            set_map = spec.get("set")
            if not isinstance(set_map, dict):
                set_map = {k: v for k, v in spec.items() if k not in {"append", "remove", "seed"}}

            for key, value in set_map.items():
                apply_dotpath_set(mutated_genome, str(key), value)

            append_map = spec.get("append")
            if isinstance(append_map, dict):
                for key, value in append_map.items():
                    if not isinstance(value, list):
                        continue
                    target = get_or_create_list(mutated_genome, str(key))
                    target.extend(value)

            remove_map = spec.get("remove")
            if isinstance(remove_map, dict):
                for key, value in remove_map.items():
                    if not isinstance(value, list):
                        continue
                    target = get_or_create_list(mutated_genome, str(key))
                    filtered = [item for item in target if item not in value]
                    apply_dotpath_set(mutated_genome, str(key), filtered)

            mutated_genome["genome_id"] = genome_id_from_data(mutated_genome)
            delta = {"mutation_type": "targeted", "changed": diff_parent_child(parent_genome, mutated_genome)}

        elif mutation_type_norm == "patch":
            mutated_genome = deepcopy(parent_genome)
            mutated_genome["parent_id"] = parent_id

            ops = spec.get("ops", spec)
            if isinstance(ops, dict):
                ops = ops.get("ops")
            if not isinstance(ops, list):
                raise ValueError("patch mutation requires `mutation_spec.ops` (or a list spec)")

            touched: list[str] = []
            for op in ops:
                if not isinstance(op, dict):
                    continue
                operation = str(op.get("op") or "").strip().lower()
                path = str(op.get("path") or "").strip()
                if not operation or not path:
                    continue
                if operation in {"add", "replace"}:
                    apply_pointer_set(mutated_genome, path, op.get("value"))
                    touched.append(path)
                elif operation == "remove":
                    apply_pointer_remove(mutated_genome, path)
                    touched.append(path)

            mutated_genome["genome_id"] = genome_id_from_data(mutated_genome)
            delta = {
                "mutation_type": "patch",
                "touched": touched,
                "changed": diff_parent_child(parent_genome, mutated_genome),
            }

        else:
            raise ValueError(f"Unknown mutation_type: {mutation_type_norm}")

        genome_id = str(mutated_genome.get("genome_id") or genome_id_from_data(mutated_genome))
        mutated_genome["genome_id"] = genome_id

        out_path = output_path
        if out_path.exists() and out_path.is_dir():
            out_path = out_path / f"{genome_id}.yaml"
        elif out_path.suffix not in {".yaml", ".yml"}:
            out_path = out_path.with_suffix(".yaml")

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(yaml.safe_dump(mutated_genome, sort_keys=False), encoding="utf-8")

        return {
            "success": True,
            "genome_id": genome_id,
            "genome_path": str(out_path),
            "delta": delta,
            "lineage": lineage,
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Mutation failed: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse

    parser = argparse.ArgumentParser(description="Mutate prompt genome")
    parser.add_argument("genome_path", help="Path to parent genome YAML")
    parser.add_argument("mutation_type", choices=["random", "targeted", "patch"])
    parser.add_argument("mutation_spec", help="Mutation spec as JSON string")
    parser.add_argument("output_path", help="Output path for mutated genome")

    args = parser.parse_args()

    mutation_spec = json.loads(args.mutation_spec)

    result = execute(
        genome_path=args.genome_path,
        mutation_type=args.mutation_type,
        mutation_spec=mutation_spec,
        output_path=args.output_path,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
