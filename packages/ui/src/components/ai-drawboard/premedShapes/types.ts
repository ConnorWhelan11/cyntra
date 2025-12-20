/**
 * Premed Shapes — Type Definitions
 * Metadata schema for medical/premed shape assets
 */

export type ShapeCategory = "anatomy" | "lab" | "clinical" | "bio-chem";

export interface ShapeMetadata {
  /** Unique identifier for the shape */
  id: string;
  /** Display name */
  name: string;
  /** Category for filtering */
  category: ShapeCategory;
  /** Search tokens + synonyms */
  tags: string[];
  /** Base64-encoded SVG data URI */
  svgDataUri: string;
  /** Default width when inserted (px) */
  defaultWidth?: number;
  /** Default height when inserted (px) */
  defaultHeight?: number;
}

export interface ShapeProvenance {
  /** Source name (e.g., "Lucide Icons") */
  sourceName: string;
  /** Source URL */
  sourceUrl: string;
  /** SPDX license identifier */
  licenseSpdx: string;
  /** License URL */
  licenseUrl: string;
  /** Author (optional) */
  author?: string;
}

export interface ShapeEntry extends ShapeMetadata {
  provenance: ShapeProvenance;
}

export interface ShapeRegistry {
  version: string;
  shapes: ShapeEntry[];
}

export const SHAPE_CATEGORIES: { id: ShapeCategory; label: string; description: string }[] = [
  { id: "anatomy", label: "Anatomy", description: "Organs, systems, and body structures" },
  { id: "lab", label: "Lab", description: "Laboratory equipment and procedures" },
  { id: "clinical", label: "Clinical", description: "Medical devices and clinical tools" },
  { id: "bio-chem", label: "Bio/Chem", description: "Molecules, cells, and biochemistry" },
];

