import { motion } from "framer-motion";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import { cn } from "../../../lib/utils";

export interface AudioPlayerProps {
  title: string;
  episodeNumber: number | string;
  audioUrl?: string;
  className?: string;
  onClose?: () => void;
}

export const AudioPlayer = ({
  title,
  episodeNumber,
  className,
  onClose,
}: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Mock waveform bars
  const waveformBars = Array.from({ length: 40 }).map(() => ({
    height: 20 + Math.random() * 30,
  }));

  return (
    <div
      className={cn(
        "w-full max-w-3xl mx-auto bg-black/80 backdrop-blur-xl border-t border-white/10 shadow-2xl",
        className
      )}
    >
      {/* Progress Bar - Top Edge */}
      <div className="w-full h-1 bg-white/10 cursor-pointer group">
        <div className="h-full bg-cyan-neon w-1/3 relative">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-cyan-neon rounded-full opacity-0 group-hover:opacity-100 shadow-[0_0_10px_var(--cyan-neon)] transition-opacity" />
        </div>
      </div>

      <div className="p-4 md:p-6 flex items-center gap-6">
        {/* Play/Pause Control */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="relative group flex-shrink-0"
        >
          <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center bg-black/50 group-hover:border-cyan-neon/50 transition-colors">
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current text-white" />
            ) : (
              <Play className="w-6 h-6 fill-current text-white ml-1" />
            )}
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono tracking-widest text-neutral-500 group-hover:text-cyan-neon transition-colors">
            {isPlaying ? "HALT" : "EXECUTE"}
          </div>
        </button>

        {/* Info & Waveform */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col">
              <span className="text-xs font-mono text-cyan-neon">
                OOS-{String(episodeNumber).padStart(3, "0")}
              </span>
              <h4 className="text-white font-bold truncate pr-4">{title}</h4>
            </div>
            <div className="flex items-center gap-4">
                <button className="text-neutral-500 hover:text-white transition-colors">
                    <SkipBack className="w-5 h-5" />
                </button>
                <button className="text-neutral-500 hover:text-white transition-colors">
                    <SkipForward className="w-5 h-5" />
                </button>
            </div>
          </div>

          {/* Visual Waveform */}
          <div className="h-12 flex items-center gap-[2px] opacity-80 overflow-hidden mask-gradient-r">
            {waveformBars.map((bar, i) => (
              <motion.div
                key={i}
                className={cn(
                  "w-1 rounded-full",
                  isPlaying ? "bg-cyan-neon" : "bg-neutral-700"
                )}
                initial={{ height: bar.height }}
                animate={{
                  height: isPlaying
                    ? [bar.height, bar.height * 0.5, bar.height]
                    : bar.height,
                }}
                transition={{
                  duration: 0.5,
                  repeat: Infinity,
                  delay: i * 0.05,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </div>

        {/* Close Button (Mobile only mostly, or explicit close) */}
        {onClose && (
            <button 
                onClick={onClose}
                className="text-neutral-500 hover:text-red-400 text-xs font-mono hidden md:block"
            >
                [CLOSE]
            </button>
        )}
      </div>
    </div>
  );
};

