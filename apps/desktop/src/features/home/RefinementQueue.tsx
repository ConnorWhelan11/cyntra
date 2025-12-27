/**
 * RefinementQueue - Shows pending refinements with Apply Now option
 *
 * Displays queued refinements waiting to be applied in next iteration.
 */

import React from "react";
import type { RefinementMessage } from "@/types";

interface RefinementQueueProps {
  /** Pending refinements */
  refinements: RefinementMessage[];
  /** Apply refinement immediately */
  onApplyNow: (refinementId: string) => void;
}

/** Status badge text */
const STATUS_TEXT: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  applying: "Applying...",
  applied: "Applied",
};

export function RefinementQueue({ refinements, onApplyNow }: RefinementQueueProps) {
  // Only show pending/queued refinements
  const pendingRefinements = refinements.filter(
    (r) => r.status === "pending" || r.status === "queued"
  );

  if (pendingRefinements.length === 0) {
    return null;
  }

  return (
    <div className="refinement-queue">
      <div className="refinement-queue-header">
        <span className="refinement-queue-title">
          Queued Refinements ({pendingRefinements.length})
        </span>
      </div>
      <ul className="refinement-queue-list">
        {pendingRefinements.map((refinement) => (
          <li key={refinement.id} className="refinement-queue-item">
            <span className="refinement-queue-item-bullet">•</span>
            <span className="refinement-queue-item-text" title={refinement.text}>
              {refinement.text.length > 50 ? `${refinement.text.slice(0, 50)}...` : refinement.text}
            </span>
            <span className="refinement-queue-item-status" data-status={refinement.status}>
              {STATUS_TEXT[refinement.status]}
            </span>
            {refinement.status === "queued" && (
              <button
                className="refinement-queue-item-apply-btn"
                onClick={() => onApplyNow(refinement.id)}
                title="Apply this refinement immediately (interrupts current work)"
              >
                Apply Now
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RefinementQueue;
