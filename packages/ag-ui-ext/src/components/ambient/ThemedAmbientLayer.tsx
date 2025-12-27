"use client";

import { useAmbientTokens, useUiTheme } from "../../theme";
import { DustMotesLayer } from "./DustMotesLayer";
import { NebulaStarsLayer } from "./NebulaStarsLayer";

export interface ThemedAmbientLayerProps {
  /** Additional className */
  className?: string;
  /** Force a specific ambient type (override theme) */
  forceType?: "nebula-stars" | "dust-motes";
  /** Disable the ambient layer */
  disabled?: boolean;
}

/**
 * Theme-aware ambient background layer.
 * Automatically switches between Nebula stars and Solarpunk dust motes
 * based on the current UI theme.
 */
export function ThemedAmbientLayer({
  className,
  forceType,
  disabled = false,
}: ThemedAmbientLayerProps) {
  const { isHydrating } = useUiTheme();
  const ambientTokens = useAmbientTokens();

  // Don't render during hydration to prevent flash
  if (isHydrating || disabled) {
    return null;
  }

  const ambientType = forceType ?? ambientTokens.type;

  if (ambientType === "dust-motes") {
    return <DustMotesLayer className={className} />;
  }

  return <NebulaStarsLayer className={className} />;
}
