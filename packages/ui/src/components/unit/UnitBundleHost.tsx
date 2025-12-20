"use client";

import { renderBundle } from "@_unit/unit/client/platform/web/render";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export interface UnitBundleHostProps {
  bundle: unknown;
  className?: string;
  onMounted?: (args: { system: unknown; graph: unknown }) => void;
}

/**
 * Minimal host to mount a Unit JSON bundle into a React tree.
 */
export function UnitBundleHost({
  bundle,
  className,
  onMounted,
}: UnitBundleHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cleanup: (() => void) | undefined;

    try {
      const [system, graph] = renderBundle(containerRef.current, bundle);
      onMounted?.({ system, graph });

      cleanup = () => {
        // TODO: wire a proper dispose call once Unit exposes a cleanup API.
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      };
    } catch (error) {
      console.error("Failed to render Unit bundle", error);
    }

    return cleanup;
  }, [bundle, onMounted]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-background/60 backdrop-blur-sm",
        className
      )}
    />
  );
}

