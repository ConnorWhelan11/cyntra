import { memo } from "react";
import type { GalleryAsset } from "@/types/ui";

interface PlayabilityTabProps {
  asset: GalleryAsset | null;
}

/**
 * Format a metric as a percentage with color coding
 */
function MetricBar({
  label,
  value,
  inverted = false,
  threshold = 0.5,
}: {
  label: string;
  value: number;
  inverted?: boolean;
  threshold?: number;
}) {
  // For inverted metrics (like stuckRatio), lower is better
  const displayValue = inverted ? 1 - value : value;
  const percent = displayValue * 100;

  // Color based on whether value passes threshold
  const isGood = inverted ? value < threshold : value > threshold;
  const color = isGood
    ? "var(--signal-success)"
    : displayValue >= 0.4
      ? "var(--signal-warning)"
      : "var(--signal-error)";

  return (
    <div className="gallery-inspector-critic">
      <div className="gallery-inspector-critic-header">
        <span className="gallery-inspector-critic-name">{label}</span>
        <span className="gallery-inspector-critic-score" style={{ color }}>
          {percent.toFixed(0)}%
        </span>
      </div>
      <div className="gallery-inspector-critic-bar">
        <div
          className="gallery-inspector-critic-fill"
          style={{
            width: `${percent}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Format seconds as readable time
 */
function formatPlaytime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

export const PlayabilityTab = memo(function PlayabilityTab({ asset }: PlayabilityTabProps) {
  if (!asset) {
    return (
      <div className="gallery-inspector-empty">
        <span className="gallery-inspector-empty-icon">🎮</span>
        <span>Select an asset to view playability results</span>
      </div>
    );
  }

  const hasPlayabilityData = asset.playabilityVerdict && asset.playabilityVerdict !== "not_run";
  const metrics = asset.playabilityMetrics;

  return (
    <div className="gallery-inspector-tab-content">
      {/* Overall Verdict */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Playability Verdict</span>
        <div className="gallery-inspector-verdict">
          {asset.playabilityVerdict === "pass" && (
            <span className="gallery-inspector-verdict-badge pass">🎮 Playable</span>
          )}
          {asset.playabilityVerdict === "fail" && (
            <span className="gallery-inspector-verdict-badge fail">🚫 Not Playable</span>
          )}
          {asset.playabilityVerdict === "pending" && (
            <span className="gallery-inspector-verdict-badge pending">⏳ Testing...</span>
          )}
          {(!asset.playabilityVerdict || asset.playabilityVerdict === "not_run") && (
            <span className="gallery-inspector-verdict-badge unknown">— Not tested</span>
          )}
        </div>
      </div>

      {/* Overall Playability Score */}
      {asset.playabilityScore !== undefined && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">Playability Score</span>
          <div className="gallery-inspector-fitness-bar">
            <div
              className="gallery-inspector-fitness-fill"
              style={{
                width: `${asset.playabilityScore * 100}%`,
                background:
                  asset.playabilityScore >= 0.7
                    ? "var(--signal-success)"
                    : asset.playabilityScore >= 0.4
                      ? "var(--signal-warning)"
                      : "var(--signal-error)",
              }}
            />
            <span className="gallery-inspector-fitness-value">
              {(asset.playabilityScore * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Metrics Breakdown */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Gameplay Metrics</span>
        {metrics ? (
          <div className="gallery-inspector-critics">
            <MetricBar
              label="Movement Freedom"
              value={metrics.stuckRatio}
              inverted={true}
              threshold={0.3}
            />
            <MetricBar label="World Coverage" value={metrics.coverageEstimate} threshold={0.4} />
            <MetricBar label="Interaction Rate" value={metrics.interactionRate} threshold={0.05} />
            <div className="gallery-inspector-critic">
              <div className="gallery-inspector-critic-header">
                <span className="gallery-inspector-critic-name">Playtime</span>
                <span className="gallery-inspector-critic-score">
                  {formatPlaytime(metrics.totalPlaytimeSeconds)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="gallery-inspector-no-critics">No playability metrics available</div>
        )}
      </div>

      {/* Failures */}
      {asset.playabilityFailures && asset.playabilityFailures.length > 0 && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">
            Issues Found ({asset.playabilityFailures.length})
          </span>
          <div className="gallery-inspector-failures">
            {asset.playabilityFailures.map((failure, i) => (
              <div key={i} className="gallery-inspector-failure-item">
                <span className="gallery-inspector-failure-icon">❌</span>
                <span className="gallery-inspector-failure-text">{formatFailureCode(failure)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {asset.playabilityWarnings && asset.playabilityWarnings.length > 0 && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">
            Warnings ({asset.playabilityWarnings.length})
          </span>
          <div className="gallery-inspector-warnings">
            {asset.playabilityWarnings.map((warning, i) => (
              <div key={i} className="gallery-inspector-warning-item">
                <span className="gallery-inspector-warning-icon">⚠️</span>
                <span className="gallery-inspector-warning-text">{warning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run info */}
      {hasPlayabilityData && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">Test Info</span>
          <div className="gallery-inspector-info-grid">
            <span className="gallery-inspector-info-label">Tested by</span>
            <span className="gallery-inspector-info-value">NitroGen (NVIDIA)</span>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Convert failure codes to human-readable text
 */
function formatFailureCode(code: string): string {
  const codeMap: Record<string, string> = {
    PLAY_STUCK_TOO_LONG: "Character gets stuck too often",
    PLAY_NO_EXPLORATION: "Unable to explore the world",
    PLAY_LOW_COVERAGE: "Low world coverage",
    PLAY_NO_INTERACTIONS: "Cannot interact with objects",
    PLAY_CRASH_DETECTED: "Game crashed during testing",
    PLAY_NITROGEN_TIMEOUT: "AI tester connection timeout",
  };
  return codeMap[code] || code;
}

export default PlayabilityTab;
