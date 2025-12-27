"""Tests for memory data models."""

from datetime import datetime
from uuid import uuid4

from cyntra.memory.models import (
    AgentMemory,
    ConsolidationCluster,
    ExtractedMemory,
    LinkType,
    MemoryLink,
    MemoryScope,
    MemoryType,
)


class TestAgentMemory:
    """Tests for AgentMemory model."""

    def test_create_memory(self):
        """Test basic memory creation."""
        memory = AgentMemory(
            id=uuid4(),
            agent_id="claude",
            text="Test pattern for file handling",
            memory_type=MemoryType.PATTERN,
            scope=MemoryScope.INDIVIDUAL,
            importance_score=0.75,
            confidence=0.9,
            issue_tags=["bug", "file-system"],
            file_paths=["src/utils.py"],
            created_at=datetime.utcnow(),
        )

        assert memory.agent_id == "claude"
        assert memory.memory_type == MemoryType.PATTERN
        assert memory.importance_score == 0.75
        assert "bug" in memory.issue_tags

    def test_memory_types(self):
        """Test all memory types."""
        types = [
            MemoryType.PATTERN,
            MemoryType.FAILURE,
            MemoryType.DYNAMIC,
            MemoryType.CONTEXT,
            MemoryType.PLAYBOOK,
            MemoryType.FRONTIER,
        ]
        for mt in types:
            assert mt.value is not None

    def test_memory_scopes(self):
        """Test all memory scopes."""
        scopes = [
            MemoryScope.INDIVIDUAL,
            MemoryScope.COLLECTIVE,
            MemoryScope.WORLD,
        ]
        for scope in scopes:
            assert scope.value is not None


class TestExtractedMemory:
    """Tests for ExtractedMemory model."""

    def test_create_extracted_memory(self):
        """Test extracted memory creation."""
        memory = ExtractedMemory(
            text="When handling file errors, always check permissions first",
            memory_type=MemoryType.PATTERN,
            importance_score=0.8,
            confidence=0.85,
            issue_tags=["file-system"],
            file_paths=["src/handlers/file.py"],
        )

        assert memory.text is not None
        assert memory.importance_score == 0.8
        assert memory.memory_type == MemoryType.PATTERN

    def test_extracted_memory_defaults(self):
        """Test default values for extracted memory."""
        memory = ExtractedMemory(
            text="Simple test memory",
            memory_type=MemoryType.CONTEXT,
        )

        assert memory.importance_score == 0.5
        assert memory.confidence == 0.5
        assert memory.issue_tags == []
        assert memory.file_paths == []


class TestMemoryLink:
    """Tests for MemoryLink model."""

    def test_create_link(self):
        """Test link creation."""
        link = MemoryLink(
            source_id=uuid4(),
            target_id=uuid4(),
            link_type=LinkType.SUPERSEDES,
            confidence=0.9,
        )

        assert link.link_type == LinkType.SUPERSEDES
        assert link.confidence == 0.9

    def test_link_types(self):
        """Test all link types."""
        types = [
            LinkType.CONFLICTS,
            LinkType.SUPERSEDES,
            LinkType.CAUSES,
            LinkType.INSTANCE_OF,
            LinkType.INVALIDATED_BY,
            LinkType.MOTIVATED_BY,
            LinkType.IMPROVES_ON,
            LinkType.REQUIRES,
            LinkType.REPAIRS,
        ]
        for lt in types:
            assert lt.value is not None


class TestConsolidationCluster:
    """Tests for ConsolidationCluster model."""

    def test_create_cluster(self):
        """Test cluster creation."""
        cluster = ConsolidationCluster(
            cluster_id="test-cluster-1",
            memory_ids=[uuid4(), uuid4(), uuid4()],
            memory_texts=["text1", "text2", "text3"],
            similarity_scores=[1.0, 0.9, 0.88],
            avg_similarity=0.93,
            consolidation_confidence=0.88,
        )

        assert len(cluster.memory_ids) == 3
        assert cluster.avg_similarity == 0.93
        assert cluster.consolidation_confidence == 0.88
