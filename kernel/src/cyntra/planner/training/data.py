from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cyntra.planner.action_space import NA, ActionSpace, BudgetBin, action_space_for_swarms
from cyntra.planner.tokenizer import tokenize_planner_input
from cyntra.planner.vocab import Vocab, build_vocab_from_token_streams, encode_tokens


@dataclass(frozen=True)
class HeadVocab:
    swarm_ids: tuple[str, ...]
    max_candidates_bins: tuple[BudgetBin, ...]
    max_minutes_bins: tuple[BudgetBin, ...]
    max_iterations_bins: tuple[BudgetBin, ...]

    @classmethod
    def from_action_space_dict(cls, data: dict[str, Any]) -> HeadVocab:
        swarm_ids_raw = data.get("swarm_ids")
        swarm_ids = (
            tuple(str(s) for s in swarm_ids_raw if isinstance(s, str) and s)
            if isinstance(swarm_ids_raw, list)
            else ()
        )

        def _bins(key: str) -> tuple[BudgetBin, ...]:
            raw = data.get(key)
            if not isinstance(raw, list):
                return (NA,)
            bins: list[BudgetBin] = []
            for item in raw:
                if item == NA:
                    bins.append(NA)
                elif isinstance(item, int):
                    bins.append(int(item))
                elif isinstance(item, str) and item.strip().upper() == "NA":
                    bins.append(NA)
            # Dedupe in order
            out: list[BudgetBin] = []
            seen: set[BudgetBin] = set()
            for b in bins:
                if b in seen:
                    continue
                seen.add(b)
                out.append(b)
            return tuple(out) if out else (NA,)

        return cls(
            swarm_ids=swarm_ids,
            max_candidates_bins=_bins("max_candidates_bins"),
            max_minutes_bins=_bins("max_minutes_bins"),
            max_iterations_bins=_bins("max_iterations_bins"),
        )

    def to_action_space(self) -> ActionSpace:
        if self.swarm_ids:
            return action_space_for_swarms(self.swarm_ids)
        return action_space_for_swarms(["serial_handoff", "speculate_vote"])


@dataclass(frozen=True)
class EncodedExample:
    split: str
    job_type: str
    input_ids: list[int]
    attention_mask: list[int]
    label_swarm: int
    label_max_candidates: int
    label_max_minutes: int
    label_max_iterations: int


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            rows.append(item)
    return rows


def load_dataset(path: Path) -> list[dict[str, Any]]:
    return _read_jsonl(path)


def dataset_action_space(rows: list[dict[str, Any]]) -> HeadVocab:
    for row in rows:
        planner_input = row.get("planner_input")
        if not isinstance(planner_input, dict):
            continue
        action_space = planner_input.get("action_space")
        if isinstance(action_space, dict):
            hv = HeadVocab.from_action_space_dict(action_space)
            if hv.swarm_ids:
                return hv
    # Fall back to v1 defaults.
    return HeadVocab(
        swarm_ids=("serial_handoff", "speculate_vote"),
        max_candidates_bins=(1, 2, 3, NA),
        max_minutes_bins=(15, 30, 45, 60, 120, NA),
        max_iterations_bins=(1, 2, 3, 5, NA),
    )


def build_vocab(rows: list[dict[str, Any]]) -> Vocab:
    streams: list[list[str]] = []
    for row in rows:
        tokens = row.get("tokens")
        if isinstance(tokens, list) and all(isinstance(t, str) for t in tokens):
            streams.append([str(t) for t in tokens])
            continue
        planner_input = row.get("planner_input")
        if isinstance(planner_input, dict):
            streams.append(tokenize_planner_input(planner_input))
    return build_vocab_from_token_streams(streams)


def encode_dataset(
    rows: list[dict[str, Any]],
    *,
    vocab: Vocab,
    head_vocab: HeadVocab,
    seq_len: int,
) -> list[EncodedExample]:
    swarm_to_id = {s: i for i, s in enumerate(head_vocab.swarm_ids)}
    candidates_to_id = {b: i for i, b in enumerate(head_vocab.max_candidates_bins)}
    minutes_to_id = {b: i for i, b in enumerate(head_vocab.max_minutes_bins)}
    iterations_to_id = {b: i for i, b in enumerate(head_vocab.max_iterations_bins)}

    encoded: list[EncodedExample] = []
    for row in rows:
        split = str(row.get("split") or "train")
        planner_input = row.get("planner_input")
        if not isinstance(planner_input, dict):
            continue
        job_type = str(planner_input.get("job_type") or "code")

        tokens = row.get("tokens")
        if isinstance(tokens, list) and all(isinstance(t, str) for t in tokens):
            toks = [str(t) for t in tokens]
        else:
            toks = tokenize_planner_input(planner_input)

        input_ids, attention_mask = encode_tokens(toks, vocab=vocab, seq_len=seq_len)

        label_action = row.get("label_action")
        if not isinstance(label_action, dict):
            continue
        swarm_id = label_action.get("swarm_id")
        if not isinstance(swarm_id, str) or swarm_id not in swarm_to_id:
            continue

        budgets = label_action.get("budgets")
        budgets = budgets if isinstance(budgets, dict) else {}

        def _as_bin(value: Any) -> BudgetBin:
            if value == NA:
                return NA
            if isinstance(value, int):
                return int(value)
            if isinstance(value, str) and value.strip().upper() == "NA":
                return NA
            return NA

        max_candidates = _as_bin(budgets.get("max_candidates_bin"))
        max_minutes = _as_bin(budgets.get("max_minutes_bin"))
        max_iterations = _as_bin(budgets.get("max_iterations_bin"))

        if max_candidates not in candidates_to_id:
            continue
        if max_minutes not in minutes_to_id:
            continue
        if max_iterations not in iterations_to_id:
            continue

        encoded.append(
            EncodedExample(
                split=split,
                job_type=job_type,
                input_ids=input_ids,
                attention_mask=attention_mask,
                label_swarm=swarm_to_id[swarm_id],
                label_max_candidates=candidates_to_id[max_candidates],
                label_max_minutes=minutes_to_id[max_minutes],
                label_max_iterations=iterations_to_id[max_iterations],
            )
        )

    return encoded


def iter_splits(examples: list[EncodedExample], split: str) -> Iterable[EncodedExample]:
    for ex in examples:
        if ex.split == split:
            yield ex
