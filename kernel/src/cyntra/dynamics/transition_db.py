"""
SQLite-backed transition database for Cyntra dynamics.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


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
