/**
 * Common types used across the application
 */

export type Nav =
  | "projects"
  | "runs"
  | "terminals"
  | "viewer"
  | "kernel"
  | "immersa"
  | "universe"
  | "workflows"
  | "evolution"
  | "memory"
  | "search"
  | "gallery"
  | "stage"
  | "gameplay";

export interface ChatMessage {
  id: string;
  role: "user" | "system";
  text: string;
  ts: number;
}

/**
 * Immersa presentation metadata
 */
export interface ImmersaPresentation {
  id: string;
  title: string;
  data: unknown; // Full presentation JSON from Immersa
  created_at: number;
  updated_at: number;
}

/**
 * 3D asset reference for Immersa
 */
export interface ImmersaAsset {
  name: string;
  path: string;
  url: string;
  size: number;
}
