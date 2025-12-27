import React from "react";
import type { SigilName } from "./sigils";
import {
  Cosmograph,
  Hexcore,
  Helix,
  Neuron,
  Prompt,
  Aperture,
  Cog,
  Search,
  Flow,
  Viewport,
  Stage,
  Gameplay,
} from "./sigils";

interface SigilIconProps {
  /** Sigil name to render */
  name: SigilName;
  /** Size in pixels (default 24) */
  size?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SigilIcon - Renders a Cyntra sigil by name
 *
 * Usage:
 * ```tsx
 * <SigilIcon name="cosmograph" size={24} />
 * <SigilIcon name="hexcore" className="text-accent" />
 * ```
 */
export function SigilIcon({ name, size = 24, className }: SigilIconProps) {
  const props = { size, className };

  switch (name) {
    case "cosmograph":
      return <Cosmograph {...props} />;
    case "hexcore":
      return <Hexcore {...props} />;
    case "helix":
      return <Helix {...props} />;
    case "neuron":
      return <Neuron {...props} />;
    case "prompt":
      return <Prompt {...props} />;
    case "aperture":
      return <Aperture {...props} />;
    case "cog":
      return <Cog {...props} />;
    case "search":
      return <Search {...props} />;
    case "flow":
      return <Flow {...props} />;
    case "viewport":
      return <Viewport {...props} />;
    case "stage":
      return <Stage {...props} />;
    case "gameplay":
      return <Gameplay {...props} />;
    default:
      // Fallback for unknown sigils
      console.warn(`Unknown sigil: ${name}`);
      return null;
  }
}

export default SigilIcon;
