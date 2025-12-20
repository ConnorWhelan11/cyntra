import { cn } from "@/lib/utils";

type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

/**
 * Panel container component with Tailwind styling
 */
export function Panel({ children, className, style, ...props }: PanelProps) {
  return (
    <div
      {...props}
      style={style}
      className={cn(
        "border border-border bg-card/60 backdrop-blur-sm rounded-2xl overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}
