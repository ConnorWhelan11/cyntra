import React from "react";
import { cn } from "@/lib/utils";

interface SplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  columns?: string;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Two-column split view layout
 */
export function SplitView({
  left,
  right,
  columns = "340px 1fr",
  style,
  className,
}: SplitViewProps) {
  return (
    <div
      className={cn("grid h-full", className)}
      style={{ gridTemplateColumns: columns, ...style }}
    >
      {left}
      {right}
    </div>
  );
}
