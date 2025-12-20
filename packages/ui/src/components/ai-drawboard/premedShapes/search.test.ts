import { describe, it, expect } from "vitest";
import { searchShapes, filterShapes } from "./search";
import { getAllShapes } from "./shapeRegistry";

describe("searchShapes", () => {
  const shapes = getAllShapes();

  it("returns all shapes with empty query", () => {
    const results = searchShapes(shapes, "");
    expect(results).toHaveLength(shapes.length);
  });

  it("returns all shapes with whitespace-only query", () => {
    const results = searchShapes(shapes, "   ");
    expect(results).toHaveLength(shapes.length);
  });

  it("finds exact name match with highest score", () => {
    const results = searchShapes(shapes, "heart");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].shape.id).toBe("heart");
    expect(results[0].matchType).toBe("exact");
    expect(results[0].score).toBe(100);
  });

  it("finds exact id match with highest score", () => {
    const results = searchShapes(shapes, "dna");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].shape.id).toBe("dna");
    expect(results[0].matchType).toBe("exact");
  });

  it("ranks name-starts-with higher than contains", () => {
    const results = searchShapes(shapes, "heart");
    // "heart" exact match should come first
    // "heart-pulse" starts-with match should come second
    const heartIndex = results.findIndex((r) => r.shape.id === "heart");
    const heartPulseIndex = results.findIndex((r) => r.shape.id === "heart-pulse");
    expect(heartIndex).toBeLessThan(heartPulseIndex);
  });

  it("finds shapes by tag", () => {
    const results = searchShapes(shapes, "cardiac");
    expect(results.length).toBeGreaterThan(0);
    // Should find heart-related shapes
    const hasHeartShape = results.some((r) => r.shape.id === "heart" || r.shape.id === "heart-pulse");
    expect(hasHeartShape).toBe(true);
    expect(results[0].matchType).toBe("tag");
  });

  it("handles multi-token queries", () => {
    const results = searchShapes(shapes, "test blood");
    expect(results.length).toBeGreaterThan(0);
    // Should find test-tube which has both "test" and "blood" related tags
    const hasMatch = results.some(
      (r) => r.shape.name.toLowerCase().includes("test") || r.shape.tags.some((t) => t.includes("blood"))
    );
    expect(hasMatch).toBe(true);
  });

  it("is case insensitive", () => {
    const lowerResults = searchShapes(shapes, "brain");
    const upperResults = searchShapes(shapes, "BRAIN");
    const mixedResults = searchShapes(shapes, "BrAiN");

    expect(lowerResults).toHaveLength(upperResults.length);
    expect(lowerResults).toHaveLength(mixedResults.length);
    expect(lowerResults[0].shape.id).toBe(upperResults[0].shape.id);
  });

  it("sorts by score descending then name alphabetically", () => {
    const results = searchShapes(shapes, "cell");
    // Should be sorted by score
    for (let i = 1; i < results.length; i++) {
      const prevScore = results[i - 1].score;
      const currScore = results[i].score;
      if (prevScore === currScore) {
        // Same score, should be alphabetical
        expect(results[i - 1].shape.name.localeCompare(results[i].shape.name)).toBeLessThanOrEqual(0);
      } else {
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
    }
  });
});

describe("filterShapes", () => {
  const shapes = getAllShapes();

  it("filters by category", () => {
    const results = filterShapes(shapes, { category: "clinical" });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => {
      expect(r.shape.category).toBe("clinical");
    });
  });

  it('returns all categories when category is "all"', () => {
    const results = filterShapes(shapes, { category: "all" });
    expect(results).toHaveLength(shapes.length);
  });

  it("combines category and search filters", () => {
    const results = filterShapes(shapes, { category: "lab", query: "test" });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => {
      expect(r.shape.category).toBe("lab");
    });
    // Should include test-tube
    const hasTestTube = results.some((r) => r.shape.id === "test-tube");
    expect(hasTestTube).toBe(true);
  });

  it("returns empty when category has no matches for query", () => {
    const results = filterShapes(shapes, { category: "anatomy", query: "syringe" });
    // Syringe is clinical, not anatomy
    expect(results).toHaveLength(0);
  });

  it("handles all four categories", () => {
    const categories = ["anatomy", "lab", "clinical", "bio-chem"] as const;
    categories.forEach((cat) => {
      const results = filterShapes(shapes, { category: cat });
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

