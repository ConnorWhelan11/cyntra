/**
 * Premed Shapes — Search Utility
 * Provides fuzzy search and ranking for shape library
 */

import type { ShapeCategory, ShapeEntry } from "./types";

export interface SearchResult {
  shape: ShapeEntry;
  score: number;
  matchType: "exact" | "name" | "tag" | "partial";
}

/**
 * Normalize a string for search comparison
 */
function normalize(str: string): string {
  return str.toLowerCase().trim();
}

/**
 * Calculate search score for a shape against a query
 * Higher score = better match
 */
function scoreShape(shape: ShapeEntry, query: string): SearchResult | null {
  const q = normalize(query);
  if (!q) return null;

  const name = normalize(shape.name);
  const id = normalize(shape.id);
  const tags = shape.tags.map(normalize);

  // Exact match on name or id (highest priority)
  if (name === q || id === q) {
    return { shape, score: 100, matchType: "exact" };
  }

  // Name starts with query
  if (name.startsWith(q)) {
    return { shape, score: 80, matchType: "name" };
  }

  // Name contains query
  if (name.includes(q)) {
    return { shape, score: 60, matchType: "name" };
  }

  // Exact tag match
  if (tags.includes(q)) {
    return { shape, score: 50, matchType: "tag" };
  }

  // Tag starts with query
  const tagStartMatch = tags.find((t) => t.startsWith(q));
  if (tagStartMatch) {
    return { shape, score: 40, matchType: "tag" };
  }

  // Tag contains query
  const tagContainsMatch = tags.find((t) => t.includes(q));
  if (tagContainsMatch) {
    return { shape, score: 30, matchType: "tag" };
  }

  // Multi-token search: all tokens must match somewhere
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const allText = [name, ...tags].join(" ");
    const allMatch = tokens.every((token) => allText.includes(token));
    if (allMatch) {
      return { shape, score: 25, matchType: "partial" };
    }
  }

  return null;
}

/**
 * Search shapes by query string
 * Returns sorted results (best match first)
 */
export function searchShapes(shapes: ShapeEntry[], query: string): SearchResult[] {
  if (!query.trim()) {
    // Return all shapes with neutral score when no query
    return shapes.map((shape) => ({ shape, score: 0, matchType: "partial" as const }));
  }

  const results: SearchResult[] = [];

  for (const shape of shapes) {
    const result = scoreShape(shape, query);
    if (result) {
      results.push(result);
    }
  }

  // Sort by score descending, then by name alphabetically
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.shape.name.localeCompare(b.shape.name);
  });
}

/**
 * Filter shapes by category and optionally search
 */
export function filterShapes(
  shapes: ShapeEntry[],
  options: {
    category?: ShapeCategory | "all";
    query?: string;
  } = {}
): SearchResult[] {
  const { category = "all", query = "" } = options;

  // Filter by category first
  let filtered = shapes;
  if (category !== "all") {
    filtered = shapes.filter((s) => s.category === category);
  }

  // Then apply search
  return searchShapes(filtered, query);
}

