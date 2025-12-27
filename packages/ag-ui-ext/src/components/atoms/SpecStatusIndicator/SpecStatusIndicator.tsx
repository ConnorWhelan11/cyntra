import { cn } from "@/lib/utils";

export interface SpecStatusIndicatorProps {
  status?: string;
  severity?: "low" | "medium" | "high" | "critical";
  className?: string;
}

export const SpecStatusIndicator = ({
  status = "SPEC STATUS: FAILING",
  severity = "critical",
  className,
}: SpecStatusIndicatorProps) => {
  const colorClass =
    severity === "critical"
      ? "bg-red-500 shadow-[0_0_10px_red]"
      : severity === "high"
        ? "bg-orange-500 shadow-[0_0_10px_orange]"
        : severity === "medium"
          ? "bg-yellow-500"
          : "bg-green-500";

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded bg-black/80 border border-white/10 backdrop-blur-md font-mono text-[10px] tracking-wider",
        className
      )}
    >
      <div className="relative flex h-2 w-2">
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            colorClass
          )}
        ></span>
        <span className={cn("relative inline-flex rounded-full h-2 w-2", colorClass)}></span>
      </div>
      <span className="text-neutral-300 uppercase">{status}</span>
    </div>
  );
};
