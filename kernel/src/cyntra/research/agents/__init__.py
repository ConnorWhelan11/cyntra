"""
Research agents for the Cyntra knowledge system.

Agents:
- Scout: Discover and prioritize sources
- Collector: Fetch and normalize content
- Synthesizer: Draft memories from evidence
- Verifier: Validate memory quality
- Librarian: Store and index memories
"""

from cyntra.research.agents.base import AgentContext, AgentResult, BaseResearchAgent
from cyntra.research.agents.collector import (
    CollectedEvidence,
    CollectorAgent,
    CollectorInput,
    CollectorOutput,
    SafetyScanResult,
    create_collector_input,
)
from cyntra.research.agents.librarian import (
    LibrarianAgent,
    LibrarianInput,
    LibrarianOutput,
    StoredMemory,
    create_librarian_input,
)
from cyntra.research.agents.scout import (
    QueryResult,
    ScoutAgent,
    ScoutInput,
    ScoutOutput,
    SourceEntry,
    create_scout_input,
)
from cyntra.research.agents.synthesizer import (
    SynthesisDecision,
    SynthesizerAgent,
    SynthesizerInput,
    SynthesizerOutput,
    create_synthesizer_input,
)
from cyntra.research.agents.verifier import (
    VerifierAgent,
    VerifierInput,
    VerifierOutput,
    create_verifier_input,
)

__all__ = [
    # Base
    "BaseResearchAgent",
    "AgentContext",
    "AgentResult",
    # Scout
    "ScoutAgent",
    "ScoutInput",
    "ScoutOutput",
    "SourceEntry",
    "QueryResult",
    "create_scout_input",
    # Collector
    "CollectorAgent",
    "CollectorInput",
    "CollectorOutput",
    "CollectedEvidence",
    "SafetyScanResult",
    "create_collector_input",
    # Synthesizer
    "SynthesizerAgent",
    "SynthesizerInput",
    "SynthesizerOutput",
    "SynthesisDecision",
    "create_synthesizer_input",
    # Verifier
    "VerifierAgent",
    "VerifierInput",
    "VerifierOutput",
    "create_verifier_input",
    # Librarian
    "LibrarianAgent",
    "LibrarianInput",
    "LibrarianOutput",
    "StoredMemory",
    "create_librarian_input",
]
