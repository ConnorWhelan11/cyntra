import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface FilterPillsProps {
  filters: string[];
  activeFilter: string;
  onChange: (filter: string) => void;
  className?: string;
}

export const FilterPills = ({ filters, activeFilter, onChange, className }: FilterPillsProps) => {
  return (
    <div className={cn("flex flex-wrap gap-2 p-1", className)}>
      {filters.map((filter) => {
        const isActive = activeFilter === filter;
        return (
          <button
            key={filter}
            onClick={() => onChange(filter)}
            className={cn(
              "relative px-4 py-2 text-sm font-medium rounded-full transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-neon",
              isActive
                ? "text-black font-bold"
                : "text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeFilter"
                className="absolute inset-0 bg-gradient-to-r from-cyan-neon to-blue-500 rounded-full"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <span className="relative z-10">{filter}</span>
          </button>
        );
      })}
    </div>
  );
};
