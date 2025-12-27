import React from "react";
import { Button as BaseButton } from "@oos/ag-ui-ext";
import { cn } from "@/lib/utils";

type BaseButtonVariant = React.ComponentProps<typeof BaseButton>["variant"];

interface ButtonProps extends React.ComponentProps<typeof BaseButton> {
  children?: React.ReactNode;
  variant?: "default" | "primary" | "outline" | "ghost" | "destructive";
}

/**
 * Desktop app Button - wraps `@oos/ag-ui-ext` Button with legacy variant mapping
 *
 * Legacy mapping:
 * - 'primary' → `@oos/ag-ui-ext` 'default' (filled primary color)
 * - 'default' → `@oos/ag-ui-ext` 'outline' (outlined)
 */
export function Button({ variant = "default", className, ...props }: ButtonProps) {
  // Map legacy 'primary' to `@oos/ag-ui-ext` 'default' (filled primary color)
  // Map legacy 'default' to `@oos/ag-ui-ext` 'outline' (outlined)
  const mappedVariant: BaseButtonVariant =
    variant === "primary" ? "default" : variant === "default" ? "outline" : variant;

  return <BaseButton variant={mappedVariant} className={cn(className)} {...props} />;
}
