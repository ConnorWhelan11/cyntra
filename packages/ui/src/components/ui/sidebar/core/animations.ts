// ============================================================================
// ANIMATION CONFIGURATION
// ============================================================================

export const ANIMATION_CONFIG = {
  // Open animation timing (ms)
  open: {
    total: 310,
    phase1: { start: 0, end: 140 }, // Panel + shard grow
    phase2: { start: 90, end: 230 }, // Docks become nav
    phase3: { start: 230, end: 310 }, // Labels + sections + Realms reveal
  },
  // Close animation timing (ms) - smoother
  close: {
    total: 320,
    phase1: { start: 0, end: 100 }, // Realms retract
    phase2: { start: 50, end: 150 }, // Nav text + sections disappear
    phase3: { start: 100, end: 220 }, // Icons return to docks
    phase4: { start: 180, end: 320 }, // Panel collapses
  },
  // Stagger delays for list items (ms)
  stagger: {
    navItem: 20,
    realmCard: 30,
  },
  // Easing curves
  easing: {
    open: [0.33, 0.01, 0.18, 0.99], // gentle ease out
    close: [0.33, 0, 0.2, 1], // responsive start, smooth end
  },
} as const;

// Convert ms to seconds for framer-motion
export const ms = (milliseconds: number) => milliseconds / 1000;
