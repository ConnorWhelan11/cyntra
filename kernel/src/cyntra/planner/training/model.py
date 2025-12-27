from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _safe_import_torch() -> Any:
    """
    Import torch in a way that doesn't crash hard in some sandboxed environments.

    Reuses the Fab critics optional dependency guard (subprocess import test).
    """
    from cyntra.fab.critics._optional_deps import safe_import_torch

    torch = safe_import_torch()
    if torch is None:
        raise RuntimeError(
            "Torch is unavailable (set DEV_KERNEL_FAB_DISABLE_TORCH=0 and install torch)."
        )
    return torch


torch = _safe_import_torch()
nn = torch.nn


@dataclass(frozen=True)
class HeadSizes:
    swarm: int
    max_candidates: int
    max_minutes: int
    max_iterations: int


class PlannerMLP(nn.Module):
    """
    Token-sequence → pooled embedding → MLP → multi-head logits.

    This is the "trivial baseline" (feature MLP) from the spec.
    """

    def __init__(
        self,
        *,
        vocab_size: int,
        seq_len: int,
        d_model: int,
        hidden_dim: int,
        dropout: float,
        head_sizes: HeadSizes,
    ) -> None:
        super().__init__()
        self.vocab_size = int(vocab_size)
        self.seq_len = int(seq_len)

        self.embedding = nn.Embedding(self.vocab_size, d_model)
        self.dropout = nn.Dropout(dropout)
        self.mlp = nn.Sequential(
            nn.Linear(d_model, hidden_dim),
            nn.SiLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Dropout(dropout),
        )

        self.head_swarm = nn.Linear(hidden_dim, head_sizes.swarm)
        self.head_max_candidates = nn.Linear(hidden_dim, head_sizes.max_candidates)
        self.head_max_minutes = nn.Linear(hidden_dim, head_sizes.max_minutes)
        self.head_max_iterations = nn.Linear(hidden_dim, head_sizes.max_iterations)

    def forward(self, input_ids: Any, attention_mask: Any) -> tuple[Any, Any, Any, Any]:
        # input_ids: [B, L] int64
        # attention_mask: [B, L] {0,1}
        x = self.embedding(input_ids)  # [B, L, D]
        mask = attention_mask.to(dtype=x.dtype).unsqueeze(-1)  # [B, L, 1]

        pooled = (x * mask).sum(dim=1)
        denom = mask.sum(dim=1).clamp(min=1.0)
        pooled = pooled / denom

        pooled = self.dropout(pooled)
        h = self.mlp(pooled)

        return (
            self.head_swarm(h),
            self.head_max_candidates(h),
            self.head_max_minutes(h),
            self.head_max_iterations(h),
        )


class PlannerTransformer(nn.Module):
    """
    Token-sequence → Transformer encoder → pooled embedding → multi-head logits.

    This is the "plain Transformer encoder" baseline from the spec.
    """

    def __init__(
        self,
        *,
        vocab_size: int,
        seq_len: int,
        d_model: int,
        n_heads: int,
        n_layers: int,
        ff_dim: int,
        dropout: float,
        head_sizes: HeadSizes,
    ) -> None:
        super().__init__()
        self.vocab_size = int(vocab_size)
        self.seq_len = int(seq_len)

        self.token_embedding = nn.Embedding(self.vocab_size, d_model)
        self.pos_embedding = nn.Embedding(self.seq_len, d_model)
        self.dropout = nn.Dropout(dropout)

        layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=int(n_heads),
            dim_feedforward=int(ff_dim),
            dropout=float(dropout),
            activation="gelu",
            batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=int(n_layers))

        self.proj = nn.Sequential(
            nn.Linear(d_model, d_model),
            nn.SiLU(),
            nn.Dropout(dropout),
        )

        self.head_swarm = nn.Linear(d_model, head_sizes.swarm)
        self.head_max_candidates = nn.Linear(d_model, head_sizes.max_candidates)
        self.head_max_minutes = nn.Linear(d_model, head_sizes.max_minutes)
        self.head_max_iterations = nn.Linear(d_model, head_sizes.max_iterations)

    def forward(self, input_ids: Any, attention_mask: Any) -> tuple[Any, Any, Any, Any]:
        # input_ids: [B, L] int64
        # attention_mask: [B, L] {0,1}
        batch, seq_len = input_ids.shape
        if int(seq_len) != self.seq_len:
            raise ValueError("Encoded seq_len mismatch")

        pos = torch.arange(self.seq_len, device=input_ids.device).unsqueeze(0).expand(batch, -1)
        x = self.token_embedding(input_ids) + self.pos_embedding(pos)
        x = self.dropout(x)

        key_padding_mask = attention_mask == 0
        x = self.encoder(x, src_key_padding_mask=key_padding_mask)

        mask = attention_mask.to(dtype=x.dtype).unsqueeze(-1)
        pooled = (x * mask).sum(dim=1)
        denom = mask.sum(dim=1).clamp(min=1.0)
        pooled = pooled / denom

        h = self.proj(pooled)
        return (
            self.head_swarm(h),
            self.head_max_candidates(h),
            self.head_max_minutes(h),
            self.head_max_iterations(h),
        )


class PlannerRecurrent(nn.Module):
    """
    Token-sequence → GRU encoder → last-token embedding → multi-head logits.

    This implements the spec's optional "recurrent encoder" ablation.
    """

    def __init__(
        self,
        *,
        vocab_size: int,
        seq_len: int,
        d_model: int,
        n_layers: int,
        dropout: float,
        head_sizes: HeadSizes,
    ) -> None:
        super().__init__()
        self.vocab_size = int(vocab_size)
        self.seq_len = int(seq_len)
        self.d_model = int(d_model)
        self.n_layers = int(n_layers)

        self.embedding = nn.Embedding(self.vocab_size, self.d_model)
        self.dropout = nn.Dropout(dropout)
        self.encoder = nn.GRU(
            input_size=self.d_model,
            hidden_size=self.d_model,
            num_layers=self.n_layers,
            batch_first=True,
            dropout=float(dropout) if self.n_layers > 1 else 0.0,
        )

        self.proj = nn.Sequential(
            nn.Linear(self.d_model, self.d_model),
            nn.SiLU(),
            nn.Dropout(dropout),
        )

        self.head_swarm = nn.Linear(self.d_model, head_sizes.swarm)
        self.head_max_candidates = nn.Linear(self.d_model, head_sizes.max_candidates)
        self.head_max_minutes = nn.Linear(self.d_model, head_sizes.max_minutes)
        self.head_max_iterations = nn.Linear(self.d_model, head_sizes.max_iterations)

    def _select_last(self, outputs: Any, attention_mask: Any) -> Any:
        batch, seq_len, hidden = outputs.shape
        if int(seq_len) != self.seq_len:
            raise ValueError("Encoded seq_len mismatch")
        if int(hidden) != self.d_model:
            raise ValueError("Hidden dim mismatch")

        lengths = attention_mask.sum(dim=1).clamp(min=1).to(dtype=torch.long)  # [B]
        idx = lengths - 1  # [B]
        batch_idx = torch.arange(batch, device=outputs.device)
        return outputs[batch_idx, idx]

    def forward(self, input_ids: Any, attention_mask: Any) -> tuple[Any, Any, Any, Any]:
        # input_ids: [B, L] int64
        # attention_mask: [B, L] {0,1}
        batch, seq_len = input_ids.shape
        if int(seq_len) != self.seq_len:
            raise ValueError("Encoded seq_len mismatch")

        x = self.embedding(input_ids)
        x = self.dropout(x)
        outputs, _ = self.encoder(x)
        last = self._select_last(outputs, attention_mask)
        h = self.proj(last)

        return (
            self.head_swarm(h),
            self.head_max_candidates(h),
            self.head_max_minutes(h),
            self.head_max_iterations(h),
        )

    def forward_tbptt(
        self,
        input_ids: Any,
        attention_mask: Any,
        *,
        tbptt_len: int,
    ) -> tuple[Any, Any, Any, Any]:
        """
        Forward pass using truncated BPTT over the token sequence.

        This is intended for training only; inference/export should use `forward()`.
        """
        if tbptt_len <= 0:
            raise ValueError("tbptt_len must be > 0")

        batch, seq_len = input_ids.shape
        if int(seq_len) != self.seq_len:
            raise ValueError("Encoded seq_len mismatch")

        x = self.embedding(input_ids)
        x = self.dropout(x)

        lengths = attention_mask.sum(dim=1).clamp(min=1).to(dtype=torch.long)
        target_idx = lengths - 1

        rep = torch.zeros((batch, self.d_model), device=x.device, dtype=x.dtype)
        rep_filled = torch.zeros((batch,), device=x.device, dtype=torch.bool)

        hidden = None
        for start in range(0, self.seq_len, tbptt_len):
            end = min(self.seq_len, start + tbptt_len)
            out_chunk, hidden = self.encoder(x[:, start:end, :], hidden)

            in_chunk = (target_idx >= start) & (target_idx < end) & (~rep_filled)
            if torch.any(in_chunk):
                batch_idx = torch.arange(batch, device=x.device)[in_chunk]
                pos = (target_idx[in_chunk] - start).to(dtype=torch.long)
                rep[in_chunk] = out_chunk[batch_idx, pos]
                rep_filled[in_chunk] = True

            if end < self.seq_len and hidden is not None:
                hidden = hidden.detach()

        # Defensive: if any samples weren't filled (shouldn't happen), use the final step.
        if not torch.all(rep_filled):
            rep[~rep_filled] = out_chunk[torch.arange(batch, device=x.device)[~rep_filled], -1]

        h = self.proj(rep)
        return (
            self.head_swarm(h),
            self.head_max_candidates(h),
            self.head_max_minutes(h),
            self.head_max_iterations(h),
        )
