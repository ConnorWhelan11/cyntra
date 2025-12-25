import { memo } from "react";
import type { GalleryAsset, GalleryInspectorTab } from "@/types/ui";
import { AssetTab } from "./AssetTab";
import { ProvenanceTab } from "./ProvenanceTab";
import { GatesTab } from "./GatesTab";
import { ActionsTab } from "./ActionsTab";

interface GalleryInspectorProps {
  isOpen: boolean;
  isPinned: boolean;
  activeTab: GalleryInspectorTab;
  asset: GalleryAsset | null;
  onClose: () => void;
  onPin: (pinned: boolean) => void;
  onTabChange: (tab: GalleryInspectorTab) => void;
  onOpenAsset?: (asset: GalleryAsset) => void;
  onExportAsset?: (asset: GalleryAsset) => void;
}

interface TabButtonProps {
  id: GalleryInspectorTab;
  label: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}

function TabButton({ id, label, icon, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      className={`gallery-inspector-tab ${isActive ? "active" : ""}`}
      onClick={onClick}
      data-tab={id}
      aria-selected={isActive}
      role="tab"
    >
      <span className="gallery-inspector-tab-icon">{icon}</span>
      <span className="gallery-inspector-tab-label">{label}</span>
    </button>
  );
}

export const GalleryInspector = memo(function GalleryInspector({
  isOpen,
  isPinned,
  activeTab,
  asset,
  onClose,
  onPin,
  onTabChange,
  onOpenAsset,
  onExportAsset,
}: GalleryInspectorProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={`gallery-inspector ${isPinned ? "pinned" : ""}`}>
      {/* Header */}
      <div className="gallery-inspector-header">
        <div className="gallery-inspector-header-left">
          {asset ? (
            <span className="gallery-inspector-title" title={asset.name}>
              {asset.name}
            </span>
          ) : (
            <span className="gallery-inspector-title empty">No Selection</span>
          )}
        </div>
        <div className="gallery-inspector-header-actions">
          <button
            type="button"
            className={`gallery-inspector-pin-btn ${isPinned ? "active" : ""}`}
            onClick={() => onPin(!isPinned)}
            title={isPinned ? "Unpin drawer" : "Pin drawer open"}
            aria-pressed={isPinned}
          >
            📌
          </button>
          <button
            type="button"
            className="gallery-inspector-close-btn"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close inspector"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="gallery-inspector-tabs" role="tablist">
        <TabButton
          id="asset"
          label="Asset"
          icon="📦"
          isActive={activeTab === "asset"}
          onClick={() => onTabChange("asset")}
        />
        <TabButton
          id="provenance"
          label="Provenance"
          icon="🌳"
          isActive={activeTab === "provenance"}
          onClick={() => onTabChange("provenance")}
        />
        <TabButton
          id="gates"
          label="Gates"
          icon="🔬"
          isActive={activeTab === "gates"}
          onClick={() => onTabChange("gates")}
        />
        <TabButton
          id="actions"
          label="Actions"
          icon="⚡"
          isActive={activeTab === "actions"}
          onClick={() => onTabChange("actions")}
        />
      </div>

      {/* Tab Content */}
      <div className="gallery-inspector-content" role="tabpanel">
        {activeTab === "asset" && <AssetTab asset={asset} />}
        {activeTab === "provenance" && <ProvenanceTab asset={asset} />}
        {activeTab === "gates" && <GatesTab asset={asset} />}
        {activeTab === "actions" && (
          <ActionsTab
            asset={asset}
            onOpen={onOpenAsset}
            onExport={onExportAsset}
          />
        )}
      </div>
    </div>
  );
});

export default GalleryInspector;
