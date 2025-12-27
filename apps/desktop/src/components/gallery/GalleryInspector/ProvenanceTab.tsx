import { memo } from "react";
import type { GalleryAsset } from "@/types/ui";

interface ProvenanceTabProps {
  asset: GalleryAsset | null;
}

export const ProvenanceTab = memo(function ProvenanceTab({ asset }: ProvenanceTabProps) {
  if (!asset) {
    return (
      <div className="gallery-inspector-empty">
        <span className="gallery-inspector-empty-icon">🌳</span>
        <span>Select an asset to view provenance</span>
      </div>
    );
  }

  const createdDate = new Date(asset.createdAt);
  const updatedDate = new Date(asset.updatedAt);

  return (
    <div className="gallery-inspector-tab-content">
      {/* Generation Lineage */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Lineage</span>
        <div className="gallery-inspector-lineage">
          <div className="gallery-inspector-lineage-item current">
            <span className="gallery-inspector-lineage-gen">Gen {asset.generation}</span>
            <span className="gallery-inspector-lineage-label">Current</span>
          </div>
          {asset.parentId && (
            <>
              <div className="gallery-inspector-lineage-arrow">↑</div>
              <div className="gallery-inspector-lineage-item parent">
                <span className="gallery-inspector-lineage-gen">Gen {asset.generation - 1}</span>
                <span className="gallery-inspector-lineage-label">Parent</span>
                <code className="gallery-inspector-lineage-id">
                  {asset.parentId.slice(0, 8)}...
                </code>
              </div>
            </>
          )}
        </div>
      </div>

      {/* World Origin */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">World</span>
        <div className="gallery-inspector-world-info">
          <span className="gallery-inspector-world-name">🌍 {asset.world}</span>
        </div>
      </div>

      {/* Run Info */}
      {asset.runId && (
        <div className="gallery-inspector-section">
          <span className="gallery-inspector-section-label">Source Run</span>
          <code className="gallery-inspector-run-id">{asset.runId}</code>
        </div>
      )}

      {/* Timestamps */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Timeline</span>
        <div className="gallery-inspector-timeline">
          <div className="gallery-inspector-timeline-item">
            <span className="gallery-inspector-timeline-label">Created</span>
            <span className="gallery-inspector-timeline-value">
              {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString()}
            </span>
          </div>
          <div className="gallery-inspector-timeline-item">
            <span className="gallery-inspector-timeline-label">Updated</span>
            <span className="gallery-inspector-timeline-value">
              {updatedDate.toLocaleDateString()} {updatedDate.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Mutation Type Placeholder */}
      <div className="gallery-inspector-section">
        <span className="gallery-inspector-section-label">Mutation</span>
        <div className="gallery-inspector-mutation-info">
          <span className="gallery-inspector-mutation-type">
            {asset.parentId ? "🧬 Evolved" : "✨ Initial"}
          </span>
        </div>
      </div>
    </div>
  );
});

export default ProvenanceTab;
