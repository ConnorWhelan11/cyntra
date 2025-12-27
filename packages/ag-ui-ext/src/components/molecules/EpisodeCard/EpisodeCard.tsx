import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Bug, Brain, Cpu, Play } from "lucide-react";

export type EpisodeTrack = "HUMAN" | "MODEL" | "BRIDGE";

export interface EpisodeCardProps {
  number: string | number;
  title: string;
  description: string;
  track: EpisodeTrack;
  tags?: string[];
  severity?: "S1" | "S2" | "S3" | "S4";
  duration?: string;
  onClick?: () => void;
  className?: string;
}

const trackColors = {
  HUMAN: "border-cyan-neon text-cyan-neon shadow-neon-cyan",
  MODEL: "border-magenta-neon text-magenta-neon shadow-neon-magenta",
  BRIDGE: "border-emerald-neon text-emerald-neon shadow-neon-emerald",
};

const trackIcons = {
  HUMAN: <Brain className="w-4 h-4" />,
  MODEL: <Cpu className="w-4 h-4" />,
  BRIDGE: <Bug className="w-4 h-4" />,
};

export const EpisodeCard = ({
  number,
  title,
  description,
  track,
  tags = [],
  severity = "S3",
  duration,
  onClick,
  className,
}: EpisodeCardProps) => {
  return (
    <motion.div
      whileHover={{
        scale: 1.02,
        rotate: -1,
        y: -4,
      }}
      className={cn(
        "relative group cursor-pointer bg-black/40 backdrop-blur-md border border-white/10 overflow-hidden rounded-lg",
        className
      )}
      onClick={onClick}
    >
      {/* Top strip - Jira ticket style */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-sm border bg-black/50",
              trackColors[track]
            )}
          >
            {trackIcons[track]}
            {track}
          </span>
          <span>OOS-{String(number).padStart(3, "0")}</span>
        </div>
        <div className="flex items-center gap-2">
          {duration && <span className="text-neutral-500 text-[10px] font-mono">{duration}</span>}
          {severity && (
            <span
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                severity === "S1"
                  ? "bg-red-900/50 text-red-400 border border-red-800"
                  : severity === "S2"
                    ? "bg-orange-900/50 text-orange-400 border border-orange-800"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
              )}
            >
              {severity}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <h3 className="text-lg font-bold text-white group-hover:text-cyan-neon transition-colors line-clamp-2">
          {title}
        </h3>
        <p className="text-sm text-neutral-400 line-clamp-3">{description}</p>

        {/* Footer tags */}
        <div className="flex flex-wrap gap-2 mt-4 pt-2 border-t border-white/5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-1 rounded-full bg-white/5 text-neutral-400 border border-white/5"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Hover reveal - Glitch overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-cyan-neon/5 to-magenta-neon/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Play overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-black/80 backdrop-blur rounded-full p-3 border border-white/20 shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-transform">
          <Play className="w-6 h-6 text-white fill-white" />
        </div>
      </div>

      {/* Side accent line */}
      <div
        className={cn(
          "absolute top-0 left-0 w-1 h-full transition-all opacity-50 group-hover:opacity-100",
          track === "HUMAN"
            ? "bg-cyan-neon shadow-[0_0_10px_var(--cyan-neon)]"
            : track === "MODEL"
              ? "bg-magenta-neon shadow-[0_0_10px_var(--magenta-neon)]"
              : "bg-emerald-neon shadow-[0_0_10px_var(--emerald-neon)]"
        )}
      />
    </motion.div>
  );
};
