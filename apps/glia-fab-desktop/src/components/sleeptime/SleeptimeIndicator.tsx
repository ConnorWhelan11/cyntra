/**
 * SleeptimeIndicator - Visual status indicator for the sleeptime agent.
 *
 * CSS-based animated orb that shows sleeptime consolidation status.
 * Uses the same purple/indigo color scheme as the 3D SleeptimeGlyph.
 */

import React from "react";

export interface SleeptimeStatus {
  completionsSinceLastRun: number;
  completionThreshold: number;
  lastConsolidationTime: string | null;
  patternsFound: number;
  trapsFound: number;
  isConsolidating: boolean;
}

export type SleeptimeState =
  | "dormant"
  | "ingesting"
  | "distilling"
  | "consolidating"
  | "complete";

interface SleeptimeIndicatorProps {
  status: SleeptimeStatus;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
  className?: string;
}

const SIZES = {
  sm: { orb: 32, ring: 40, fontSize: 9 },
  md: { orb: 48, ring: 60, fontSize: 11 },
  lg: { orb: 72, ring: 88, fontSize: 12 },
};

function getState(status: SleeptimeStatus): SleeptimeState {
  if (status.isConsolidating) {
    // Could add more granular state detection based on progress
    return "consolidating";
  }
  return "dormant";
}

function getStateLabel(state: SleeptimeState): string {
  switch (state) {
    case "dormant":
      return "Dormant";
    case "ingesting":
      return "Ingesting";
    case "distilling":
      return "Distilling";
    case "consolidating":
      return "Consolidating";
    case "complete":
      return "Complete";
  }
}

export const SleeptimeIndicator: React.FC<SleeptimeIndicatorProps> = ({
  status,
  size = "md",
  showDetails = true,
  className = "",
}) => {
  const state = getState(status);
  const dims = SIZES[size];
  const progress = status.completionsSinceLastRun / status.completionThreshold;
  const progressDegrees = Math.min(360, progress * 360);

  // Animation class based on state
  const animationClass =
    state === "dormant" ? "sleeptime-breathe" : "sleeptime-pulse";

  return (
    <div className={`sleeptime-indicator ${className}`}>
      <style>{`
        .sleeptime-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          font-family: ui-monospace, SFMono-Regular, monospace;
        }

        .sleeptime-orb-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sleeptime-orb {
          width: ${dims.orb}px;
          height: ${dims.orb}px;
          border-radius: 50%;
          background: radial-gradient(
            circle at 30% 30%,
            #B794F4 0%,
            #805AD5 40%,
            #553C9A 80%,
            #322659 100%
          );
          box-shadow:
            0 0 ${dims.orb / 3}px rgba(159, 122, 234, 0.5),
            0 0 ${dims.orb / 2}px rgba(128, 90, 213, 0.3),
            inset 0 0 ${dims.orb / 4}px rgba(183, 148, 244, 0.4);
        }

        .sleeptime-breathe {
          animation: sleeptime-breathe 4s ease-in-out infinite;
        }

        .sleeptime-pulse {
          animation: sleeptime-pulse 1.5s ease-in-out infinite;
        }

        @keyframes sleeptime-breathe {
          0%, 100% {
            transform: scale(1);
            box-shadow:
              0 0 ${dims.orb / 3}px rgba(159, 122, 234, 0.4),
              0 0 ${dims.orb / 2}px rgba(128, 90, 213, 0.2);
          }
          50% {
            transform: scale(1.05);
            box-shadow:
              0 0 ${dims.orb / 2}px rgba(159, 122, 234, 0.6),
              0 0 ${dims.orb}px rgba(128, 90, 213, 0.4);
          }
        }

        @keyframes sleeptime-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow:
              0 0 ${dims.orb / 2}px rgba(159, 122, 234, 0.6),
              0 0 ${dims.orb}px rgba(128, 90, 213, 0.4);
          }
          50% {
            transform: scale(1.08);
            box-shadow:
              0 0 ${dims.orb}px rgba(214, 188, 250, 0.8),
              0 0 ${dims.orb * 1.5}px rgba(159, 122, 234, 0.5);
          }
        }

        .sleeptime-ring {
          position: absolute;
          width: ${dims.ring}px;
          height: ${dims.ring}px;
          border-radius: 50%;
          border: 2px solid transparent;
          background: conic-gradient(
            from 0deg,
            #D6BCFA ${progressDegrees}deg,
            rgba(107, 70, 193, 0.2) ${progressDegrees}deg
          );
          -webkit-mask: radial-gradient(
            farthest-side,
            transparent calc(100% - 3px),
            #fff calc(100% - 2px)
          );
          mask: radial-gradient(
            farthest-side,
            transparent calc(100% - 3px),
            #fff calc(100% - 2px)
          );
        }

        .sleeptime-details {
          text-align: center;
          color: rgba(255, 255, 255, 0.8);
          font-size: ${dims.fontSize}px;
        }

        .sleeptime-state {
          color: #D6BCFA;
          font-weight: 500;
          margin-bottom: 2px;
        }

        .sleeptime-progress {
          color: rgba(255, 255, 255, 0.6);
        }

        .sleeptime-stats {
          display: flex;
          gap: 8px;
          margin-top: 4px;
          font-size: ${dims.fontSize - 1}px;
          color: rgba(255, 255, 255, 0.5);
        }

        .sleeptime-stat {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .sleeptime-stat-icon {
          width: 12px;
          height: 12px;
          opacity: 0.7;
        }
      `}</style>

      <div className="sleeptime-orb-container">
        <div className="sleeptime-ring" />
        <div className={`sleeptime-orb ${animationClass}`} />
      </div>

      {showDetails && (
        <div className="sleeptime-details">
          <div className="sleeptime-state">{getStateLabel(state)}</div>
          <div className="sleeptime-progress">
            {status.completionsSinceLastRun} / {status.completionThreshold}
          </div>
          {(status.patternsFound > 0 || status.trapsFound > 0) && (
            <div className="sleeptime-stats">
              {status.patternsFound > 0 && (
                <span className="sleeptime-stat">
                  <svg
                    className="sleeptime-stat-icon"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                  {status.patternsFound}
                </span>
              )}
              {status.trapsFound > 0 && (
                <span className="sleeptime-stat">
                  <svg
                    className="sleeptime-stat-icon"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {status.trapsFound}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SleeptimeIndicator;
