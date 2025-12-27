import { describe, it, expect, vi } from "vitest";
import { createShapeMergeXml, insertShapeIntoCanvas, getNextInsertPosition } from "./insertShape";
import { getShapeById } from "./shapeRegistry";
import type { ShapeEntry } from "./types";

// Mock shape for testing
const mockShape: ShapeEntry = {
  id: "test-shape",
  name: "Test Shape",
  category: "clinical",
  tags: ["test"],
  svgDataUri: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
  defaultWidth: 60,
  defaultHeight: 60,
  provenance: {
    sourceName: "Test",
    sourceUrl: "https://test.com",
    licenseSpdx: "MIT",
    licenseUrl: "https://test.com/license",
  },
};

describe("createShapeMergeXml", () => {
  it("generates valid mxGraphModel XML", () => {
    const xml = createShapeMergeXml(mockShape);
    expect(xml).toContain("<mxGraphModel>");
    expect(xml).toContain("</mxGraphModel>");
    expect(xml).toContain("<root>");
    expect(xml).toContain("</root>");
  });

  it("includes mxCell with correct structure", () => {
    const xml = createShapeMergeXml(mockShape);
    expect(xml).toContain("<mxCell");
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('parent="1"');
  });

  it("includes shape name as label", () => {
    const xml = createShapeMergeXml(mockShape);
    expect(xml).toContain('value="Test Shape"');
  });

  it("includes image style with data URI", () => {
    const xml = createShapeMergeXml(mockShape);
    expect(xml).toContain("shape=image");
    expect(xml).toContain("image=");
  });

  it("uses default position when not specified", () => {
    const xml = createShapeMergeXml(mockShape);
    expect(xml).toContain('x="100"');
    expect(xml).toContain('y="100"');
  });

  it("uses custom position when specified", () => {
    const xml = createShapeMergeXml(mockShape, { x: 200, y: 300 });
    expect(xml).toContain('x="200"');
    expect(xml).toContain('y="300"');
  });

  it("uses shape default dimensions", () => {
    const xml = createShapeMergeXml(mockShape);
    expect(xml).toContain('width="60"');
    expect(xml).toContain('height="60"');
  });

  it("allows dimension override", () => {
    const xml = createShapeMergeXml(mockShape, { width: 120, height: 80 });
    expect(xml).toContain('width="120"');
    expect(xml).toContain('height="80"');
  });

  it("generates unique cell IDs", () => {
    const xml1 = createShapeMergeXml(mockShape);
    const xml2 = createShapeMergeXml(mockShape);

    const idMatch1 = xml1.match(/id="([^"]+)"/);
    const idMatch2 = xml2.match(/id="([^"]+)"/);

    expect(idMatch1).not.toBeNull();
    expect(idMatch2).not.toBeNull();
    expect(idMatch1![1]).not.toBe(idMatch2![1]);
  });

  it("escapes XML special characters in shape name", () => {
    const shapeWithSpecialChars: ShapeEntry = {
      ...mockShape,
      name: 'Test <Shape> & "Quotes"',
    };
    const xml = createShapeMergeXml(shapeWithSpecialChars);
    expect(xml).not.toContain("<Shape>");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
  });

  it("works with real registry shapes", () => {
    const heart = getShapeById("heart");
    expect(heart).toBeDefined();

    const xml = createShapeMergeXml(heart!);
    expect(xml).toContain("<mxGraphModel>");
    expect(xml).toContain("Heart");
    expect(xml).toContain("shape=image");
  });
});

describe("insertShapeIntoCanvas", () => {
  it("returns false when ref is null", () => {
    const result = insertShapeIntoCanvas(null, mockShape);
    expect(result).toBe(false);
  });

  it("returns false when ref is undefined", () => {
    const result = insertShapeIntoCanvas(undefined, mockShape);
    expect(result).toBe(false);
  });

  it("returns false when merge is not available", () => {
    const ref = {} as { merge?: unknown };
    const result = insertShapeIntoCanvas(
      ref as Parameters<typeof insertShapeIntoCanvas>[0],
      mockShape
    );
    expect(result).toBe(false);
  });

  it("calls merge with XML when ref is valid", () => {
    const mergeMock = vi.fn();
    const ref = { merge: mergeMock };

    const result = insertShapeIntoCanvas(ref, mockShape);

    expect(result).toBe(true);
    expect(mergeMock).toHaveBeenCalledTimes(1);
    expect(mergeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        xml: expect.stringContaining("<mxGraphModel>"),
      })
    );
  });

  it("passes position options to merge XML", () => {
    const mergeMock = vi.fn();
    const ref = { merge: mergeMock };

    insertShapeIntoCanvas(ref, mockShape, { x: 500, y: 600 });

    const callArg = mergeMock.mock.calls[0][0];
    expect(callArg.xml).toContain('x="500"');
    expect(callArg.xml).toContain('y="600"');
  });

  it("returns false when merge throws", () => {
    const ref = {
      merge: () => {
        throw new Error("Test error");
      },
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = insertShapeIntoCanvas(ref, mockShape);

    expect(result).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe("getNextInsertPosition", () => {
  it("returns start position for first insert", () => {
    const pos = getNextInsertPosition(0);
    expect(pos).toEqual({ x: 100, y: 100 });
  });

  it("increments x for subsequent inserts in same row", () => {
    const pos1 = getNextInsertPosition(1);
    const pos2 = getNextInsertPosition(2);

    expect(pos1.x).toBeGreaterThan(100);
    expect(pos2.x).toBeGreaterThan(pos1.x);
    expect(pos1.y).toBe(100);
    expect(pos2.y).toBe(100);
  });

  it("wraps to next row after maxPerRow", () => {
    const pos4 = getNextInsertPosition(4); // Last in first row
    const pos5 = getNextInsertPosition(5); // First in second row

    expect(pos4.y).toBe(100);
    expect(pos5.x).toBe(100);
    expect(pos5.y).toBeGreaterThan(100);
  });

  it("respects custom gridSize", () => {
    const pos = getNextInsertPosition(1, 100);
    expect(pos.x).toBe(200); // 100 + 1 * 100
  });

  it("respects custom startX and startY", () => {
    const pos = getNextInsertPosition(0, 80, 50, 50);
    expect(pos).toEqual({ x: 50, y: 50 });
  });

  it("respects custom maxPerRow", () => {
    const pos = getNextInsertPosition(3, 80, 100, 100, 3);
    expect(pos.y).toBeGreaterThan(100); // Should wrap to second row
  });
});
