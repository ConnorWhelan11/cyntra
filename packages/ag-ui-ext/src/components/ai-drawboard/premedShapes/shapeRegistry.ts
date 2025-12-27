/**
 * Premed Shapes — Registry
 * Provides access to shape library with category filtering and search
 */

import { PREMED_SHAPES, REGISTRY_VERSION } from "./generated";
import type { ShapeCategory, ShapeEntry, ShapeRegistry } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Registry Export
// ─────────────────────────────────────────────────────────────────────────────

export const premedShapeRegistry: ShapeRegistry = {
  version: REGISTRY_VERSION,
  shapes: PREMED_SHAPES,
};

// ─────────────────────────────────────────────────────────────────────────────
// Accessors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all shapes in the registry
 */
export function getAllShapes(): ShapeEntry[] {
  return premedShapeRegistry.shapes;
}

/**
 * Get shapes filtered by category
 */
export function getShapesByCategory(category: ShapeCategory): ShapeEntry[] {
  return premedShapeRegistry.shapes.filter((s) => s.category === category);
}

/**
 * Get a specific shape by ID
 */
export function getShapeById(id: string): ShapeEntry | undefined {
  return premedShapeRegistry.shapes.find((s) => s.id === id);
}

/**
 * Get all unique categories that have shapes
 */
export function getAvailableCategories(): ShapeCategory[] {
  const categories = new Set(premedShapeRegistry.shapes.map((s) => s.category));
  return Array.from(categories);
}

/**
 * Get shape count per category
 */
export function getCategoryCounts(): Record<ShapeCategory, number> {
  const counts: Record<ShapeCategory, number> = {
    anatomy: 0,
    lab: 0,
    clinical: 0,
    "bio-chem": 0,
  };

  for (const shape of premedShapeRegistry.shapes) {
    counts[shape.category]++;
  }

  return counts;
}

// Re-export types
export type {
  ShapeCategory,
  ShapeEntry,
  ShapeMetadata,
  ShapeProvenance,
  ShapeRegistry,
} from "./types";
export { SHAPE_CATEGORIES } from "./types";
