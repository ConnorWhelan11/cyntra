/**
 * World Templates (Prompt Packs)
 *
 * Pre-configured world templates that prefill the console
 * and set default blueprint configurations.
 */

import type { WorldTemplate } from "@/types";

export const WORLD_TEMPLATES: WorldTemplate[] = [
  {
    id: "cozy-interior",
    title: "Cozy Interior",
    description: "Warm residential spaces with natural lighting and comfortable furniture layouts",
    icon: "\uD83C\uDFE0",
    promptText: `A warm, inviting living room with soft natural lighting streaming through large windows.
The space features a comfortable sectional sofa, wooden coffee table, and layered textiles.
Bookshelves line one wall, and indoor plants add touches of green throughout.`,
    blueprintDefaults: {
      runtime: "three",
      outputs: ["viewer"],
      gates: ["interior", "lighting", "furniture"],
      tags: ["residential", "cozy", "natural-light"],
    },
    previewBullets: ["Natural lighting", "Furniture layout", "Cozy materials"],
    recommendedCritics: ["interior_coherence", "lighting_quality", "furniture_placement"],
  },
  {
    id: "vehicle-config",
    title: "Vehicle Config",
    description: "Automotive configurator with material variants and studio lighting",
    icon: "\uD83D\uDE97",
    promptText: `A modern electric vehicle in a minimalist studio environment.
The car features customizable exterior paint, wheel options, and interior materials.
Professional automotive lighting with soft shadows and reflective ground plane.`,
    blueprintDefaults: {
      runtime: "three",
      outputs: ["viewer", "build"],
      gates: ["car_realism"],
      tags: ["automotive", "configurator", "studio"],
    },
    previewBullets: ["Material variants", "Lighting rig", "Camera orbit"],
    recommendedCritics: ["car_realism", "material_quality", "lighting_studio"],
  },
  {
    id: "architectural-viz",
    title: "Architecture Viz",
    description: "Exterior architectural visualization with environment and landscaping",
    icon: "\uD83C\uDFD7\uFE0F",
    promptText: `A contemporary residential building with clean geometric lines and large glass facades.
The structure sits in a landscaped environment with mature trees and manicured lawns.
Golden hour lighting creates warm shadows and highlights the material palette.`,
    blueprintDefaults: {
      runtime: "three",
      outputs: ["viewer", "build"],
      gates: ["exterior", "lighting"],
      tags: ["architecture", "exterior", "landscape"],
    },
    previewBullets: ["Golden hour", "Landscaping", "Material palette"],
    recommendedCritics: ["architectural_form", "landscape_integration", "lighting_quality"],
  },
  {
    id: "game-environment",
    title: "Game Environment",
    description: "Stylized game level with interactive elements and optimized geometry",
    icon: "\uD83C\uDFAE",
    promptText: `A stylized fantasy forest clearing suitable for a third-person adventure game.
The environment features low-poly trees, mossy rocks, and a small stream with a wooden bridge.
Optimized for real-time rendering with baked lighting and LOD-ready assets.`,
    blueprintDefaults: {
      runtime: "godot",
      outputs: ["viewer", "build"],
      gates: ["game_ready", "performance"],
      tags: ["game", "stylized", "environment"],
    },
    previewBullets: ["Low-poly style", "Interactive elements", "Performance optimized"],
    recommendedCritics: ["game_ready", "polycount", "uv_efficiency"],
  },
  {
    id: "product-showcase",
    title: "Product Showcase",
    description: "E-commerce style product presentation with clean backgrounds",
    icon: "\uD83D\uDECD\uFE0F",
    promptText: `A premium product showcase environment with infinite white backdrop.
Professional studio lighting with soft shadows and subtle reflections.
Configurable camera angles for hero shots and detail views.`,
    blueprintDefaults: {
      runtime: "three",
      outputs: ["viewer"],
      gates: ["product_viz"],
      tags: ["product", "e-commerce", "studio"],
    },
    previewBullets: ["Clean backdrop", "Studio lighting", "Multiple angles"],
    recommendedCritics: ["product_presentation", "lighting_studio", "shadow_quality"],
  },
  {
    id: "scientific-viz",
    title: "Scientific Viz",
    description: "Data visualization and scientific illustration with precise controls",
    icon: "\uD83D\uDD2C",
    promptText: `A molecular structure visualization with accurate atomic representations.
Clear labeling, transparent bonding structures, and educational color coding.
Supports rotation, zoom, and component isolation for detailed examination.`,
    blueprintDefaults: {
      runtime: "three",
      outputs: ["viewer", "publish"],
      gates: ["accuracy"],
      tags: ["scientific", "educational", "molecular"],
    },
    previewBullets: ["Accurate models", "Clear labels", "Interactive controls"],
    recommendedCritics: ["scientific_accuracy", "visual_clarity", "interaction_quality"],
  },
];

/** Get template by ID */
export function getTemplateById(id: string): WorldTemplate | null {
  return WORLD_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Get templates by tag */
export function getTemplatesByTag(tag: string): WorldTemplate[] {
  return WORLD_TEMPLATES.filter((t) => t.blueprintDefaults.tags.includes(tag));
}
