import type { MemoryItem } from "@/types";
import type { MemoryType } from "../hooks/useMemoryAtlas";

export type SigilId = "diamond" | "tetra" | "ring" | "slab" | "pill" | "poly";

export function getSigilForType(type: MemoryType): SigilId {
  switch (type) {
    case "pattern":
      return "diamond";
    case "failure":
      return "tetra";
    case "dynamic":
      return "ring";
    case "context":
      return "slab";
    case "playbook":
      return "pill";
    case "frontier":
      return "poly";
  }
}

export function getGlowForImportance(importance: number): number {
  const clamped = Math.max(0, Math.min(1, importance));
  return 0.08 + clamped * 0.25;
}

export function getScopeStyle(scope: MemoryItem["scope"]): { elevation: number; crowned: boolean } {
  if (scope === "collective") return { elevation: 0.05, crowned: true };
  return { elevation: 0, crowned: false };
}

