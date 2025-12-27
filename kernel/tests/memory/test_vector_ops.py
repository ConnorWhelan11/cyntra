"""Tests for vector operations."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestVectorOps:
    """Tests for VectorOps class."""

    @pytest.fixture
    def vector_ops(self):
        """Create VectorOps instance without loading model."""
        from cyntra.memory.vector_ops import VectorOps

        ops = VectorOps(model_name="test-model", cache_size=10)
        return ops

    def test_init_defaults(self):
        """Test VectorOps initialization with defaults."""
        from cyntra.memory.vector_ops import DEFAULT_MODEL, VectorOps

        ops = VectorOps()

        assert ops.model_name == DEFAULT_MODEL
        assert ops.use_openai is False
        assert ops._model is None
        assert ops._cache_size == 1000

    def test_init_openai(self):
        """Test VectorOps initialization with OpenAI."""
        from cyntra.memory.vector_ops import VectorOps

        ops = VectorOps(use_openai=True, openai_model="text-embedding-3-large")

        assert ops.use_openai is True
        assert ops.openai_model == "text-embedding-3-large"

    def test_cache_key(self, vector_ops):
        """Test cache key generation."""
        key1 = vector_ops._cache_key("Hello world")
        key2 = vector_ops._cache_key("Hello world")
        key3 = vector_ops._cache_key("Different text")

        assert key1 == key2
        assert key1 != key3
        assert len(key1) == 32  # MD5 hex length

    @pytest.mark.asyncio
    async def test_generate_embedding_cached(self, vector_ops):
        """Test that embeddings are cached."""
        test_embedding = [0.1] * 768
        vector_ops._cache[vector_ops._cache_key("test text")] = test_embedding

        result = await vector_ops.generate_embedding("test text")

        assert result == test_embedding

    @pytest.mark.asyncio
    async def test_generate_embedding_local(self, vector_ops):
        """Test local embedding generation."""
        mock_model = MagicMock()
        mock_model.encode = MagicMock(return_value=MagicMock(tolist=lambda: [0.1] * 768))
        vector_ops._model = mock_model

        with patch.object(vector_ops, "_embed_local", new=AsyncMock(return_value=[0.1] * 768)):
            result = await vector_ops.generate_embedding("test text")

        assert len(result) == 768
        assert (
            "test text" not in vector_ops._cache
            or vector_ops._cache[vector_ops._cache_key("test text")] == result
        )

    @pytest.mark.asyncio
    async def test_generate_embedding_cache_eviction(self, vector_ops):
        """Test cache eviction when full."""
        vector_ops._cache_size = 3

        # Pre-fill cache
        for i in range(3):
            vector_ops._cache[f"key{i}"] = [0.1] * 768

        assert len(vector_ops._cache) == 3

        # Add new entry should evict oldest
        with patch.object(vector_ops, "_embed_local", new=AsyncMock(return_value=[0.2] * 768)):
            await vector_ops.generate_embedding("new text")

        assert len(vector_ops._cache) == 3

    @pytest.mark.asyncio
    async def test_batch_embeddings_empty(self, vector_ops):
        """Test batch embeddings with empty list."""
        result = await vector_ops.batch_embeddings([])

        assert result == []

    @pytest.mark.asyncio
    async def test_batch_embeddings_with_cache(self, vector_ops):
        """Test batch embeddings uses cache."""
        vector_ops._cache[vector_ops._cache_key("cached")] = [0.1] * 768

        with patch.object(
            vector_ops, "_batch_embed_local", new=AsyncMock(return_value=[[0.2] * 768])
        ):
            result = await vector_ops.batch_embeddings(["cached", "new text"])

        # Should use cached value
        assert result[0] == [0.1] * 768


class TestCosineSimilarity:
    """Tests for cosine similarity calculation."""

    def test_identical_vectors(self):
        """Test similarity of identical vectors."""
        from cyntra.memory.vector_ops import VectorOps

        a = [1.0, 0.0, 0.0]
        b = [1.0, 0.0, 0.0]

        similarity = VectorOps.cosine_similarity(a, b)

        assert similarity == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        """Test similarity of orthogonal vectors."""
        from cyntra.memory.vector_ops import VectorOps

        a = [1.0, 0.0, 0.0]
        b = [0.0, 1.0, 0.0]

        similarity = VectorOps.cosine_similarity(a, b)

        assert similarity == pytest.approx(0.0)

    def test_opposite_vectors(self):
        """Test similarity of opposite vectors."""
        from cyntra.memory.vector_ops import VectorOps

        a = [1.0, 0.0, 0.0]
        b = [-1.0, 0.0, 0.0]

        similarity = VectorOps.cosine_similarity(a, b)

        assert similarity == pytest.approx(-1.0)

    def test_partial_similarity(self):
        """Test partial similarity."""
        from cyntra.memory.vector_ops import VectorOps

        a = [1.0, 1.0, 0.0]
        b = [1.0, 0.0, 0.0]

        similarity = VectorOps.cosine_similarity(a, b)

        # Should be 1/sqrt(2) ≈ 0.707
        assert 0.7 < similarity < 0.72

    def test_zero_vector(self):
        """Test similarity with zero vector."""
        from cyntra.memory.vector_ops import VectorOps

        a = [1.0, 1.0, 1.0]
        b = [0.0, 0.0, 0.0]

        similarity = VectorOps.cosine_similarity(a, b)

        assert similarity == 0.0


class TestEuclideanDistance:
    """Tests for Euclidean distance calculation."""

    def test_identical_vectors(self):
        """Test distance between identical vectors."""
        from cyntra.memory.vector_ops import VectorOps

        a = [1.0, 2.0, 3.0]
        b = [1.0, 2.0, 3.0]

        distance = VectorOps.euclidean_distance(a, b)

        assert distance == pytest.approx(0.0)

    def test_unit_distance(self):
        """Test unit distance."""
        from cyntra.memory.vector_ops import VectorOps

        a = [0.0, 0.0, 0.0]
        b = [1.0, 0.0, 0.0]

        distance = VectorOps.euclidean_distance(a, b)

        assert distance == pytest.approx(1.0)

    def test_3d_distance(self):
        """Test 3D distance calculation."""
        from cyntra.memory.vector_ops import VectorOps

        a = [0.0, 0.0, 0.0]
        b = [1.0, 1.0, 1.0]

        distance = VectorOps.euclidean_distance(a, b)

        # sqrt(3) ≈ 1.732
        assert distance == pytest.approx(1.732, rel=0.01)


class TestGetVectorOps:
    """Tests for get_vector_ops singleton."""

    def test_singleton_pattern(self):
        """Test singleton returns same instance."""
        from cyntra.memory import vector_ops as vo_module

        # Reset singleton
        vo_module._default_ops = None

        ops1 = vo_module.get_vector_ops()
        ops2 = vo_module.get_vector_ops()

        assert ops1 is ops2

    def test_singleton_with_params(self):
        """Test singleton with custom parameters."""
        from cyntra.memory import vector_ops as vo_module

        # Reset singleton
        vo_module._default_ops = None

        ops = vo_module.get_vector_ops(
            model_name="custom-model",
            use_openai=False,
        )

        assert ops.model_name == "custom-model"
