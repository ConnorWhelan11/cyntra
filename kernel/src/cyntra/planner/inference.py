from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort

from cyntra.planner.action_space import NA, ActionSpace, ActionTuple, BudgetBin, valid_actions
from cyntra.planner.constants import SCHEMA_PLANNER_ACTION_V1
from cyntra.planner.dataset import hash_planner_input
from cyntra.planner.time_utils import utc_now_rfc3339
from cyntra.planner.tokenizer import tokenize_planner_input
from cyntra.planner.vocab import Vocab, encode_tokens


def _read_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError(f"Expected object JSON at {path}")
    return data


def _as_bins(items: Any) -> tuple[BudgetBin, ...]:
    if not isinstance(items, list):
        return (NA,)
    out: list[BudgetBin] = []
    for item in items:
        if item == NA:
            out.append(NA)
        elif isinstance(item, int):
            out.append(int(item))
        elif isinstance(item, str) and item.strip().upper() == "NA":
            out.append(NA)
    # Dedupe in order
    seen: set[BudgetBin] = set()
    deduped: list[BudgetBin] = []
    for b in out:
        if b in seen:
            continue
        seen.add(b)
        deduped.append(b)
    return tuple(deduped) if deduped else (NA,)


def _softmax(logits: np.ndarray, temperature: float) -> np.ndarray:
    t = max(1e-6, float(temperature))
    z = logits / t
    z = z - np.max(z, axis=-1, keepdims=True)
    exp = np.exp(z)
    return exp / np.sum(exp, axis=-1, keepdims=True)


@dataclass(frozen=True)
class BundleConfig:
    vocab: Vocab
    action_space: ActionSpace
    swarm_ids: tuple[str, ...]
    max_candidates_bins: tuple[BudgetBin, ...]
    max_minutes_bins: tuple[BudgetBin, ...]
    max_iterations_bins: tuple[BudgetBin, ...]
    temperatures: dict[str, float]
    seq_len: int


class OnnxPlanner:
    def __init__(self, bundle_dir: Path) -> None:
        bundle_dir = bundle_dir.resolve()
        vocab_data = _read_json(bundle_dir / "vocab.json")
        tokens = vocab_data.get("tokens")
        if not isinstance(tokens, list) or not all(isinstance(t, str) for t in tokens):
            raise ValueError("Invalid vocab.json tokens")
        vocab = Vocab.from_tokens([str(t) for t in tokens])

        action_data = _read_json(bundle_dir / "action_space.json")
        swarm_ids_raw = action_data.get("swarm_ids")
        if not isinstance(swarm_ids_raw, list) or not all(
            isinstance(s, str) for s in swarm_ids_raw
        ):
            raise ValueError("Invalid action_space.json swarm_ids")
        swarm_ids = tuple(str(s) for s in swarm_ids_raw if str(s))

        max_candidates_bins = _as_bins(action_data.get("max_candidates_bins"))
        max_minutes_bins = _as_bins(action_data.get("max_minutes_bins"))
        max_iterations_bins = _as_bins(action_data.get("max_iterations_bins"))

        action_space = ActionSpace(
            swarm_ids=swarm_ids,
            max_candidates_bins=max_candidates_bins,
            max_minutes_bins=max_minutes_bins,
            max_iterations_bins=max_iterations_bins,
        )

        calib_path = bundle_dir / "calibration.json"
        temperatures: dict[str, float] = {}
        if calib_path.exists():
            calib = _read_json(calib_path)
            temps = calib.get("temperatures")
            if isinstance(temps, dict):
                for k, v in temps.items():
                    if isinstance(k, str) and isinstance(v, (int, float)):
                        temperatures[k] = float(v)

        # Infer seq_len from ONNX model inputs when available; otherwise fall back.
        onnx_path = bundle_dir / "planner.onnx"
        sess = ort.InferenceSession(
            str(onnx_path),
            providers=["CPUExecutionProvider"],
        )
        input_ids_info = next((i for i in sess.get_inputs() if i.name == "input_ids"), None)
        seq_len = 512
        if (
            input_ids_info
            and isinstance(input_ids_info.shape, list)
            and len(input_ids_info.shape) == 2
        ):
            dim = input_ids_info.shape[1]
            if isinstance(dim, int) and dim > 0:
                seq_len = dim

        self.bundle_dir = bundle_dir
        self.session = sess
        self.cfg = BundleConfig(
            vocab=vocab,
            action_space=action_space,
            swarm_ids=swarm_ids,
            max_candidates_bins=max_candidates_bins,
            max_minutes_bins=max_minutes_bins,
            max_iterations_bins=max_iterations_bins,
            temperatures=temperatures,
            seq_len=seq_len,
        )

    def predict_action(self, planner_input: dict[str, Any]) -> dict[str, Any]:
        job_type = str(planner_input.get("job_type") or "code")

        swarm_probs, candidates_probs, minutes_probs, iterations_probs = self._predict_probs(
            planner_input
        )

        chosen = self._decode_valid_action(
            job_type=job_type,
            swarm_probs=swarm_probs,
            candidates_probs=candidates_probs,
            minutes_probs=minutes_probs,
            iterations_probs=iterations_probs,
        )

        input_hash = hash_planner_input(planner_input)
        confidence = chosen["confidence"]

        return {
            "schema_version": SCHEMA_PLANNER_ACTION_V1,
            "created_at": utc_now_rfc3339(),
            "swarm_id": chosen["swarm_id"],
            "budgets": {
                "max_candidates_bin": chosen["max_candidates_bin"],
                "max_minutes_bin": chosen["max_minutes_bin"],
                "max_iterations_bin": chosen["max_iterations_bin"],
            },
            "confidence": confidence,
            "abstain_to_default": False,
            "reason": None,
            "model": {"checkpoint_id": self.bundle_dir.name},
            "input_hash": input_hash,
        }

    def select_best_action(
        self,
        planner_input: dict[str, Any],
        candidates: list[ActionTuple],
    ) -> ActionTuple:
        """
        Select the best action among a provided candidate set.

        This uses the robust decoding score: `argmax_a Σ_h log p_h(a_h)` restricted
        to the candidate set.
        """
        if not candidates:
            raise ValueError("Candidate list is empty")

        job_type = str(planner_input.get("job_type") or "code")
        swarm_probs, candidates_probs, minutes_probs, iterations_probs = self._predict_probs(
            planner_input
        )
        valid_set = set(valid_actions(job_type, self.cfg.action_space))

        swarm_to_id = {s: i for i, s in enumerate(self.cfg.swarm_ids)}
        candidates_to_id = {b: i for i, b in enumerate(self.cfg.max_candidates_bins)}
        minutes_to_id = {b: i for i, b in enumerate(self.cfg.max_minutes_bins)}
        iterations_to_id = {b: i for i, b in enumerate(self.cfg.max_iterations_bins)}

        best_score = -math.inf
        best: ActionTuple | None = None

        for action in candidates:
            swarm_id, max_candidates, max_minutes, max_iterations = action
            if action not in valid_set:
                continue
            si = swarm_to_id.get(swarm_id)
            ci = candidates_to_id.get(max_candidates)
            mi = minutes_to_id.get(max_minutes)
            ii = iterations_to_id.get(max_iterations)
            if si is None or ci is None or mi is None or ii is None:
                continue

            score = (
                math.log(max(1e-12, float(swarm_probs[si])))
                + math.log(max(1e-12, float(candidates_probs[ci])))
                + math.log(max(1e-12, float(minutes_probs[mi])))
                + math.log(max(1e-12, float(iterations_probs[ii])))
            )
            if score > best_score:
                best_score = score
                best = action
            elif score == best_score and best is not None:
                if json.dumps(action, sort_keys=True) < json.dumps(best, sort_keys=True):
                    best = action

        if best is None:
            # Fallback: choose the planner's globally-decoded action.
            pred = self.predict_action(planner_input)
            budgets = pred.get("budgets") if isinstance(pred.get("budgets"), dict) else {}
            swarm_id = pred.get("swarm_id")
            if isinstance(swarm_id, str):
                return (
                    swarm_id,
                    budgets.get("max_candidates_bin"),
                    budgets.get("max_minutes_bin"),
                    budgets.get("max_iterations_bin"),
                )  # type: ignore[return-value]
            return candidates[0]

        return best

    def _predict_probs(
        self, planner_input: dict[str, Any]
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        tokens = tokenize_planner_input(planner_input)
        input_ids, attention_mask = encode_tokens(
            tokens, vocab=self.cfg.vocab, seq_len=self.cfg.seq_len
        )

        ort_inputs = {
            "input_ids": np.asarray([input_ids], dtype=np.int64),
            "attention_mask": np.asarray([attention_mask], dtype=np.int64),
        }
        outputs = self.session.run(None, ort_inputs)
        if len(outputs) != 4:
            raise RuntimeError("Unexpected ONNX outputs; expected 4 heads")

        swarm_logits = np.asarray(outputs[0])[0]
        candidates_logits = np.asarray(outputs[1])[0]
        minutes_logits = np.asarray(outputs[2])[0]
        iterations_logits = np.asarray(outputs[3])[0]

        temps = self.cfg.temperatures
        swarm_probs = _softmax(swarm_logits, temps.get("swarm_id", 1.0))
        candidates_probs = _softmax(candidates_logits, temps.get("max_candidates_bin", 1.0))
        minutes_probs = _softmax(minutes_logits, temps.get("max_minutes_bin", 1.0))
        iterations_probs = _softmax(iterations_logits, temps.get("max_iterations_bin", 1.0))
        return swarm_probs, candidates_probs, minutes_probs, iterations_probs

    def _decode_valid_action(
        self,
        *,
        job_type: str,
        swarm_probs: np.ndarray,
        candidates_probs: np.ndarray,
        minutes_probs: np.ndarray,
        iterations_probs: np.ndarray,
    ) -> dict[str, Any]:
        swarm_to_id = {s: i for i, s in enumerate(self.cfg.swarm_ids)}
        candidates_to_id = {b: i for i, b in enumerate(self.cfg.max_candidates_bins)}
        minutes_to_id = {b: i for i, b in enumerate(self.cfg.max_minutes_bins)}
        iterations_to_id = {b: i for i, b in enumerate(self.cfg.max_iterations_bins)}

        best_score = -math.inf
        best: tuple[str, BudgetBin, BudgetBin, BudgetBin] | None = None

        for swarm_id, max_candidates, max_minutes, max_iterations in valid_actions(
            job_type, self.cfg.action_space
        ):
            si = swarm_to_id.get(swarm_id)
            ci = candidates_to_id.get(max_candidates)
            mi = minutes_to_id.get(max_minutes)
            ii = iterations_to_id.get(max_iterations)
            if si is None or ci is None or mi is None or ii is None:
                continue

            score = (
                math.log(max(1e-12, float(swarm_probs[si])))
                + math.log(max(1e-12, float(candidates_probs[ci])))
                + math.log(max(1e-12, float(minutes_probs[mi])))
                + math.log(max(1e-12, float(iterations_probs[ii])))
            )
            if score > best_score:
                best_score = score
                best = (swarm_id, max_candidates, max_minutes, max_iterations)
            elif score == best_score and best is not None:
                if json.dumps(
                    (swarm_id, max_candidates, max_minutes, max_iterations), sort_keys=True
                ) < json.dumps(best, sort_keys=True):
                    best = (swarm_id, max_candidates, max_minutes, max_iterations)

        if best is None:
            # Fallback to per-head argmax without validity guarantees.
            swarm_idx = int(np.argmax(swarm_probs))
            candidates_idx = int(np.argmax(candidates_probs))
            minutes_idx = int(np.argmax(minutes_probs))
            iterations_idx = int(np.argmax(iterations_probs))
            best = (
                self.cfg.swarm_ids[min(swarm_idx, len(self.cfg.swarm_ids) - 1)],
                self.cfg.max_candidates_bins[
                    min(candidates_idx, len(self.cfg.max_candidates_bins) - 1)
                ],
                self.cfg.max_minutes_bins[min(minutes_idx, len(self.cfg.max_minutes_bins) - 1)],
                self.cfg.max_iterations_bins[
                    min(iterations_idx, len(self.cfg.max_iterations_bins) - 1)
                ],
            )

        swarm_id, max_candidates, max_minutes, max_iterations = best
        si = swarm_to_id.get(swarm_id, 0)
        ci = candidates_to_id.get(max_candidates, 0)
        mi = minutes_to_id.get(max_minutes, 0)
        ii = iterations_to_id.get(max_iterations, 0)

        confidence = float(
            min(
                float(swarm_probs[si]),
                float(candidates_probs[ci]),
                float(minutes_probs[mi]),
                float(iterations_probs[ii]),
            )
        )

        return {
            "swarm_id": swarm_id,
            "max_candidates_bin": max_candidates,
            "max_minutes_bin": max_minutes,
            "max_iterations_bin": max_iterations,
            "confidence": confidence,
        }
