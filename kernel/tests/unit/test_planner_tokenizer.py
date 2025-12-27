from __future__ import annotations

from cyntra.planner.tokenizer import BOS, EOS, SEP, tag_hash_token, tokenize_planner_input
from cyntra.planner.vocab import build_vocab_from_token_streams


def test_tokenizer_is_deterministic_and_order_invariant_for_tags() -> None:
    base = {
        "schema_version": "cyntra.planner_input.v1",
        "created_at": "2025-12-20T00:00:00Z",
        "universe_id": "medica",
        "job_type": "code",
        "universe_defaults": {"swarm_id": "speculate_vote", "objective_id": "realism_perf_v1"},
        "issue": {
            "issue_id": "1",
            "dk_priority": "P1",
            "dk_risk": "high",
            "dk_size": "M",
            "dk_tool_hint": "codex",
            "dk_attempts": 2,
            "tags": ["b", "a"],
            "keywords": ["walkable", "library"],
        },
        "history": {"last_n_similar_runs": []},
        "action_space": {
            "swarm_ids": ["serial_handoff", "speculate_vote"],
            "max_minutes_bins": [15, 30, "NA"],
            "max_candidates_bins": [1, 2, 3, "NA"],
            "max_iterations_bins": ["NA"],
            "validity_rules": [{"description": "stub"}],
        },
        "system_state": None,
    }

    t1 = tokenize_planner_input(base)
    assert t1[0] == BOS
    assert t1[-1] == EOS
    assert SEP in t1
    assert tag_hash_token("a") in t1
    assert tag_hash_token("b") in t1

    swapped = dict(base)
    swapped["issue"] = dict(base["issue"])
    swapped["issue"]["tags"] = ["a", "b"]
    t2 = tokenize_planner_input(swapped)
    assert t1 == t2


def test_vocab_includes_fixed_hash_buckets() -> None:
    vocab = build_vocab_from_token_streams([[BOS, "X", EOS]])
    assert vocab.token_to_id.get("[TAG_HASH_0]") is not None
    assert vocab.token_to_id.get("[KW_HASH_0]") is not None
    assert vocab.token_to_id.get("[FAIL_HASH_0]") is not None
    assert vocab.token_to_id.get("[GATE_HASH_0]") is not None
