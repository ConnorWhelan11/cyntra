import React from "react";
import { Badge as BaseBadge } from "@oos/ui";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.ComponentProps<typeof BaseBadge> {
  children?: React.ReactNode;
  status?: 'ready' | 'done' | 'success' | 'failed' | 'fail' | 'blocked' | 'running' | 'escalated';
}

/**
 * Desktop app Badge - wraps @oos/ui Badge with status-to-variant mapping
 *
 * Status mapping:
 * - ready/done/success → 'default' variant (green)
 * - failed/fail/blocked/escalated → 'destructive' variant (red)
 * - running → 'secondary' variant (accent color)
 */
export function Badge({
  status,
  className,
  children,
  variant,
  ...props
}: BadgeProps) {
  // Map status to @oos/ui variants
  const statusVariant = status === 'ready' || status === 'done' || status === 'success'
    ? 'default'
    : status === 'failed' || status === 'fail' || status === 'blocked' || status === 'escalated'
    ? 'destructive'
    : status === 'running'
    ? 'secondary'
    : undefined;

  return (
    <BaseBadge
      variant={(variant || statusVariant) as any}
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
