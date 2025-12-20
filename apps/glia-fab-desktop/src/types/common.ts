/**
 * Common types used across the application
 */

export type Nav = "projects" | "runs" | "terminals" | "viewer" | "kernel";

export interface ChatMessage {
  id: string;
  role: "user" | "system";
  text: string;
  ts: number;
}
