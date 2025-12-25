import { memo, type ReactNode } from "react";

interface GalleryLayoutProps {
  stage: ReactNode;
  lensRail: ReactNode;
  assetStrip: ReactNode;
  inspector: ReactNode;
  inspectorOpen: boolean;
}

/**
 * GalleryLayout - CSS Grid shell for the Holodeck Gallery
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────┐
 * │  ┌─────┐ ┌────────────────────────────┐ ┌─────────────┐  │
 * │  │     │ │                            │ │             │  │
 * │  │Lens │ │       Holodeck Stage       │ │  Inspector  │  │
 * │  │Rail │ │          (60-70%)          │ │   Drawer    │  │
 * │  │     │ │                            │ │   (320px)   │  │
 * │  │48px │ │                            │ │             │  │
 * │  └─────┘ └────────────────────────────┘ └─────────────┘  │
 * │  ┌────────────────────────────────────────────────────┐  │
 * │  │                 Asset Strip (25-35%)               │  │
 * │  │               Virtualized Grid View                │  │
 * │  └────────────────────────────────────────────────────┘  │
 * └──────────────────────────────────────────────────────────┘
 */
export const GalleryLayout = memo(function GalleryLayout({
  stage,
  lensRail,
  assetStrip,
  inspector,
  inspectorOpen,
}: GalleryLayoutProps) {
  return (
    <div
      className={`gallery-layout ${inspectorOpen ? "inspector-open" : ""}`}
    >
      {/* Main area: lens rail + stage + inspector */}
      <div className="gallery-layout-main">
        {/* Lens Rail */}
        <aside className="gallery-layout-lens-rail">
          {lensRail}
        </aside>

        {/* Stage Container */}
        <div className="gallery-layout-stage">
          {stage}
        </div>

        {/* Inspector Drawer */}
        <aside
          className={`gallery-layout-inspector ${inspectorOpen ? "open" : ""}`}
        >
          {inspector}
        </aside>
      </div>

      {/* Asset Strip (bottom) */}
      <div className="gallery-layout-strip">
        {assetStrip}
      </div>
    </div>
  );
});

export default GalleryLayout;
