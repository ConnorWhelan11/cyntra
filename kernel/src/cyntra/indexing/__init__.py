"""
Indexing + retrieval substrate for Cyntra.

MVP uses CocoIndex to incrementally index:
- `.cyntra/runs/**`
- `.cyntra/archives/**`
- `docs/**`, `prompts/**`, `fab/worlds/**`

The CocoIndex app entrypoint lives in `cyntra.indexing.cocoindex_app`.
"""
