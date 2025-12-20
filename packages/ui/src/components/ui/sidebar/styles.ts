import type { SidebarAccent } from "./types";

export const accentColorMap = {
  teal: {
    // Portal-like styling: brighter borders and stronger glow for "destination" feel
    border: "border-teal-500/30 hover:border-teal-400/50",
    shadow:
      "shadow-[0_0_12px_rgba(20,184,166,0.08)] hover:shadow-[0_0_24px_rgba(20,184,166,0.18)]",
    iconBg: "bg-teal-500/20",
    iconText: "text-teal-400",
    iconShadow: "shadow-[0_0_15px_rgba(20,184,166,0.25)]",
    iconHover:
      "group-hover/featured:bg-teal-500/30 group-hover/featured:shadow-[0_0_20px_rgba(20,184,166,0.35)]",
    orb: "bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.7)]",
    orbPing: "bg-teal-400",
    titleHover: "group-hover/featured:text-teal-100",
    line: "from-teal-500/40 via-teal-400/20",
    ctaText: "text-teal-500/50 group-hover/featured:text-teal-400/70",
    corner: "from-teal-400/15",
    ring: "focus-visible:ring-teal-400/50",
  },
  violet: {
    border: "border-violet-500/30 hover:border-violet-400/50",
    shadow:
      "shadow-[0_0_12px_rgba(139,92,246,0.08)] hover:shadow-[0_0_24px_rgba(139,92,246,0.18)]",
    iconBg: "bg-violet-500/20",
    iconText: "text-violet-400",
    iconShadow: "shadow-[0_0_15px_rgba(139,92,246,0.25)]",
    iconHover:
      "group-hover/featured:bg-violet-500/30 group-hover/featured:shadow-[0_0_20px_rgba(139,92,246,0.35)]",
    orb: "bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.7)]",
    orbPing: "bg-violet-400",
    titleHover: "group-hover/featured:text-violet-100",
    line: "from-violet-500/40 via-violet-400/20",
    ctaText: "text-violet-500/50 group-hover/featured:text-violet-400/70",
    corner: "from-violet-400/15",
    ring: "focus-visible:ring-violet-400/50",
  },
  amber: {
    border: "border-amber-500/30 hover:border-amber-400/50",
    shadow:
      "shadow-[0_0_12px_rgba(245,158,11,0.08)] hover:shadow-[0_0_24px_rgba(245,158,11,0.18)]",
    iconBg: "bg-amber-500/20",
    iconText: "text-amber-400",
    iconShadow: "shadow-[0_0_15px_rgba(245,158,11,0.25)]",
    iconHover:
      "group-hover/featured:bg-amber-500/30 group-hover/featured:shadow-[0_0_20px_rgba(245,158,11,0.35)]",
    orb: "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.7)]",
    orbPing: "bg-amber-400",
    titleHover: "group-hover/featured:text-amber-100",
    line: "from-amber-500/40 via-amber-400/20",
    ctaText: "text-amber-500/50 group-hover/featured:text-amber-400/70",
    corner: "from-amber-400/15",
    ring: "focus-visible:ring-amber-400/50",
  },
  rose: {
    border: "border-rose-500/30 hover:border-rose-400/50",
    shadow:
      "shadow-[0_0_12px_rgba(244,63,94,0.08)] hover:shadow-[0_0_24px_rgba(244,63,94,0.18)]",
    iconBg: "bg-rose-500/20",
    iconText: "text-rose-400",
    iconShadow: "shadow-[0_0_15px_rgba(244,63,94,0.25)]",
    iconHover:
      "group-hover/featured:bg-rose-500/30 group-hover/featured:shadow-[0_0_20px_rgba(244,63,94,0.35)]",
    orb: "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.7)]",
    orbPing: "bg-rose-400",
    titleHover: "group-hover/featured:text-rose-100",
    line: "from-rose-500/40 via-rose-400/20",
    ctaText: "text-rose-500/50 group-hover/featured:text-rose-400/70",
    corner: "from-rose-400/15",
    ring: "focus-visible:ring-rose-400/50",
  },
} as const;

export const getLinkAccentStyles = (accent: SidebarAccent) => {
  const accentStyles = {
    cyan: {
      rail: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]",
      iconHover:
        "group-hover/sidebar:text-cyan-300 group-hover/sidebar:drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]",
      iconActive: "text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]",
      labelHover: "group-hover/sidebar:text-cyan-100",
      labelActive: "text-cyan-100",
      orb: "bg-cyan-400/80 shadow-[0_0_6px_rgba(34,211,238,0.5)]",
      orbPulse: "bg-cyan-400",
    },
    moonlit_orchid: {
      rail: "bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.6)]",
      iconHover:
        "group-hover/sidebar:text-fuchsia-300 group-hover/sidebar:drop-shadow-[0_0_6px_rgba(217,70,239,0.5)]",
      iconActive: "text-fuchsia-300 drop-shadow-[0_0_8px_rgba(217,70,239,0.6)]",
      labelHover: "group-hover/sidebar:text-fuchsia-100",
      labelActive: "text-fuchsia-100",
      orb: "bg-fuchsia-400/80 shadow-[0_0_6px_rgba(217,70,239,0.5)]",
      orbPulse: "bg-fuchsia-400",
    },
    teal: {
      rail: "bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.55)]",
      iconHover:
        "group-hover/sidebar:text-teal-300 group-hover/sidebar:drop-shadow-[0_0_6px_rgba(45,212,191,0.45)]",
      iconActive: "text-teal-300 drop-shadow-[0_0_8px_rgba(45,212,191,0.55)]",
      labelHover: "group-hover/sidebar:text-teal-100",
      labelActive: "text-teal-100",
      orb: "bg-teal-400/80 shadow-[0_0_6px_rgba(45,212,191,0.45)]",
      orbPulse: "bg-teal-400",
    },
    violet: {
      rail: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.55)]",
      iconHover:
        "group-hover/sidebar:text-violet-300 group-hover/sidebar:drop-shadow-[0_0_6px_rgba(167,139,250,0.45)]",
      iconActive:
        "text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.55)]",
      labelHover: "group-hover/sidebar:text-violet-100",
      labelActive: "text-violet-100",
      orb: "bg-violet-400/80 shadow-[0_0_6px_rgba(167,139,250,0.45)]",
      orbPulse: "bg-violet-400",
    },
    amber: {
      rail: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]",
      iconHover:
        "group-hover/sidebar:text-amber-300 group-hover/sidebar:drop-shadow-[0_0_6px_rgba(251,191,36,0.45)]",
      iconActive:
        "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)]",
      labelHover: "group-hover/sidebar:text-amber-100",
      labelActive: "text-amber-100",
      orb: "bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.45)]",
      orbPulse: "bg-amber-400",
    },
    emerald: {
      rail: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]",
      iconHover:
        "group-hover/sidebar:text-emerald-300 group-hover/sidebar:drop-shadow-[0_0_6px_rgba(52,211,153,0.45)]",
      iconActive:
        "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.55)]",
      labelHover: "group-hover/sidebar:text-emerald-100",
      labelActive: "text-emerald-100",
      orb: "bg-emerald-400/80 shadow-[0_0_6px_rgba(52,211,153,0.45)]",
      orbPulse: "bg-emerald-400",
    },
    rose: {
      rail: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.55)]",
      iconHover:
        "group-hover/sidebar:text-rose-300 group-hover/sidebar:drop-shadow-[0_0_6px_rgba(251,113,133,0.45)]",
      iconActive:
        "text-rose-300 drop-shadow-[0_0_8px_rgba(251,113,133,0.55)]",
      labelHover: "group-hover/sidebar:text-rose-100",
      labelActive: "text-rose-100",
      orb: "bg-rose-400/80 shadow-[0_0_6px_rgba(251,113,133,0.45)]",
      orbPulse: "bg-rose-400",
    },
  };
  return accentStyles[accent] ?? accentStyles.cyan;
};

export const getSectionAccentStyles = (accent: SidebarAccent) => {
  const accentStyles = {
    cyan: {
      bar: "bg-cyan-400/60",
      barGlow: "shadow-[0_0_6px_rgba(34,211,238,0.4)]",
      text: "text-cyan-500/50",
    },
    moonlit_orchid: {
      bar: "bg-purple-400/60",
      barGlow: "shadow-[0_0_6px_rgba(192,132,252,0.4)]",
      text: "text-purple-500/50",
    },
    teal: {
      bar: "bg-teal-400/60",
      barGlow: "shadow-[0_0_6px_rgba(45,212,191,0.35)]",
      text: "text-teal-500/50",
    },
    violet: {
      bar: "bg-violet-400/60",
      barGlow: "shadow-[0_0_6px_rgba(167,139,250,0.35)]",
      text: "text-violet-500/50",
    },
    amber: {
      bar: "bg-amber-400/60",
      barGlow: "shadow-[0_0_6px_rgba(251,191,36,0.35)]",
      text: "text-amber-500/50",
    },
    emerald: {
      bar: "bg-emerald-400/60",
      barGlow: "shadow-[0_0_6px_rgba(52,211,153,0.35)]",
      text: "text-emerald-500/50",
    },
    rose: {
      bar: "bg-rose-400/60",
      barGlow: "shadow-[0_0_6px_rgba(251,113,133,0.35)]",
      text: "text-rose-500/50",
    },
  };
  return accentStyles[accent] ?? accentStyles.cyan;
};

export const getModuleAccentStyles = (
  accent: SidebarAccent,
  glowIntensity: "none" | "subtle" | "medium" = "subtle"
) => {
  const accentStyles = {
    cyan: {
      border: "border-cyan-500/8",
      hoverBorder: "hover:border-cyan-500/15",
      glow:
        glowIntensity === "medium"
          ? "shadow-[inset_0_1px_0_rgba(34,211,238,0.05),0_0_20px_rgba(34,211,238,0.03)]"
          : "shadow-[inset_0_1px_0_rgba(34,211,238,0.03)]",
    },
    moonlit_orchid: {
      border: "border-purple-500/8",
      hoverBorder: "hover:border-purple-500/15",
      glow:
        glowIntensity === "medium"
          ? "shadow-[inset_0_1px_0_rgba(192,132,252,0.05),0_0_20px_rgba(192,132,252,0.03)]"
          : "shadow-[inset_0_1px_0_rgba(192,132,252,0.03)]",
    },
    teal: {
      border: "border-teal-500/8",
      hoverBorder: "hover:border-teal-500/15",
      glow:
        glowIntensity === "medium"
          ? "shadow-[inset_0_1px_0_rgba(45,212,191,0.05),0_0_20px_rgba(45,212,191,0.03)]"
          : "shadow-[inset_0_1px_0_rgba(45,212,191,0.03)]",
    },
    violet: {
      border: "border-violet-500/8",
      hoverBorder: "hover:border-violet-500/15",
      glow:
        glowIntensity === "medium"
          ? "shadow-[inset_0_1px_0_rgba(167,139,250,0.05),0_0_20px_rgba(167,139,250,0.03)]"
          : "shadow-[inset_0_1px_0_rgba(167,139,250,0.03)]",
    },
    amber: {
      border: "border-amber-500/8",
      hoverBorder: "hover:border-amber-500/15",
      glow:
        glowIntensity === "medium"
          ? "shadow-[inset_0_1px_0_rgba(251,191,36,0.05),0_0_20px_rgba(251,191,36,0.03)]"
          : "shadow-[inset_0_1px_0_rgba(251,191,36,0.03)]",
    },
    emerald: {
      border: "border-emerald-500/8",
      hoverBorder: "hover:border-emerald-500/15",
      glow:
        glowIntensity === "medium"
          ? "shadow-[inset_0_1px_0_rgba(52,211,153,0.05),0_0_20px_rgba(52,211,153,0.03)]"
          : "shadow-[inset_0_1px_0_rgba(52,211,153,0.03)]",
    },
    rose: {
      border: "border-rose-500/8",
      hoverBorder: "hover:border-rose-500/15",
      glow:
        glowIntensity === "medium"
          ? "shadow-[inset_0_1px_0_rgba(251,113,133,0.05),0_0_20px_rgba(251,113,133,0.03)]"
          : "shadow-[inset_0_1px_0_rgba(251,113,133,0.03)]",
    },
  };
  return accentStyles[accent] ?? accentStyles.cyan;
};

export const getShardPipStyles = (accent: "cyan" | "moonlit_orchid") => {
  const styles = {
    cyan: {
      arm: "bg-cyan-400/15",
      armHover: "bg-cyan-300/45",
      icon: "text-cyan-300/35",
      iconHover: "text-cyan-200",
      glow: "shadow-[0_0_12px_rgba(34,211,238,0.28)]",
      activity: "shadow-[0_0_6px_rgba(34,211,238,0.3)]",
    },
    moonlit_orchid: {
      arm: "bg-purple-400/15",
      armHover: "bg-purple-300/45",
      icon: "text-purple-300/35",
      iconHover: "text-purple-200",
      glow: "shadow-[0_0_12px_rgba(192,132,252,0.28)]",
      activity: "shadow-[0_0_6px_rgba(192,132,252,0.3)]",
    },
  };
  return styles[accent];
};
