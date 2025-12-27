from __future__ import annotations

import re
from collections import Counter

_WORD_RE = re.compile(r"[A-Za-z0-9_]{3,}")

_STOPWORDS: set[str] = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "over",
    "under",
    "then",
    "than",
    "this",
    "that",
    "these",
    "those",
    "your",
    "you",
    "our",
    "are",
    "was",
    "were",
    "has",
    "have",
    "had",
    "not",
    "but",
    "can",
    "may",
    "must",
    "should",
    "will",
    "would",
    "fix",
    "add",
    "update",
    "create",
    "make",
}


def extract_keywords(text: str, *, max_keywords: int = 16) -> list[str]:
    """
    Deterministically extract simple keywords from text.

    Designed for local-first, stable hashing into fixed buckets.
    """
    if max_keywords <= 0:
        return []

    tokens = [t.lower() for t in _WORD_RE.findall(text or "")]
    tokens = [t for t in tokens if t not in _STOPWORDS]
    if not tokens:
        return []

    counts = Counter(tokens)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [word for word, _ in ranked[:max_keywords]]
