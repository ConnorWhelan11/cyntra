import React from "react";
import { cn } from "@/lib/utils";

interface PanelHeaderProps {
  title: string | React.ReactNode;
  actions?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}

/**
 * Panel header component with title and optional actions
 */
export function PanelHeader({ title, actions, subtitle, className }: PanelHeaderProps) {
  return (
    <div className={cn("px-3.5 py-3 border-b border-border flex items-center justify-between", className)}>
      <div>
        <div className="font-semibold">{title}</div>
        {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2.5 items-center">{actions}</div>}
    </div>
  );
}
