import React, { memo, useState, useCallback } from "react";
import type { AssetType, GalleryLensFilters } from "@/types/ui";
import { ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from "@/features/gallery/useGalleryState";

interface LensRailProps {
  filters: GalleryLensFilters;
  availableWorlds: string[];
  availableTags: string[];
  hasActiveFilters: boolean;
  onToggleType: (type: AssetType) => void;
  onToggleWorld: (world: string) => void;
  onToggleTag: (tag: string) => void;
  onSetFitnessRange: (range: [number, number]) => void;
  onSetHas3D: (has3D: boolean | null) => void;
  onClearFilters: () => void;
}

const ALL_TYPES: AssetType[] = [
  "building",
  "furniture",
  "vehicle",
  "lighting",
  "structure",
  "prop",
];

interface LensSectionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function LensSection({ title, isOpen, onToggle, children }: LensSectionProps) {
  return (
    <div className={`lens-section ${isOpen ? "open" : ""}`}>
      <button
        type="button"
        className="lens-section-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="lens-section-title">{title}</span>
        <span className="lens-section-chevron">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div className="lens-section-content">{children}</div>}
    </div>
  );
}

export const LensRail = memo(function LensRail({
  filters,
  availableWorlds,
  availableTags,
  hasActiveFilters,
  onToggleType,
  onToggleWorld,
  onToggleTag,
  onSetFitnessRange,
  onSetHas3D,
  onClearFilters,
}: LensRailProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    type: true,
    world: false,
    tags: false,
    fitness: false,
    options: false,
  });

  const toggleSection = useCallback((section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const handleFitnessMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const min = parseFloat(e.target.value);
      onSetFitnessRange([min, filters.fitnessRange[1]]);
    },
    [onSetFitnessRange, filters.fitnessRange]
  );

  const handleFitnessMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const max = parseFloat(e.target.value);
      onSetFitnessRange([filters.fitnessRange[0], max]);
    },
    [onSetFitnessRange, filters.fitnessRange]
  );

  return (
    <div className="lens-rail">
      {/* Header */}
      <div className="lens-rail-header">
        <span className="lens-rail-title">Lenses</span>
        {hasActiveFilters && (
          <button
            type="button"
            className="lens-rail-clear"
            onClick={onClearFilters}
            title="Clear all filters"
          >
            ✕
          </button>
        )}
      </div>

      {/* Type Section */}
      <LensSection title="Type" isOpen={openSections.type} onToggle={() => toggleSection("type")}>
        <div className="lens-chips">
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`lens-chip ${filters.types.includes(type) ? "active" : ""}`}
              onClick={() => onToggleType(type)}
              aria-pressed={filters.types.includes(type)}
            >
              <span className="lens-chip-icon">{ASSET_TYPE_ICONS[type]}</span>
              <span className="lens-chip-label">{ASSET_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </LensSection>

      {/* World Section */}
      {availableWorlds.length > 0 && (
        <LensSection
          title="World"
          isOpen={openSections.world}
          onToggle={() => toggleSection("world")}
        >
          <div className="lens-chips">
            {availableWorlds.map((world) => (
              <button
                key={world}
                type="button"
                className={`lens-chip ${filters.worlds.includes(world) ? "active" : ""}`}
                onClick={() => onToggleWorld(world)}
                aria-pressed={filters.worlds.includes(world)}
              >
                <span className="lens-chip-label">{world}</span>
              </button>
            ))}
          </div>
        </LensSection>
      )}

      {/* Tags Section */}
      {availableTags.length > 0 && (
        <LensSection title="Tags" isOpen={openSections.tags} onToggle={() => toggleSection("tags")}>
          <div className="lens-chips compact">
            {availableTags.slice(0, 12).map((tag) => (
              <button
                key={tag}
                type="button"
                className={`lens-chip small ${filters.tags.includes(tag) ? "active" : ""}`}
                onClick={() => onToggleTag(tag)}
                aria-pressed={filters.tags.includes(tag)}
              >
                {tag}
              </button>
            ))}
            {availableTags.length > 12 && (
              <span className="lens-chips-more">+{availableTags.length - 12} more</span>
            )}
          </div>
        </LensSection>
      )}

      {/* Fitness Section */}
      <LensSection
        title="Fitness"
        isOpen={openSections.fitness}
        onToggle={() => toggleSection("fitness")}
      >
        <div className="lens-fitness-range">
          <div className="lens-fitness-inputs">
            <label className="lens-fitness-input">
              <span>Min</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.fitnessRange[0]}
                onChange={handleFitnessMinChange}
              />
              <span className="lens-fitness-value">
                {(filters.fitnessRange[0] * 100).toFixed(0)}%
              </span>
            </label>
            <label className="lens-fitness-input">
              <span>Max</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.fitnessRange[1]}
                onChange={handleFitnessMaxChange}
              />
              <span className="lens-fitness-value">
                {(filters.fitnessRange[1] * 100).toFixed(0)}%
              </span>
            </label>
          </div>
        </div>
      </LensSection>

      {/* Options Section */}
      <LensSection
        title="Options"
        isOpen={openSections.options}
        onToggle={() => toggleSection("options")}
      >
        <div className="lens-options">
          <button
            type="button"
            className={`lens-toggle ${filters.has3D === true ? "active" : ""}`}
            onClick={() => onSetHas3D(filters.has3D === true ? null : true)}
            aria-pressed={filters.has3D === true}
          >
            <span className="lens-toggle-icon">📦</span>
            <span>Has 3D</span>
          </button>
          <button
            type="button"
            className={`lens-toggle ${filters.has3D === false ? "active" : ""}`}
            onClick={() => onSetHas3D(filters.has3D === false ? null : false)}
            aria-pressed={filters.has3D === false}
          >
            <span className="lens-toggle-icon">🖼</span>
            <span>2D Only</span>
          </button>
        </div>
      </LensSection>

      {/* Active filter count */}
      {hasActiveFilters && (
        <div className="lens-rail-footer">
          <span className="lens-active-count">
            {filters.types.length + filters.worlds.length + filters.tags.length} active
          </span>
        </div>
      )}
    </div>
  );
});

export default LensRail;
