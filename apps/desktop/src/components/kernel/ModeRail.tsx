import React from "react";
import type { ConstellationMode, ConstellationStateReturn } from "./useConstellationState";
import { TOOLCHAIN_COLORS } from "./useConstellationState";

interface ModeRailProps {
  state: ConstellationStateReturn;
  issueCount: number;
  workcellCount: number;
  runningCount: number;
  failedCount: number;
}

interface ModeButtonProps {
  mode: ConstellationMode;
  icon: string;
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}

function ModeButton({ mode, icon, label, count, isActive, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      className={`mode-rail-button ${isActive ? "active" : ""}`}
      onClick={onClick}
      title={label}
      data-mode={mode}
    >
      <span className="mode-rail-button-icon">{icon}</span>
      <span className="mode-rail-button-label">{label}</span>
      {count !== undefined && count > 0 && <span className="mode-rail-button-badge">{count}</span>}
    </button>
  );
}

interface FilterChipProps {
  label: string;
  color?: string;
  isActive: boolean;
  onClick: () => void;
}

function FilterChip({ label, color, isActive, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`mode-rail-filter ${isActive ? "active" : ""}`}
      onClick={onClick}
      style={color ? ({ "--chip-color": color } as React.CSSProperties) : undefined}
    >
      {color && <span className="mode-rail-filter-dot" />}
      <span className="mode-rail-filter-label">{label}</span>
    </button>
  );
}

/**
 * Left vertical rail with mode selection and filters.
 * 64px wide, spans full height.
 */
export function ModeRail({
  state,
  issueCount,
  workcellCount,
  runningCount,
  failedCount,
}: ModeRailProps) {
  const toolchains = Object.keys(TOOLCHAIN_COLORS).filter((k) => k !== "default");

  return (
    <div className="mode-rail">
      {/* Mode Section */}
      <div className="mode-rail-section">
        <span className="mode-rail-section-label">Mode</span>

        <ModeButton
          mode="browse"
          icon="🔭"
          label="Browse"
          count={workcellCount}
          isActive={state.mode === "browse"}
          onClick={() => state.setMode("browse")}
        />

        <ModeButton
          mode="watch"
          icon="👁"
          label="Watch"
          count={runningCount}
          isActive={state.mode === "watch"}
          onClick={() => state.setMode("watch")}
        />

        <ModeButton
          mode="triage"
          icon="⚠"
          label="Triage"
          count={failedCount}
          isActive={state.mode === "triage"}
          onClick={() => state.setMode("triage")}
        />
      </div>

      {/* Toolchain Filter Section */}
      <div className="mode-rail-section">
        <span className="mode-rail-section-label">Toolchain</span>

        <FilterChip
          label="All"
          isActive={state.filterToolchain === null}
          onClick={() => state.setFilterToolchain(null)}
        />

        {toolchains.map((tc) => (
          <FilterChip
            key={tc}
            label={tc}
            color={TOOLCHAIN_COLORS[tc]}
            isActive={state.filterToolchain === tc}
            onClick={() => state.setFilterToolchain(state.filterToolchain === tc ? null : tc)}
          />
        ))}
      </div>

      {/* Status Filter Section */}
      <div className="mode-rail-section">
        <span className="mode-rail-section-label">Status</span>

        <FilterChip
          label="All"
          isActive={state.filterStatus === null}
          onClick={() => state.setFilterStatus(null)}
        />

        <FilterChip
          label="Running"
          color="var(--color-accent-cyan)"
          isActive={state.filterStatus === "running"}
          onClick={() => state.setFilterStatus(state.filterStatus === "running" ? null : "running")}
        />

        <FilterChip
          label="Failed"
          color="var(--color-status-error)"
          isActive={state.filterStatus === "failed"}
          onClick={() => state.setFilterStatus(state.filterStatus === "failed" ? null : "failed")}
        />

        <FilterChip
          label="Success"
          color="var(--color-status-success)"
          isActive={state.filterStatus === "success"}
          onClick={() => state.setFilterStatus(state.filterStatus === "success" ? null : "success")}
        />
      </div>

      {/* Stats */}
      <div className="mode-rail-stats">
        <div className="mode-rail-stat">
          <span className="mode-rail-stat-value">{issueCount}</span>
          <span className="mode-rail-stat-label">Issues</span>
        </div>
        <div className="mode-rail-stat">
          <span className="mode-rail-stat-value">{workcellCount}</span>
          <span className="mode-rail-stat-label">Workcells</span>
        </div>
      </div>
    </div>
  );
}
