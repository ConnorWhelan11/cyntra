"""
SQLite-backed transition database for Cyntra dynamics.

Includes strategy profile storage for reasoning telemetry.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cyntra.strategy.profile import StrategyProfile


class TransitionDB:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def close(self) -> None:
        self.conn.close()

    def _init_schema(self) -> None:
        cursor = self.conn.cursor()
        cursor.executescript(
            """
            CREATE TABLE IF NOT EXISTS states (
                state_id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                job_type TEXT NOT NULL,
                data_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transitions (
                transition_id TEXT PRIMARY KEY,
                rollout_id TEXT,
                workcell_id TEXT,
                issue_id TEXT,
                job_type TEXT,
                toolchain TEXT,
                transition_kind TEXT,
                from_state TEXT NOT NULL,
                to_state TEXT NOT NULL,
                timestamp TEXT,
                action_tool TEXT,
                action_command_class TEXT,
                action_domain TEXT,
                context_json TEXT,
                observations_json TEXT,
                FOREIGN KEY(from_state) REFERENCES states(state_id),
                FOREIGN KEY(to_state) REFERENCES states(state_id)
            );

            CREATE INDEX IF NOT EXISTS idx_transitions_from_state ON transitions(from_state);
            CREATE INDEX IF NOT EXISTS idx_transitions_to_state ON transitions(to_state);

            -- Strategy profiles table for reasoning telemetry
            CREATE TABLE IF NOT EXISTS strategy_profiles (
                profile_id TEXT PRIMARY KEY,
                workcell_id TEXT,
                issue_id TEXT,
                rollout_id TEXT,
                rubric_version TEXT NOT NULL,
                model TEXT,
                toolchain TEXT,
                extraction_method TEXT NOT NULL DEFAULT 'unknown',
                outcome TEXT DEFAULT 'unknown',
                average_confidence REAL,
                extracted_at TEXT NOT NULL,
                profile_json TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_strategy_profiles_workcell
                ON strategy_profiles(workcell_id);
            CREATE INDEX IF NOT EXISTS idx_strategy_profiles_issue
                ON strategy_profiles(issue_id);
            CREATE INDEX IF NOT EXISTS idx_strategy_profiles_rollout
                ON strategy_profiles(rollout_id);
            CREATE INDEX IF NOT EXISTS idx_strategy_profiles_outcome
                ON strategy_profiles(outcome);
            CREATE INDEX IF NOT EXISTS idx_strategy_profiles_toolchain
                ON strategy_profiles(toolchain);

            -- Normalized dimension values for analytics
            CREATE TABLE IF NOT EXISTS strategy_dimension_values (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id TEXT NOT NULL,
                dimension_id TEXT NOT NULL,
                pattern_value TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.5,
                evidence TEXT,
                FOREIGN KEY(profile_id) REFERENCES strategy_profiles(profile_id),
                UNIQUE(profile_id, dimension_id)
            );

            CREATE INDEX IF NOT EXISTS idx_strategy_dim_profile
                ON strategy_dimension_values(profile_id);
            CREATE INDEX IF NOT EXISTS idx_strategy_dim_dimension
                ON strategy_dimension_values(dimension_id);
            CREATE INDEX IF NOT EXISTS idx_strategy_dim_pattern
                ON strategy_dimension_values(dimension_id, pattern_value);
            """
        )
        self.conn.commit()

    def insert_state(self, state: dict[str, Any]) -> None:
        state_id = state.get("state_id")
        if not state_id:
            return
        self.conn.execute(
            """
            INSERT OR IGNORE INTO states (state_id, domain, job_type, data_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                state_id,
                str(state.get("domain") or "unknown"),
                str(state.get("job_type") or "unknown"),
                json.dumps(state, sort_keys=True, separators=(",", ":"), ensure_ascii=True),
            ),
        )

    def insert_transition(self, transition: dict[str, Any]) -> None:
        from_state = transition.get("from_state") or {}
        to_state = transition.get("to_state") or {}

        self.insert_state(from_state)
        self.insert_state(to_state)

        action_label = transition.get("action_label") or {}
        context = transition.get("context") or {}

        self.conn.execute(
            """
            INSERT OR REPLACE INTO transitions (
                transition_id,
                rollout_id,
                workcell_id,
                issue_id,
                job_type,
                toolchain,
                transition_kind,
                from_state,
                to_state,
                timestamp,
                action_tool,
                action_command_class,
                action_domain,
                context_json,
                observations_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                transition.get("transition_id"),
                transition.get("rollout_id"),
                context.get("workcell_id"),
                context.get("issue_id"),
                context.get("job_type"),
                context.get("toolchain"),
                transition.get("transition_kind"),
                from_state.get("state_id"),
                to_state.get("state_id"),
                transition.get("timestamp"),
                action_label.get("tool"),
                action_label.get("command_class"),
                action_label.get("domain"),
                json.dumps(context, sort_keys=True, separators=(",", ":"), ensure_ascii=True),
                json.dumps(
                    transition.get("observations") or {},
                    sort_keys=True,
                    separators=(",", ":"),
                    ensure_ascii=True,
                ),
            ),
        )

    def insert_transitions(self, transitions: list[dict[str, Any]]) -> int:
        count = 0
        with self.conn:
            for transition in transitions:
                self.insert_transition(transition)
                count += 1
        return count

    def load_states(self) -> dict[str, dict[str, Any]]:
        rows = self.conn.execute("SELECT state_id, data_json FROM states").fetchall()
        result: dict[str, dict[str, Any]] = {}
        for row in rows:
            state_id = row["state_id"]
            try:
                result[state_id] = json.loads(row["data_json"])
            except json.JSONDecodeError:
                result[state_id] = {}
        return result

    def list_transition_timestamps(self) -> list[str]:
        rows = self.conn.execute(
            "SELECT timestamp FROM transitions WHERE timestamp IS NOT NULL"
        ).fetchall()
        return [row["timestamp"] for row in rows if row["timestamp"]]

    def transition_counts(self, limit: int | None = None) -> list[dict[str, Any]]:
        cursor = self.conn.cursor()
        query = """
            SELECT from_state, to_state, COUNT(*) as count
            FROM transitions
            GROUP BY from_state, to_state
            ORDER BY count DESC
        """
        if limit:
            query += " LIMIT ?"
            rows = cursor.execute(query, (limit,)).fetchall()
        else:
            rows = cursor.execute(query).fetchall()
        return [dict(row) for row in rows]

    def transition_probabilities(self, limit: int | None = None) -> list[dict[str, Any]]:
        counts = self.transition_counts()
        totals: dict[str, int] = {}
        for row in counts:
            totals[row["from_state"]] = totals.get(row["from_state"], 0) + int(row["count"])

        results: list[dict[str, Any]] = []
        for row in counts:
            total = totals.get(row["from_state"], 1)
            prob = float(row["count"]) / float(total)
            results.append({**row, "probability": prob})

        if limit:
            return results[:limit]
        return results

    # =========================================================================
    # Strategy Profile Methods
    # =========================================================================

    def insert_profile(
        self,
        profile: StrategyProfile,
        rollout_id: str | None = None,
        outcome: str = "unknown",
    ) -> str:
        """
        Insert a strategy profile into the database.

        Args:
            profile: The StrategyProfile to insert
            rollout_id: Optional rollout ID to associate
            outcome: Run outcome (passed, failed, unknown)

        Returns:
            The generated profile_id
        """
        profile_id = str(uuid.uuid4())
        extracted_at = profile.extracted_at or datetime.now(UTC).isoformat()

        # Insert main profile record
        self.conn.execute(
            """
            INSERT INTO strategy_profiles (
                profile_id, workcell_id, issue_id, rollout_id,
                rubric_version, model, toolchain, extraction_method,
                outcome, average_confidence, extracted_at, profile_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                profile.workcell_id,
                profile.issue_id,
                rollout_id,
                profile.rubric_version,
                profile.model,
                profile.toolchain,
                profile.extraction_method,
                outcome,
                profile.average_confidence(),
                extracted_at,
                profile.to_json(),
            ),
        )

        # Insert normalized dimension values for analytics
        for dim_id, dv in profile.dimensions.items():
            self.conn.execute(
                """
                INSERT INTO strategy_dimension_values (
                    profile_id, dimension_id, pattern_value, confidence, evidence
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (profile_id, dim_id, dv.value, dv.confidence, dv.evidence),
            )

        self.conn.commit()
        return profile_id

    def get_profiles(
        self,
        workcell_id: str | None = None,
        issue_id: str | None = None,
        rollout_id: str | None = None,
        toolchain: str | None = None,
        outcome: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """
        Query strategy profiles with optional filters.

        Returns list of profile records with parsed profile_json.
        """
        query = "SELECT * FROM strategy_profiles WHERE 1=1"
        params: list[Any] = []

        if workcell_id:
            query += " AND workcell_id = ?"
            params.append(workcell_id)
        if issue_id:
            query += " AND issue_id = ?"
            params.append(issue_id)
        if rollout_id:
            query += " AND rollout_id = ?"
            params.append(rollout_id)
        if toolchain:
            query += " AND toolchain = ?"
            params.append(toolchain)
        if outcome:
            query += " AND outcome = ?"
            params.append(outcome)

        query += " ORDER BY extracted_at DESC"

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        rows = self.conn.execute(query, params).fetchall()
        results: list[dict[str, Any]] = []
        for row in rows:
            record = dict(row)
            # Parse the JSON profile
            try:
                record["profile"] = json.loads(record.pop("profile_json"))
            except (json.JSONDecodeError, KeyError):
                record["profile"] = {}
            results.append(record)
        return results

    def get_profile_by_id(self, profile_id: str) -> dict[str, Any] | None:
        """Get a single profile by ID."""
        row = self.conn.execute(
            "SELECT * FROM strategy_profiles WHERE profile_id = ?",
            (profile_id,),
        ).fetchone()
        if not row:
            return None
        record = dict(row)
        try:
            record["profile"] = json.loads(record.pop("profile_json"))
        except (json.JSONDecodeError, KeyError):
            record["profile"] = {}
        return record

    def get_dimension_distribution(
        self,
        dimension_id: str,
        toolchain: str | None = None,
        outcome: str | None = None,
    ) -> dict[str, int]:
        """
        Get distribution of pattern values for a dimension.

        Returns dict mapping pattern_value -> count.
        """
        query = """
            SELECT dv.pattern_value, COUNT(*) as count
            FROM strategy_dimension_values dv
            JOIN strategy_profiles p ON dv.profile_id = p.profile_id
            WHERE dv.dimension_id = ?
        """
        params: list[Any] = [dimension_id]

        if toolchain:
            query += " AND p.toolchain = ?"
            params.append(toolchain)
        if outcome:
            query += " AND p.outcome = ?"
            params.append(outcome)

        query += " GROUP BY dv.pattern_value"

        rows = self.conn.execute(query, params).fetchall()
        return {row["pattern_value"]: row["count"] for row in rows}

    def get_optimal_strategy_for(
        self,
        toolchain: str | None = None,
        outcome: str = "passed",
        min_confidence: float = 0.5,
    ) -> dict[str, str]:
        """
        Compute optimal strategy pattern for each dimension based on successful runs.

        Returns dict mapping dimension_id -> most common pattern_value.
        """
        query = """
            SELECT dv.dimension_id, dv.pattern_value, COUNT(*) as count
            FROM strategy_dimension_values dv
            JOIN strategy_profiles p ON dv.profile_id = p.profile_id
            WHERE p.outcome = ?
              AND dv.confidence >= ?
        """
        params: list[Any] = [outcome, min_confidence]

        if toolchain:
            query += " AND p.toolchain = ?"
            params.append(toolchain)

        query += """
            GROUP BY dv.dimension_id, dv.pattern_value
            ORDER BY dv.dimension_id, count DESC
        """

        rows = self.conn.execute(query, params).fetchall()

        # For each dimension, pick the most common pattern
        optimal: dict[str, str] = {}
        for row in rows:
            dim_id = row["dimension_id"]
            if dim_id not in optimal:
                optimal[dim_id] = row["pattern_value"]

        return optimal

    def profile_count(
        self,
        toolchain: str | None = None,
        outcome: str | None = None,
    ) -> int:
        """Count profiles matching filters."""
        query = "SELECT COUNT(*) as count FROM strategy_profiles WHERE 1=1"
        params: list[Any] = []

        if toolchain:
            query += " AND toolchain = ?"
            params.append(toolchain)
        if outcome:
            query += " AND outcome = ?"
            params.append(outcome)

        row = self.conn.execute(query, params).fetchone()
        return row["count"] if row else 0
