import { Button as BaseButton } from "@oos/ui";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ComponentProps<typeof BaseButton> {
  children?: React.ReactNode;
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'destructive';
}

/**
 * Desktop app Button - wraps @oos/ui Button with legacy variant mapping
 *
 * Legacy mapping:
 * - 'primary' → @oos/ui 'default' (filled primary color)
 * - 'default' → @oos/ui 'outline' (outlined)
 */
export function Button({
  variant = 'default',
  className,
  ...props
}: ButtonProps) {
  // Map legacy 'primary' to @oos/ui 'default' (filled primary color)
  // Map legacy 'default' to @oos/ui 'outline' (outlined)
  const mappedVariant = variant === 'primary' ? 'default' :
                       variant === 'default' ? 'outline' : variant;

  return (
    <BaseButton
      variant={mappedVariant as any}
      className={cn(className)}
      {...props}
    />
  );
}
