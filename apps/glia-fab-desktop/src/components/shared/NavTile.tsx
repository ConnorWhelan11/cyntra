import React, { useState } from "react";
import { SigilIcon } from "./SigilIcon";
import { DiamondFrame } from "./DiamondFrame";
import type { SigilName } from "./sigils";

export type NavStatus = "running" | "error" | "attention" | null;

interface NavTileProps {
  /** Sigil name to display */
  sigil: SigilName;
  /** Label for accessibility and tooltip */
  label: string;
  /** Is this tile currently active/selected */
  active?: boolean;
  /** Is this tile disabled */
  disabled?: boolean;
  /** System status indicator */
  status?: NavStatus;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * NavTile - Composite navigation tile
 *
 * Combines DiamondFrame + SigilIcon with state management.
 * Handles hover, active, disabled, and system status states.
 */
export function NavTile({
  sigil,
  label,
  active = false,
  disabled = false,
  status = null,
  onClick,
  className = "",
}: NavTileProps) {
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = () => {
    if (!disabled) setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && !disabled && onClick) {
      e.preventDefault();
      onClick();
    }
  };

  // Build class names
  const tileClasses = [
    "nav-tile",
    active && "nav-tile--active",
    hovered && "nav-tile--hovered",
    disabled && "nav-tile--disabled",
    status && `nav-tile--status-${status}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={tileClasses}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled}
    >
      {/* Diamond containment frame */}
      <DiamondFrame
        size={32}
        active={active}
        hovered={hovered}
        className="nav-tile-diamond"
      />

      {/* Sigil icon */}
      <SigilIcon name={sigil} size={24} className="nav-tile-sigil" />

      {/* Status indicator overlays */}
      {status === "running" && <StatusOrbitDot />}
      {status === "error" && <StatusFracture />}
      {status === "attention" && <StatusPulseRing />}
    </button>
  );
}

/**
 * StatusOrbitDot - Running state indicator
 * Cyan dot that orbits the diamond frame
 */
function StatusOrbitDot() {
  return (
    <span className="status-orbit-dot" aria-hidden="true">
      <span className="status-orbit-dot-inner" />
    </span>
  );
}

/**
 * StatusFracture - Error state indicator
 * Angular break mark on the diamond corner
 */
function StatusFracture() {
  return (
    <svg
      className="status-fracture"
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
    >
      <path
        d="M 0 4 L 4 0 L 4 2 L 6 2 L 8 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * StatusPulseRing - Attention state indicator
 * Expanding ring from diamond edge
 */
function StatusPulseRing() {
  return <span className="status-pulse-ring" aria-hidden="true" />;
}

export default NavTile;
