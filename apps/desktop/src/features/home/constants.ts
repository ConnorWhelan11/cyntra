/**
 * World Builder Constants
 *
 * Centralized magic numbers and configuration values.
 */

// Timing constants (milliseconds)
export const SUBMIT_STATE_RESET_DELAY_MS = 900;
export const CONSOLE_ANIMATION_DELAY_MS = 420;
export const PLAYTEST_TIMEOUT_MS = 300_000; // 5 minutes

// UI constraints
export const TEXTAREA_MAX_HEIGHT_PX = 320;
export const REFINEMENT_TEXT_MAX_LENGTH = 2000;
export const PROMPT_TEXT_MAX_LENGTH = 10_000;
export const WORLD_NAME_MAX_LENGTH = 100;

// Recent worlds storage
export const RECENT_WORLDS_STORAGE_KEY = "cyntra:recent-worlds";
export const RECENT_WORLDS_MAX_ITEMS = 8;

// Event message truncation
export const EVENT_MESSAGE_MAX_LENGTH = 300;

// Build state machine
export const TERMINAL_BUILD_STATUSES = new Set(["complete", "failed"] as const);

// Playtest status machine
export const TERMINAL_PLAYTEST_STATUSES = new Set(["passed", "failed"] as const);
