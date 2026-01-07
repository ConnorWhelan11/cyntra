"""Generate evaluation reports."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from eval.offline_harness import OfflineEvalResult
from eval.live_metrics import LiveMetricsCollector
from eval.failure_detector import FailureDetector

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generate evaluation reports in various formats."""

    def __init__(self, output_dir: Path | str) -> None:
        """Initialize report generator.

        Args:
            output_dir: Directory for output files
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_offline_report(
        self,
        result: OfflineEvalResult,
        name: str = "offline_eval",
    ) -> Path:
        """Generate report from offline evaluation.

        Args:
            result: Offline evaluation result
            name: Report name prefix

        Returns:
            Path to generated report
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = self.output_dir / f"{name}_{timestamp}.json"

        report = {
            "type": "offline_evaluation",
            "timestamp": timestamp,
            "summary": {
                "total_images": result.total_images,
                "json_valid_rate": f"{result.json_valid_rate:.1%}",
                "avg_latency_ms": f"{result.avg_latency_ms:.0f}",
                "p95_latency_ms": f"{result.p95_latency_ms:.0f}",
                "avg_confidence": f"{result.avg_confidence:.2f}",
                "consistency_score": f"{result.consistency_score:.2f}",
            },
            "details": result.to_dict(),
            "pass_fail": self._evaluate_offline_criteria(result),
        }

        with open(report_path, "w") as f:
            json.dump(report, f, indent=2)

        # Also generate text summary
        text_path = self.output_dir / f"{name}_{timestamp}.txt"
        self._write_offline_text_report(result, text_path)

        logger.info(f"Offline report saved to {report_path}")
        return report_path

    def _evaluate_offline_criteria(self, result: OfflineEvalResult) -> dict[str, bool]:
        """Evaluate success criteria for offline evaluation.

        Args:
            result: Evaluation result

        Returns:
            Dict of criteria name to pass/fail
        """
        return {
            "json_valid_rate_99pct": result.json_valid_rate >= 0.99,
            "avg_latency_under_2s": result.avg_latency_ms < 2000,
            "p95_latency_under_3s": result.p95_latency_ms < 3000,
            "avg_confidence_above_0.5": result.avg_confidence >= 0.5,
            "consistency_above_0.7": result.consistency_score >= 0.7,
        }

    def _write_offline_text_report(
        self,
        result: OfflineEvalResult,
        path: Path,
    ) -> None:
        """Write text format offline report."""
        lines = [
            "=" * 60,
            "MONET-NITROGEN OFFLINE EVALUATION REPORT",
            "=" * 60,
            "",
            "SUMMARY",
            "-" * 40,
            f"Total images processed: {result.total_images}",
            f"JSON valid rate: {result.json_valid_rate:.1%} ({result.json_valid_count}/{result.total_images})",
            f"Average latency: {result.avg_latency_ms:.0f}ms",
            f"P95 latency: {result.p95_latency_ms:.0f}ms",
            f"Average confidence: {result.avg_confidence:.2f}",
            f"Consistency score: {result.consistency_score:.2f}",
            "",
            "CONSTRAINT DISTRIBUTION",
            "-" * 40,
        ]

        for constraint, count in sorted(
            result.constraint_distribution.items(), key=lambda x: -x[1]
        ):
            lines.append(f"  {constraint}: {count}")

        lines.extend([
            "",
            "INTENT DISTRIBUTION",
            "-" * 40,
        ])

        for intent, count in sorted(
            result.intent_distribution.items(), key=lambda x: -x[1]
        ):
            lines.append(f"  {intent}: {count}")

        lines.extend([
            "",
            "SUCCESS CRITERIA",
            "-" * 40,
        ])

        criteria = self._evaluate_offline_criteria(result)
        all_pass = all(criteria.values())
        for name, passed in criteria.items():
            status = "PASS" if passed else "FAIL"
            lines.append(f"  [{status}] {name}")

        lines.extend([
            "",
            "-" * 40,
            f"OVERALL: {'PASS' if all_pass else 'FAIL'}",
            "=" * 60,
        ])

        if result.errors:
            lines.extend([
                "",
                "ERRORS",
                "-" * 40,
            ])
            for error in result.errors[:10]:
                lines.append(f"  - {error}")
            if len(result.errors) > 10:
                lines.append(f"  ... and {len(result.errors) - 10} more")

        path.write_text("\n".join(lines))

    def generate_live_report(
        self,
        metrics: LiveMetricsCollector,
        failures: FailureDetector,
        name: str = "live_eval",
    ) -> Path:
        """Generate report from live session.

        Args:
            metrics: Live metrics collector
            failures: Failure detector
            name: Report name prefix

        Returns:
            Path to generated report
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = self.output_dir / f"{name}_{timestamp}.json"

        metrics_summary = metrics.get_summary()
        failure_summary = failures.get_summary()

        report = {
            "type": "live_evaluation",
            "timestamp": timestamp,
            "duration_s": metrics_summary["elapsed_s"],
            "metrics": metrics_summary,
            "failures": failure_summary,
            "pass_fail": self._evaluate_live_criteria(metrics_summary, failure_summary),
        }

        with open(report_path, "w") as f:
            json.dump(report, f, indent=2)

        logger.info(f"Live report saved to {report_path}")
        return report_path

    def _evaluate_live_criteria(
        self,
        metrics: dict[str, Any],
        failures: dict[str, Any],
    ) -> dict[str, bool]:
        """Evaluate success criteria for live session.

        Args:
            metrics: Metrics summary
            failures: Failure summary

        Returns:
            Dict of criteria name to pass/fail
        """
        planner = metrics.get("planner", {})
        latency = planner.get("latency", {})

        return {
            "fps_above_30": metrics.get("performance", {}).get("fps", 0) >= 30,
            "planner_success_above_95pct": planner.get("success_rate", 0) >= 0.95,
            "avg_latency_under_2s": latency.get("avg", 9999) < 2000,
            "stuck_events_under_5": failures.get("counters", {}).get("stuck_count", 0) < 5,
            "no_executor_failures": failures.get("counters", {}).get("executor_failures", 0) == 0,
        }

    def generate_comparison_report(
        self,
        results: list[tuple[str, OfflineEvalResult]],
        name: str = "comparison",
    ) -> Path:
        """Generate comparison report across multiple evaluations.

        Args:
            results: List of (name, result) tuples
            name: Report name prefix

        Returns:
            Path to generated report
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = self.output_dir / f"{name}_{timestamp}.json"

        comparison = {
            "type": "comparison",
            "timestamp": timestamp,
            "evaluations": {},
        }

        for eval_name, result in results:
            comparison["evaluations"][eval_name] = {
                "json_valid_rate": result.json_valid_rate,
                "avg_latency_ms": result.avg_latency_ms,
                "avg_confidence": result.avg_confidence,
                "consistency_score": result.consistency_score,
            }

        with open(report_path, "w") as f:
            json.dump(comparison, f, indent=2)

        logger.info(f"Comparison report saved to {report_path}")
        return report_path
