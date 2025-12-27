"""
Prompt genome runtime support.

This package loads prompt genomes from the repo-level `prompts/` directory and
helps adapters compose prompts with genome-provided system prompts and rules.
"""

from cyntra.prompts.runtime import (
    detect_domain,
    load_prompt_genome,
    render_prompt_genome_preamble,
)

__all__ = [
    "detect_domain",
    "load_prompt_genome",
    "render_prompt_genome_preamble",
]
