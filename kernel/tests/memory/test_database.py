"""Tests for SQLite memory database with FTS5."""

import tempfile
from pathlib import Path

import pytest


class TestMemoryDBInit:
    """Tests for MemoryDB initialization."""

    def test_init_creates_directory(self):
        """Test that initialization creates parent directories."""
        from cyntra.memory.database import MemoryDB

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "subdir" / "test.db"
            db = MemoryDB(db_path=db_path)

            assert db.db_path.parent.exists()
            db.close()

    def test_init_creates_tables(self):
        """Test that initialization creates required tables."""
        from cyntra.memory.database import MemoryDB

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = MemoryDB(db_path=db_path)

            conn = db._get_conn()
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0] for row in cursor.fetchall()}

            assert "sessions" in tables
            assert "observations" in tables
            assert "summaries" in tables
            assert "observations_fts" in tables
            assert "summaries_fts" in tables

            db.close()


class TestSessionOperations:
    """Tests for session operations."""

    @pytest.fixture
    def db(self):
        """Create temporary database."""
        from cyntra.memory.database import MemoryDB

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = MemoryDB(db_path=db_path)
            yield db
            db.close()

    def test_create_session(self, db):
        """Test session creation."""
        db.create_session(
            session_id="sess_test_123",
            workcell_id="wc-42",
            issue_id="42",
            domain="code",
            job_type="fix",
            toolchain="claude",
        )

        session = db.get_session("sess_test_123")

        assert session is not None
        assert session["workcell_id"] == "wc-42"
        assert session["issue_id"] == "42"
        assert session["domain"] == "code"
        assert session["status"] == "active"

    def test_end_session(self, db):
        """Test session ending."""
        db.create_session(
            session_id="sess_end_test",
            workcell_id="wc-end",
        )

        db.end_session("sess_end_test", status="completed")

        session = db.get_session("sess_end_test")

        assert session["status"] == "completed"
        assert session["ended_at"] is not None

    def test_get_nonexistent_session(self, db):
        """Test getting non-existent session."""
        session = db.get_session("nonexistent")

        assert session is None


class TestObservationOperations:
    """Tests for observation operations."""

    @pytest.fixture
    def db(self):
        """Create temporary database with session."""
        from cyntra.memory.database import MemoryDB

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = MemoryDB(db_path=db_path)
            db.create_session(
                session_id="sess_obs_test",
                workcell_id="wc-obs",
            )
            yield db
            db.close()

    def test_add_observation(self, db):
        """Test adding observation."""
        db.add_observation(
            observation_id="obs_123",
            session_id="sess_obs_test",
            obs_type="decision",
            content="Decided to use async approach",
            concept="pattern",
            importance="decision",
            token_count=50,
        )

        observations = db.get_observations(session_id="sess_obs_test")

        assert len(observations) == 1
        assert observations[0]["content"] == "Decided to use async approach"

    def test_add_tool_observation(self, db):
        """Test adding tool use observation."""
        db.add_observation(
            observation_id="obs_tool_123",
            session_id="sess_obs_test",
            obs_type="change",
            content="Used Edit: Updated main.py",
            tool_name="Edit",
            tool_args={"file": "main.py", "operation": "insert"},
            file_refs=["main.py"],
            outcome="success",
        )

        observations = db.get_observations(
            session_id="sess_obs_test",
            obs_type="change",
        )

        assert len(observations) == 1
        assert observations[0]["tool_name"] == "Edit"

    def test_get_observations_with_filters(self, db):
        """Test filtered observation retrieval."""
        # Add multiple observations
        db.add_observation(
            observation_id="obs_1",
            session_id="sess_obs_test",
            obs_type="decision",
            content="Decision 1",
            concept="pattern",
        )
        db.add_observation(
            observation_id="obs_2",
            session_id="sess_obs_test",
            obs_type="change",
            content="Change 1",
        )
        db.add_observation(
            observation_id="obs_3",
            session_id="sess_obs_test",
            obs_type="decision",
            content="Decision 2",
            concept="pattern",
        )

        # Filter by type
        decisions = db.get_observations(
            session_id="sess_obs_test",
            obs_type="decision",
        )

        assert len(decisions) == 2

        # Filter by concept
        patterns = db.get_observations(concept="pattern")

        assert len(patterns) == 2


class TestFTS5Search:
    """Tests for FTS5 full-text search."""

    @pytest.fixture
    def db(self):
        """Create database with searchable content."""
        from cyntra.memory.database import MemoryDB

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = MemoryDB(db_path=db_path)

            db.create_session(session_id="sess_fts", workcell_id="wc-fts")

            # Add observations with searchable content
            db.add_observation(
                observation_id="obs_api",
                session_id="sess_fts",
                obs_type="discovery",
                content="The API uses REST endpoints with JSON payloads",
                concept="discovery",
            )
            db.add_observation(
                observation_id="obs_db",
                session_id="sess_fts",
                obs_type="discovery",
                content="Database connections are pooled for efficiency",
                concept="discovery",
            )
            db.add_observation(
                observation_id="obs_auth",
                session_id="sess_fts",
                obs_type="decision",
                content="Using JWT tokens for API authentication",
                concept="pattern",
            )

            yield db
            db.close()

    def test_search_observations_match(self, db):
        """Test searching observations with FTS5."""
        results = db.search_observations("API", limit=10)

        assert len(results) >= 1
        # Check that API-related observations are found
        contents = [r["content"] for r in results]
        assert any("API" in c for c in contents)

    def test_search_observations_no_match(self, db):
        """Test search with no matches."""
        results = db.search_observations("nonexistent_term_xyz", limit=10)

        assert len(results) == 0

    def test_search_observations_limit(self, db):
        """Test search respects limit."""
        results = db.search_observations("the", limit=1)

        assert len(results) <= 1


class TestSummaryOperations:
    """Tests for summary operations."""

    @pytest.fixture
    def db(self):
        """Create database with session."""
        from cyntra.memory.database import MemoryDB

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = MemoryDB(db_path=db_path)
            db.create_session(session_id="sess_sum", workcell_id="wc-sum", domain="code")
            yield db
            db.close()

    def test_add_summary(self, db):
        """Test adding summary."""
        db.add_summary(
            summary_id="sum_123",
            session_id="sess_sum",
            summary_type="session",
            content="Successfully fixed 3 bugs",
            patterns=["Check logs first", "Use debugger"],
            anti_patterns=["Don't skip tests"],
            key_decisions=["Used async approach"],
            token_count=100,
        )

        summaries = db.get_recent_summaries(limit=10)

        assert len(summaries) == 1
        assert summaries[0]["content"] == "Successfully fixed 3 bugs"

    def test_get_recent_summaries_by_domain(self, db):
        """Test filtered summary retrieval by domain."""
        db.add_summary(
            summary_id="sum_code",
            session_id="sess_sum",
            summary_type="session",
            content="Code domain summary",
        )

        summaries = db.get_recent_summaries(domain="code", limit=10)

        assert len(summaries) == 1

    def test_search_summaries(self, db):
        """Test summary full-text search."""
        db.add_summary(
            summary_id="sum_search",
            session_id="sess_sum",
            summary_type="session",
            content="Implemented authentication with OAuth",
            patterns=["Use OAuth for third-party auth"],
        )

        results = db.search_summaries("OAuth", limit=10)

        assert len(results) >= 1


class TestContextInjection:
    """Tests for context injection functionality."""

    @pytest.fixture
    def db(self):
        """Create database with context data."""
        from cyntra.memory.database import MemoryDB

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test.db"
            db = MemoryDB(db_path=db_path)

            # Create session with domain
            db.create_session(
                session_id="sess_ctx",
                workcell_id="wc-ctx",
                domain="api",
            )

            # Add critical observation
            db.add_observation(
                observation_id="obs_critical",
                session_id="sess_ctx",
                obs_type="decision",
                content="Always validate input before processing",
                importance="critical",
                token_count=20,
            )

            # Add summary
            db.add_summary(
                summary_id="sum_ctx",
                session_id="sess_ctx",
                summary_type="session",
                content="API development patterns",
                patterns=["Validate inputs", "Log errors"],
                token_count=50,
            )

            db.end_session("sess_ctx")

            yield db
            db.close()

    def test_get_context_for_injection(self, db):
        """Test context retrieval for injection."""
        context = db.get_context_for_injection(
            domain="api",
            max_observations=10,
            max_tokens=1000,
        )

        assert "summaries" in context
        assert "observation_index" in context
        assert "token_budget" in context

    def test_context_token_budget(self, db):
        """Test token budget calculation."""
        context = db.get_context_for_injection(max_tokens=2000)

        budget = context["token_budget"]
        assert "summaries" in budget
        assert "remaining" in budget
        assert budget["remaining"] <= 2000
