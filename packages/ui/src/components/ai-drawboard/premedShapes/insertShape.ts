/**
 * Premed Shapes — Insert Shape Utility
 * Generates draw.io merge XML for inserting shapes into the canvas
 */

import type { ShapeEntry } from "./types";

export interface InsertShapeOptions {
  /** X position on canvas (default: 100) */
  x?: number;
  /** Y position on canvas (default: 100) */
  y?: number;
  /** Override width */
  width?: number;
  /** Override height */
  height?: number;
}

/**
 * Generate a unique cell ID for draw.io
 */
function generateCellId(): string {
  return `premed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build the mxCell style string for an image-backed shape
 */
function buildImageStyle(dataUri: string): string {
  const encodedUri = escapeXml(dataUri);
  return `shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=1;aspect=fixed;image=${encodedUri};`;
}

/**
 * Generate draw.io merge XML for inserting a shape
 * 
 * This creates a minimal mxfile fragment that can be merged into
 * an existing diagram using the draw.io `merge` action.
 */
export function createShapeMergeXml(
  shape: ShapeEntry,
  options: InsertShapeOptions = {}
): string {
  const {
    x = 100,
    y = 100,
    width = shape.defaultWidth ?? 60,
    height = shape.defaultHeight ?? 60,
  } = options;

  const cellId = generateCellId();
  const style = buildImageStyle(shape.svgDataUri);
  const label = escapeXml(shape.name);

  // Create a minimal mxfile with just the new cell
  // The merge action will add this to the existing diagram
  return `<mxGraphModel>
  <root>
    <mxCell id="${cellId}" value="${label}" style="${style}" vertex="1" parent="1">
      <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;
}

/**
 * Insert shape into a draw.io canvas via ref
 * Returns true if successful, false if ref not available
 */
export function insertShapeIntoCanvas(
  drawioRef: { merge: (data: { xml: string }) => void } | null | undefined,
  shape: ShapeEntry,
  options: InsertShapeOptions = {}
): boolean {
  if (!drawioRef?.merge) {
    console.warn("[insertShape] draw.io ref not available");
    return false;
  }

  try {
    const xml = createShapeMergeXml(shape, options);
    drawioRef.merge({ xml });
    return true;
  } catch (error) {
    console.error("[insertShape] Failed to insert shape:", error);
    return false;
  }
}

/**
 * Calculate next insertion position to avoid overlap
 * Simple grid-based placement
 */
export function getNextInsertPosition(
  insertCount: number,
  gridSize: number = 80,
  startX: number = 100,
  startY: number = 100,
  maxPerRow: number = 5
): { x: number; y: number } {
  const col = insertCount % maxPerRow;
  const row = Math.floor(insertCount / maxPerRow);
  
  return {
    x: startX + col * gridSize,
    y: startY + row * gridSize,
  };
}

