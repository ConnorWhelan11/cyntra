from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from cyntra.planner.tokenizer import PAD, UNK, iter_fixed_tokens


@dataclass(frozen=True)
class Vocab:
    tokens: tuple[str, ...]
    token_to_id: dict[str, int]
    pad_id: int
    unk_id: int

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": "cyntra.vocab.v1",
            "tokens": list(self.tokens),
            "pad_id": self.pad_id,
            "unk_id": self.unk_id,
        }

    @classmethod
    def from_tokens(cls, tokens: list[str]) -> Vocab:
        token_to_id = {t: i for i, t in enumerate(tokens)}
        pad_id = token_to_id.get(PAD, 0)
        unk_id = token_to_id.get(UNK, 1)
        return cls(tokens=tuple(tokens), token_to_id=token_to_id, pad_id=pad_id, unk_id=unk_id)


def build_vocab_from_token_streams(
    streams: Iterable[Iterable[str]],
    *,
    extra_tokens: Iterable[str] = (),
) -> Vocab:
    """
    Build a deterministic vocabulary.

    Ordering:
    1) Fixed tokens (special + hash buckets + run indices)
    2) `extra_tokens` (deduped, stable order)
    3) Observed tokens from `streams` (deduped, sorted lexicographically)
    """
    fixed = list(iter_fixed_tokens())

    seen: set[str] = set(fixed)
    out: list[str] = list(fixed)

    for tok in extra_tokens:
        if not tok or tok in seen:
            continue
        seen.add(tok)
        out.append(tok)

    observed: set[str] = set()
    for stream in streams:
        for tok in stream:
            if not tok or tok in seen:
                continue
            observed.add(tok)

    for tok in sorted(observed):
        if tok in seen:
            continue
        seen.add(tok)
        out.append(tok)

    return Vocab.from_tokens(out)


def encode_tokens(
    tokens: list[str],
    *,
    vocab: Vocab,
    seq_len: int,
) -> tuple[list[int], list[int]]:
    """
    Encode tokens into (input_ids, attention_mask) for fixed-length models.

    - `attention_mask[i]` is 1 for real tokens, 0 for padding.
    """
    if seq_len <= 0:
        raise ValueError("seq_len must be > 0")

    ids: list[int] = []
    mask: list[int] = []
    for tok in tokens[:seq_len]:
        ids.append(vocab.token_to_id.get(tok, vocab.unk_id))
        mask.append(1)

    while len(ids) < seq_len:
        ids.append(vocab.pad_id)
        mask.append(0)

    return ids, mask
