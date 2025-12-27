/**
 * Cyntra Sigil Registry
 *
 * Custom icon language for Cyntra navigation.
 * All sigils follow the grammar rules:
 * - 24×24 artboard
 * - 1.5px primary stroke, 1px secondary
 * - Round caps/joins
 * - currentColor inheritance
 */

// Visible navigation sigils (7)
export { Cosmograph } from "./Cosmograph";
export { Hexcore } from "./Hexcore";
export { Helix } from "./Helix";
export { Neuron } from "./Neuron";
export { Prompt } from "./Prompt";
export { Aperture } from "./Aperture";
export { Cog } from "./Cog";
export { Search } from "./Search";

// Reserved sigils for hidden routes (4)
export { Flow } from "./Flow";
export { Viewport } from "./Viewport";
export { Stage } from "./Stage";
export { Gameplay } from "./Gameplay";

// Re-export types
export type SigilName =
  | "cosmograph"
  | "hexcore"
  | "helix"
  | "neuron"
  | "prompt"
  | "aperture"
  | "cog"
  | "search"
  | "flow"
  | "viewport"
  | "stage"
  | "gameplay";

// Route to sigil mapping
export const ROUTE_SIGIL_MAP: Record<string, SigilName> = {
  universe: "cosmograph",
  kernel: "hexcore",
  workflows: "flow",
  evolution: "helix",
  memory: "neuron",
  search: "search",
  terminals: "prompt",
  gallery: "aperture",
  projects: "cog",
  runs: "flow",
  viewer: "viewport",
  immersa: "viewport",
  stage: "stage",
  gameplay: "gameplay",
} as const;
