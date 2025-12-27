import React from "react";
import { Badge as BaseBadge } from "@oos/ag-ui-ext";
import { cn } from "@/lib/utils";

type BaseBadgeVariant = React.ComponentProps<typeof BaseBadge>["variant"];

interface BadgeProps extends React.ComponentProps<typeof BaseBadge> {
  children?: React.ReactNode;
  status?: "ready" | "done" | "success" | "failed" | "fail" | "blocked" | "running" | "escalated";
}

/**
 * Desktop app Badge - wraps `@oos/ag-ui-ext` Badge with status-to-variant mapping
 *
 * Status mapping:
 * - ready/done/success → 'default' variant (green)
 * - failed/fail/blocked/escalated → 'destructive' variant (red)
 * - running → 'secondary' variant (accent color)
 */
export function Badge({ status, className, children, variant, ...props }: BadgeProps) {
  // Map status to `@oos/ag-ui-ext` variants
  const statusVariant: BaseBadgeVariant =
    status === "ready" || status === "done" || status === "success"
      ? "default"
      : status === "failed" || status === "fail" || status === "blocked" || status === "escalated"
        ? "destructive"
        : status === "running"
          ? "secondary"
          : undefined;

  return (
    <BaseBadge
      variant={variant ?? statusVariant}
      className={cn(
        status && `badge-${status}`, // Preserve status classes for custom styling
        className
      )}
      {...props}
    >
      {children}
    </BaseBadge>
  );
}
