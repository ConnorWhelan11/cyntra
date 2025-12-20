"use client";

import React from "react";
import { cn } from "../../lib/utils";

export type DrawboardSidebarProps = {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function DrawboardSidebar({
  title,
  description,
  actions,
  footer,
  children,
  className,
}: DrawboardSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && (
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="flex-1 overflow-auto pr-1">{children}</div>

      {footer && <div className="pt-2 border-t border-border/40">{footer}</div>}
    </aside>
  );
}

