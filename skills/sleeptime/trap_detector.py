#!/usr/bin/env python3
"""
Trap Detector Skill

Use dynamics data to identify stuck states and create trap warnings.
Analyzes dynamics transition database to find:
- Low action probability states (traps)
- Oscillation patterns (back-and-forth between states)
- Dead-ends (states with no successful exits)
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib


class TrapDetector:
    """
    Detect traps from dynamics transition database.

    Used by SleeptimeOrchestrator during consolidation.

    Usage:
        detector = TrapDetector(
            dynamics_db_path=".cyntra/dynamics/transitions.db"
        )
        result = detector.detect()
        # result = {"traps": [...], "oscillations": [...]}
    """

    def __init__(
        self,
        dynamics_db_path: Path | str = ".cyntra/dynamics/transitions.db",
        action_threshold: float = 0.2,
        min_visits: int = 3,
    ):
        self.db_path = Path(dynamics_db_path)
        self.action_threshold = action_threshold
        self.min_visits = min_visits

    def detect(self) -> dict[str, Any]:
        """
        Main entry point - detect traps from dynamics data.

        Returns:
            {
                "traps": [...],
                "oscillations": [...],
                "summary": {...},
            }
        """
        if not self.db_path.exists():
            return {
                "traps": [],
                "oscillations": [],
                "summary": {"error": "Dynamics DB not found"},
            }

        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row

            traps = self._find_low_action_states(conn)
            oscillations = self._find_oscillations(conn)

            conn.close()

            return {
                "traps": traps,
                "oscillations": oscillations,
                "summary": {
                    "traps_found": len(traps),
                    "oscillations_found": len(oscillations),
                },
            }

        except Exception as e:
            return {
                "traps": [],
                "oscillations": [],
                "summary": {"error": str(e)},
            }

    def _find_low_action_states(self, conn: sqlite3.Connection) -> list[dict]:
        """Find states with low action probability (stuck states)."""
        traps = []

        try:
            # Query for states with many visits but few successful exits
            rows = conn.execute("""
                SELECT
                    s1_hash,
                    COUNT(*) as visit_count,
                    SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as success_count,
                    domain
                FROM transitions
                GROUP BY s1_hash
                HAVING visit_count >= ?
            """, (self.min_visits,)).fetchall()

            for row in rows:
                visit_count = row["visit_count"]
                success_count = row["success_count"]
                success_rate = success_count / visit_count if visit_count > 0 else 0

                if success_rate < self.action_threshold:
                    traps.append({
                        "state_id": row["s1_hash"][:16],
                        "reason": f"Low success rate ({success_rate:.1%}) with {visit_count} visits",
                        "recommendation": "Consider different approach or escalate to higher-capacity agent",
                        "domain": row["domain"],
                        "severity": "high" if success_rate < 0.1 else "medium",
                    })

        except sqlite3.Error:
            # Table might not exist yet
            pass

        return traps

    def _find_oscillations(self, conn: sqlite3.Connection) -> list[dict]:
        """Find back-and-forth patterns between states."""
        oscillations = []

        try:
            # Find A->B->A patterns
            rows = conn.execute("""
                SELECT
                    t1.s1_hash as state_a,
                    t1.s2_hash as state_b,
                    COUNT(*) as cycle_count
                FROM transitions t1
                JOIN transitions t2 ON t1.s2_hash = t2.s1_hash AND t2.s2_hash = t1.s1_hash
                WHERE t1.s1_hash < t1.s2_hash
                GROUP BY t1.s1_hash, t1.s2_hash
                HAVING cycle_count >= 2
            """).fetchall()

            for row in rows:
                oscillations.append({
                    "state_a": row["state_a"][:16],
                    "state_b": row["state_b"][:16],
                    "cycle_count": row["cycle_count"],
                    "recommendation": "Break cycle by trying alternative action or rollback further",
                })

        except sqlite3.Error:
            pass

        return oscillations


def _generate_block_id(trap_state: str) -> str:
    """Generate block ID from trap state."""
    hash_val = hashlib.sha256(trap_state.encode()).hexdigest()[:12]
    return f"mb_trap_{hash_val}"


def _analyze_traps(dynamics_report: dict[str, Any], action_threshold: float) -> list[dict[str, Any]]:
    """Analyze dynamics report for traps."""
    traps = []
    
    action_summary = dynamics_report.get("action_summary", {})
    trap_list = action_summary.get("traps", [])
    
    for trap in trap_list:
        state_id = trap.get("state_id", "unknown")
        reason = trap.get("reason", "unknown")
        recommendation = trap.get("recommendation", "")
        
        traps.append({
            "state_id": state_id,
            "reason": reason,
            "recommendation": recommendation,
            "detected_at": datetime.now(timezone.utc).isoformat(),
        })
    
    # Also check for low-action states in potential
    potential = dynamics_report.get("potential", [])
    by_domain = action_summary.get("by_domain", {})
    
    for domain, action_rate in by_domain.items():
        if action_rate < action_threshold:
            traps.append({
                "state_id": f"domain_{domain}_low_action",
                "reason": f"Domain {domain} has low action rate ({action_rate:.2f})",
                "recommendation": "Increase exploration (temperature, parallelism)",
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })
    
    return traps


def _create_trap_block(trap: dict[str, Any], domain: str = "all") -> dict[str, Any]:
    """Create memory block from trap."""
    block_id = _generate_block_id(trap["state_id"])
    now = datetime.now(timezone.utc).isoformat()
    
    return {
        "schema_version": "cyntra.memory_block.v1",
        "block_id": block_id,
        "block_type": "trap",
        "domain": domain,
        "tags": ["trap", "dynamics", "warning"],
        "content": {
            "title": f"Trap: {trap['reason'][:50]}",
            "summary": trap["reason"],
            "state_id": trap["state_id"],
            "recommendation": trap["recommendation"],
        },
        "evidence": {
            "detected_at": trap["detected_at"],
            "source": "dynamics_report",
        },
        "usage": {
            "injection_count": 0,
            "effectiveness": 0.5,
        },
        "lifecycle": {
            "created_at": now,
            "updated_at": now,
            "expires_at": None,
            "decay_rate": 0.05,
        },
    }


def execute(
    dynamics_report_path: str | Path,
    memory_path: str | Path,
    action_threshold: float = 0.2,
) -> dict[str, Any]:
    """
    Detect traps from dynamics report.

    Args:
        dynamics_report_path: Path to dynamics_report.json
        memory_path: Path to memory store directory
        action_threshold: Action rate threshold for trap detection

    Returns:
        {
            "traps_detected": [...],
            "trap_blocks_created": [...],
            "recommendations": [...]
        }
    """
    dynamics_report_path = Path(dynamics_report_path)
    memory_path = Path(memory_path)
    
    if not dynamics_report_path.exists():
        return {
            "success": False,
            "error": f"Dynamics report not found: {dynamics_report_path}",
        }
    
    try:
        dynamics_report = json.loads(dynamics_report_path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        return {
            "success": False,
            "error": f"Failed to read dynamics report: {e}",
        }
    
    try:
        # Detect traps
        traps = _analyze_traps(dynamics_report, action_threshold)
        
        # Create memory blocks for traps
        blocks_dir = memory_path / "blocks" / "traps"
        blocks_dir.mkdir(parents=True, exist_ok=True)
        
        trap_blocks_created = []
        recommendations = []
        
        for trap in traps:
            block = _create_trap_block(trap)
            block_path = blocks_dir / f"{block['block_id']}.json"
            
            # Only create if doesn't exist (avoid duplicates)
            if not block_path.exists():
                block_path.write_text(json.dumps(block, indent=2))
                trap_blocks_created.append(block["block_id"])
            
            if trap["recommendation"]:
                recommendations.append({
                    "state_id": trap["state_id"],
                    "recommendation": trap["recommendation"],
                })
        
        return {
            "success": True,
            "traps_detected": traps,
            "trap_blocks_created": trap_blocks_created,
            "recommendations": recommendations,
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to detect traps: {e}",
        }


def main():
    """CLI entrypoint."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Detect traps from dynamics")
    parser.add_argument("dynamics_report", help="Path to dynamics_report.json")
    parser.add_argument("memory_path", help="Path to memory store")
    parser.add_argument("--threshold", type=float, default=0.2, help="Action threshold")
    
    args = parser.parse_args()
    
    result = execute(
        dynamics_report_path=args.dynamics_report,
        memory_path=args.memory_path,
        action_threshold=args.threshold,
    )
    
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
