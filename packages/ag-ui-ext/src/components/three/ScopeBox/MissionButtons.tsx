import { motion } from "framer-motion";
import type { IntroVariant, MissionButtonLabels } from "./types";

/** Default button labels per variant */
const BUTTON_LABELS: Record<IntroVariant, MissionButtonLabels> = {
  "glia-premed": {
    primary: "LOCK IN",
    secondary: "LINK UP",
  },
  default: {
    primary: "+ Create",
    secondary: "Join",
  },
};

export interface MissionButtonsProps {
  onCreateMission?: () => void;
  onResumeMission?: () => void;
  /** Override default labels */
  labels?: Partial<MissionButtonLabels>;
  /** Variant determines default labels if not overridden */
  variant?: IntroVariant;
  onBrowse?: () => void;
  onCustomize?: () => void;
  onTour?: () => void;
}

export const MissionButtons = ({
  onCreateMission,
  onResumeMission,
  labels,
  variant = "glia-premed",
  onBrowse,
  onCustomize,
  onTour,
}: MissionButtonsProps) => {
  // Merge variant defaults with any explicit overrides
  const defaultLabels = BUTTON_LABELS[variant] || BUTTON_LABELS["glia-premed"];
  const merged = { ...defaultLabels, ...labels };

  const primaryLabel = merged.primary;
  const secondaryLabel = merged.secondary;
  const primarySubLabel = merged.primarySubLabel ?? "Solo run";
  const secondarySubLabel = merged.secondarySubLabel ?? "Join pod run";

  return (
    <motion.div
      key="mission-buttons"
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      // slightly scaled down so it feels like it's sitting *inside* the slab
      className="flex flex-col items-center gap-1 scale-[0.64] sm:scale-[0.72]"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onCreateMission) {
            onCreateMission();
          } else {
            console.log("onCreateMission");
          }
        }}
        className="
          group relative flex w-[115px] items-center justify-center flex-col
          rounded-full border border-cyan-400/70 bg-cyan-900/40
          px-3 py-1.35 text-[8px] font-bold uppercase tracking-[0.15em]
          text-white shadow-[0_0_22px_rgba(34,211,238,0.55)]
          hover:border-cyan-300 hover:bg-cyan-800/70
          hover:shadow-[0_0_28px_rgba(34,211,238,0.9)]
          active:scale-95 active:shadow-[0_0_18px_rgba(34,211,238,0.7)]
          transition-all duration-200
        "
      >
        <span>{primaryLabel}</span>
        {primarySubLabel && (
          <span className="mt-0.5 text-[6.6px] font-medium tracking-[0.14em] text-cyan-100/80">
            {primarySubLabel}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onResumeMission) {
            onResumeMission();
          } else {
            console.log("onResumeMission");
          }
        }}
        className="
          group relative flex w-[115px] items-center justify-center flex-col
          rounded-full border border-white/18 bg-black/45
          px-3 py-1.35 text-[8px] font-semibold uppercase tracking-[0.15em]
          text-slate-200
          hover:border-cyan-300/60 hover:text-white hover:bg-black/70
          hover:shadow-[0_0_18px_rgba(34,211,238,0.4)]
          active:scale-95
          transition-all duration-200
        "
      >
        <span>{secondaryLabel}</span>
        {secondarySubLabel && (
          <span className="mt-0.5 text-[6.6px] font-medium tracking-[0.14em] text-slate-300/70">
            {secondarySubLabel}
          </span>
        )}
      </button>

      <div
        className="
          mt-3.5 flex items-center justify-center gap-1.25
          text-[6.2px] uppercase tracking-[0.11em] text-slate-300/70
          scale-[0.9]
        "
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onBrowse) {
              onBrowse();
            } else {
              console.log("Browse missions");
            }
          }}
          className="transition-colors hover:text-cyan-200"
        >
          Browse
        </button>
        <span className="h-[1px] w-3 bg-slate-500/40" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onCustomize) {
              onCustomize();
            } else {
              console.log("Customize run");
            }
          }}
          className="transition-colors hover:text-cyan-200"
        >
          Customize
        </button>
        <span className="h-[1px] w-3 bg-slate-500/40" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onTour) {
              onTour();
            } else {
              console.log("wthelly? tour");
            }
          }}
          className="transition-colors hover:text-fuchsia-300"
        >
          wthelly?
        </button>
      </div>
    </motion.div>
  );
};
