import type { IntroVariant, StoryStep } from "./types";

/**
 * Glia Premed intro sequence
 * Cinematic frame-based narrative: chaos → containment → orb → done
 * Each text step uses frames that fade in/out one at a time
 */
export const GLIA_PREMED_SEQUENCE: StoryStep[] = [
  // 1. CHAOS: Initial explosion/mess
  {
    id: "chaos",
    type: "wait",
    duration: 3500,
    containmentTarget: 0.05,
    shakeIntensity: 1.0,
  },
  // 2. Intro: Fairytale
  {
    id: "intro",
    type: "text",
    containmentTarget: 0.12,
    shakeIntensity: 0.1,
    delayBefore: 1800,
    delayAfter: 500,
    content: {
      className: "text-cyan-neon/85 font-medium",
      frames: [
        {
          text: "Once upon a primary app",
          holdMs: 3000,
        },
        {
          text: "happily ever after",
          mode: "replace",
          holdMs: 2000,
        },
        {
          text: "became...",
          mode: "append-below",
          holdMs: 2500,
        },
        {
          text: "a waitlist",
          mode: "replace",
          holdMs: 2000,
          className: "text-cyan-neon",
          scale: 1.02,
        },
      ],
    },
  },
  // 2. OPENING: The system's betrayal - thesis builds across frames
  {
    id: "opening",
    type: "text",
    containmentTarget: 0.12,
    shakeIntensity: 0.7,
    delayBefore: 1800,
    delayAfter: 500,
    content: {
      className: "text-cyan-neon/85 font-medium",
      frames: [
        {
          text: "they turned",
          holdMs: 2500,
        },
        {
          text: '"i want to help people"',
          mode: "append-below",
          holdMs: 3000,
          delayAfter: 1000,
        },
        {
          text: "into",
          mode: "replace",
          holdMs: 1500,
          className: "text-cyan-neon font-semibold",
          scale: 1.02,
          emphasis: true,
        },
        {
          text: "a seven-hour",
          mode: "append-below",
          holdMs: 2200,
          className: "text-cyan-neon font-semibold",
          scale: 1.02,
          emphasis: true,
        },
        {
          text: "multiple choice exam.",
          mode: "replace",
          holdMs: 2500,
          className: "text-rose-400/90 font-bold",
          scale: 1.1,
          emphasis: true,
        },
      ],
    },
  },

  // 3. VILLAINS: The enemies - inline build, then replace with hooks
  {
    id: "villains",
    type: "text",
    containmentTarget: 0.25,
    shakeIntensity: 0.5,
    delayBefore: 800,
    delayAfter: 400,
    content: {
      className: "text-slate-300/70 font-normal",
      frames: [
        {
          text: "question banks.",
          mode: "replace",
          holdMs: 1500,
        },
        {
          text: '"practice" tests.',
          mode: "append-below",
          holdMs: 2200,
        },
        {
          text: "cease-and-desist emails.",
          mode: "replace",
          holdMs: 2100,
          className: "text-slate-200/80",
        },
        {
          text: "your favorite tools",
          mode: "replace",
          holdMs: 2100,
          className: "text-slate-100/90 font-medium",
          scale: 1.03,
        },
        {
          text: "quietly killed",
          mode: "append-below",
          holdMs: 2300,
          className: "text-slate-100/90 font-medium",
          scale: 1.03,
        },
        {
          text: "instead of supported.",
          mode: "replace",
          holdMs: 2100,
          className: "text-slate-100/90 font-medium",
          scale: 1.03,
        },
      ],
    },
  },

  // 4. VILLAINS ACKNOWLEDGMENT: You know them
  {
    id: "villains-ack",
    type: "text",
    containmentTarget: 0.38,
    shakeIntensity: 0.35,
    delayBefore: 1000,
    delayAfter: 500,
    content: {
      className: "text-magenta-neon/80 font-medium",
      frames: [
        {
          text: "you know the villains.",
          holdMs: 2500,
          delayAfter: 1000,
        },
        {
          text: "now you need",
          holdMs: 2000,
          className: "text-magenta-neon font-bold",
          scale: 1.04,
          emphasis: true,
        },
        {
          text: "a weapon.",
          holdMs: 2500,
          className: "text-rose-400/90 font-bold text-base",
          scale: 1.04,
          emphasis: true,
        },
      ],
    },
  },

  // 5. GLIA APPEARS: The solution
  {
    id: "glia-appears",
    type: "text",
    containmentTarget: 0.52,
    shakeIntensity: 0.2,
    delayBefore: 500,
    delayAfter: 600,
    content: {
      className: "text-cyan-neon/90 font-semibold",
      frames: [
        {
          text: "glia",
          holdMs: 1800,
        },
        {
          text: "doesn't panic.",
          mode: "append-below",
          holdMs: 1800,
        },
        {
          text: "glia",
          mode: "replace",
          holdMs: 1600,
        },
        {
          text: "watches.",
          mode: "replace",
          holdMs: 1600,
          className: "text-cyan-neon",
        },
        {
          text: "listens.",
          mode: "replace",
          holdMs: 1600,
          className: "text-cyan-neon",
        },
        {
          text: "maps.",
          mode: "replace",
          holdMs: 1000,
          className: "text-cyan-neon",
        },
        {
          text: "drills.",
          mode: "replace",
          holdMs: 1000,
          className: "text-cyan-neon",
        },
        {
          text: "adjusts.",
          mode: "replace",
          holdMs: 800,
          className: "text-cyan-neon",
        },
        {
          text: "steadies.",
          mode: "replace",
          holdMs: 800,
          className: "text-cyan-neon",
        },
        {
          text: "wins.",
          mode: "replace",
          holdMs: 3000,
          className: "text-emerald-neon font-bold",
          scale: 1.2,
          emphasis: true,
        },
        {
          text: "glia",
          mode: "replace",
          holdMs: 1800,
        },
        {
          text: "rallies the troops",
          delayBefore: 1000,
          mode: "replace",
          holdMs: 2000,
          className: "text-cyan-neon",
        },
        {
          text: "and schedules the war.",
          delayBefore: 1000,
          holdMs: 2000,
          className: "text-cyan-neon font-bold",
        },
      ],
    },
  },

  // 6. ENLIST: Call to action - inline build, then escalating replacements
  {
    id: "enlist",
    type: "text",
    containmentTarget: 0.65,
    shakeIntensity: 0.1,
    delayBefore: 1000,
    delayAfter: 500,
    content: {
      className: "text-emerald-neon/80 font-medium",
      frames: [
        {
          text: "enlist.",
          mode: "replace",
          delayAfter: 1000,
          holdMs: 2600,
        },
        {
          text: "you are the future.",
          mode: "replace",
          holdMs: 2800,
          className: "text-emerald-neon/90",
        },
        {
          text: "medicine needs you.",
          mode: "append-below",
          holdMs: 2000,
          className: "text-emerald-neon font-semibold",
          scale: 1.04,
          emphasis: true,
        },
        {
          text: "humanity needs you.",
          mode: "replace",
          holdMs: 2000,
          className: "text-emerald-neon font-bold",
          emphasis: true,
        },
      ],
    },
  },

  // 7. VERSUS STACK: The struggle - tension building with animated strike
  {
    id: "versus",
    type: "text",
    containmentTarget: 0.78,
    shakeIntensity: 0.05,
    delayBefore: 1000,
    delayAfter: 400,
    content: {
      className: "text-slate-200/90 font-semibold tracking-wide",
      frames: [
        {
          text: "you vs exam",
          mode: "replace",
          holdMs: 2000,
        },
        {
          text: "you vs system",
          mode: "replace",
          holdMs: 2000,
        },
        {
          // Show "you vs you" without strikethrough first
          text: "you vs you",
          mode: "replace",
          holdMs: 1200,
          effectVariant: "none",
        },
        {
          // Then animate the strike-glitch effect onto the same text
          text: "", // ignored for mutate-last
          mode: "mutate-last",
          holdMs: 1400,
          className: "text-rose-400/90 font-bold",
          strikethrough: true,
          emphasis: true,
          scale: 1.02,
          effectVariant: "strike-glitch",
        },
      ],
    },
  },

  // 8. NOT ALONE: The truth - stacked reveal (first line stays, second appears below)
  {
    id: "not-alone",
    type: "text",
    containmentTarget: 0.88,
    shakeIntensity: 0.02,
    delayBefore: 450,
    delayAfter: 700,
    content: {
      className: "text-cyan-neon/90 font-semibold",
      frames: [
        {
          text: "it was never solo.",
          mode: "replace",
          holdMs: 1800,
        },
        {
          text: "we win this together.",
          mode: "append-below",
          holdMs: 2100,
          className: "text-emerald-neon font-bold",
          scale: 1.03,
          emphasis: true,
        },
      ],
    },
  },

  // 9. ORB: The collection animation
  {
    id: "orb",
    type: "orb",
    containmentTarget: 0.95,
    shakeIntensity: 0,
  },

  // 10. FINAL BEAT: gg AAMC - punchy closer
  {
    id: "gg",
    type: "text",
    containmentTarget: 0.98,
    shakeIntensity: 0,
    delayBefore: 1400,
    delayAfter: 1400,
    content: {
      frames: [
        {
          text: "gg",
          holdMs: 2200,
          className: "text-magenta-neon font-black text-base tracking-[0.2em]",
          scale: 1.05,
          emphasis: true,
        },
        {
          text: "AAMC",
          mode: "replace",
          holdMs: 3800,
          className: "text-magenta-neon font-black text-base tracking-[0.2em]",
          scale: 1.2,
          emphasis: true,
        },
      ],
    },
  },

  // 11. DONE: Interactive state
  {
    id: "done",
    type: "interactive",
    containmentTarget: 1.0,
    shakeIntensity: 0,
    content: {
      showButtons: true,
    },
  },
];

/**
 * Default Out-of-Scope intro sequence (original general-purpose script)
 * Preserved for future use / A-B testing
 * Uses frame-based content for consistency
 */
export const DEFAULT_SEQUENCE: StoryStep[] = [
  // 1. CHAOS: Initial explosion/mess
  {
    id: "chaos",
    type: "wait",
    duration: 3500,
    containmentTarget: 0.05,
    shakeIntensity: 1.0,
  },

  // 2. SCRIPT-1: "For students..."
  {
    id: "audience-def",
    type: "text",
    containmentTarget: 0.2,
    shakeIntensity: 0.2,
    delayBefore: 1200,
    delayAfter: 650,
    content: {
      className: "text-cyan-neon/80 font-medium",
      frames: [
        { text: "For students.", holdMs: 600 },
        { text: "For professionals.", holdMs: 600 },
        {
          text: "For daydreamers & deep thinkers.",
          holdMs: 900,
          className: "text-cyan-neon/90 font-semibold",
        },
      ],
    },
  },

  // 3. SCRIPT-2: "whatever the fuck..."
  {
    id: "problem-def",
    type: "text",
    containmentTarget: 0.55,
    shakeIntensity: 0.1,
    delayAfter: 850,
    content: {
      frames: [
        {
          text: "whatever the fuck you're trying to finally finish.",
          holdMs: 1200,
          className: "text-cyan-neon/90 font-semibold",
          emphasis: true,
        },
      ],
    },
  },

  // 4. SCRIPT-3: "Mission control..."
  {
    id: "solution-def",
    type: "text",
    containmentTarget: 0.85,
    shakeIntensity: 0.05,
    delayAfter: 1200,
    content: {
      frames: [
        {
          text: "Out-of-Scope is mission control for the work your brain keeps wandering away from.",
          holdMs: 1500,
          className: "text-cyan-neon font-medium",
        },
      ],
    },
  },

  // 5. ORB: The collection animation
  {
    id: "orb",
    type: "orb",
    containmentTarget: 0.95,
    shakeIntensity: 0,
  },

  // 6. DONE: Interactive state
  {
    id: "done",
    type: "interactive",
    containmentTarget: 1.0,
    shakeIntensity: 0,
    content: {
      showButtons: true,
    },
  },
];

/**
 * Get the intro sequence for a given variant
 */
export function getIntroSequence(variant: IntroVariant = "glia-premed"): StoryStep[] {
  switch (variant) {
    case "glia-premed":
      return GLIA_PREMED_SEQUENCE;
    case "default":
      return DEFAULT_SEQUENCE;
    default:
      return GLIA_PREMED_SEQUENCE;
  }
}

/**
 * @deprecated Use getIntroSequence() instead
 * Kept for backwards compatibility during migration
 */
export const INTRO_SEQUENCE = GLIA_PREMED_SEQUENCE;
