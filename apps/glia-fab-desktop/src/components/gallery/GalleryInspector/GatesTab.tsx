import { memo } from "react";
import type { GalleryAsset } from "@/types/ui";

interface GatesTabProps {
  asset: GalleryAsset | null;
}

export const GatesTab = memo(function GatesTab({ asset }: GatesTabProps) {
  if (!asset) {
    return (
      <div className="gallery-inspector-empty">
        <span className="gallery-inspector-empty-icon">🔬</span>
        <span>Select an asset to view gate results</span>
      </div>
    );
  }

  const criticScores = asset.criticScores ?? {};
  const scoreEntries = Object.entries(criticScores);
  const hasScores = scoreEntries.length > 0;

  return (
    <div className="gallery-inspector-tab-content">
      {/* Overall Verdict */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Gate Verdict</span>
        <div className="gallery-inspector-verdict">
          {asset.gateVerdict === "pass" && (
            <span className="gallery-inspector-verdict-badge pass">
              ✓ Pass
            </span>
          )}
          {asset.gateVerdict === "fail" && (
            <span className="gallery-inspector-verdict-badge fail">
              ✗ Fail
            </span>
          )}
          {asset.gateVerdict === "pending" && (
            <span className="gallery-inspector-verdict-badge pending">
              ○ Pending
            </span>
          )}
          {!asset.gateVerdict && (
            <span className="gallery-inspector-verdict-badge unknown">
              — Not evaluated
            </span>
          )}
        </div>
      </div>

      {/* Overall Fitness */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Overall Fitness</span>
        <div className="gallery-inspector-fitness-bar">
          <div
            className="gallery-inspector-fitness-fill"
            style={{
              width: `${asset.fitness * 100}%`,
              background:
                asset.fitness >= 0.7
                  ? "var(--signal-success)"
                  : asset.fitness >= 0.4
                  ? "var(--signal-warning)"
                  : "var(--signal-error)",
            }}
          />
          <span className="gallery-inspector-fitness-value">
            {(asset.fitness * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Critic Scores */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">
          Critic Scores {hasScores && `(${scoreEntries.length})`}
        </span>
        {hasScores ? (
          <div className="gallery-inspector-critics">
            {scoreEntries.map(([name, score]) => {
              const scorePercent = score * 100;
              const scoreColor =
                score >= 0.7
                  ? "var(--signal-success)"
                  : score >= 0.4
                  ? "var(--signal-warning)"
                  : "var(--signal-error)";

              return (
                <div key={name} className="gallery-inspector-critic">
                  <div className="gallery-inspector-critic-header">
                    <span className="gallery-inspector-critic-name">{name}</span>
                    <span
                      className="gallery-inspector-critic-score"
                      style={{ color: scoreColor }}
                    >
                      {scorePercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="gallery-inspector-critic-bar">
                    <div
                      className="gallery-inspector-critic-fill"
                      style={{
                        width: `${scorePercent}%`,
                        background: scoreColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="gallery-inspector-no-critics">
            No critic scores available
          </div>
        )}
      </div>

      {/* Pass/Fail Status */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Threshold Check</span>
        <div className="gallery-inspector-threshold">
          {asset.passed ? (
            <span className="gallery-inspector-threshold-pass">
              ✓ Passed threshold
            </span>
          ) : (
            <span className="gallery-inspector-threshold-fail">
              ✗ Below threshold
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default GatesTab;
