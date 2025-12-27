# Premed Shapes Library

Medical/premed-focused shape library for Glia Drawboard. Provides searchable, categorized
shapes that can be inserted into draw.io diagrams via click-to-insert.

## Architecture

```
premedShapes/
├── types.ts              # Type definitions & metadata schema
├── generated.ts          # Auto-generated SVG data URIs (DO NOT EDIT)
├── shapeRegistry.ts      # Registry accessors & exports
├── search.ts             # Search/filter utilities
├── insertShape.ts        # Draw.io merge XML generation
├── PremedShapesPanel.tsx # Sidebar UI component
├── index.ts              # Module exports
├── README.md             # This file
├── ATTRIBUTION.md        # License & source attribution
└── *.test.ts             # Vitest tests
```

## Usage

### In Mission Tools

The `DrawboardTool` integrates the panel automatically:

```tsx
import { DrawboardTool } from "@oos/ag-ui-ext";
// Use in mission tool registry
```

### Standalone Usage

```tsx
import { PremedShapesPanel, DrawboardCanvas } from "@oos/ag-ui-ext";
import { useRef } from "react";

function MyDrawboard() {
  const canvasRef = useRef<DrawboardCanvasHandle>(null);

  return (
    <div className="flex gap-4">
      <DrawboardCanvas ref={canvasRef} />
      <PremedShapesPanel
        drawioRef={canvasRef.current?.getInstance()}
        onInsert={(shape) => console.log("Inserted:", shape.name)}
      />
    </div>
  );
}
```

### Programmatic Shape Insertion

```tsx
import { getShapeById, insertShapeIntoCanvas, createShapeMergeXml } from "@oos/ag-ui-ext";

// Get a shape from registry
const heart = getShapeById("heart");

// Insert via ref
insertShapeIntoCanvas(drawioRef, heart, { x: 200, y: 150 });

// Or generate XML manually
const xml = createShapeMergeXml(heart, { x: 200, y: 150 });
drawioRef.merge({ xml });
```

### Search & Filter

```tsx
import { searchShapes, filterShapes, getAllShapes } from "@oos/ag-ui-ext";

const shapes = getAllShapes();

// Search by query
const results = searchShapes(shapes, "cardiac");

// Filter by category
const labShapes = filterShapes(shapes, { category: "lab" });

// Combined filter + search
const filtered = filterShapes(shapes, {
  category: "clinical",
  query: "vitals",
});
```

## Categories

- **Anatomy**: Organs, systems, body structures
- **Lab**: Laboratory equipment and procedures
- **Clinical**: Medical devices and clinical tools
- **Bio/Chem**: Molecules, cells, biochemistry

## Adding New Shapes

### MVP (Manual)

1. Add SVG string to `generated.ts`
2. Add entry to `PREMED_SHAPES` array with metadata
3. Update ATTRIBUTION.md if using external assets

### Production (Automated)

Use the generator script:

```bash
cd packages/ag-ui-ext
bun run generate:premed-shapes
```

This reads from `assets-src/` and generates `generated.ts`.

## Licensing

All shapes must use permissive licenses (MIT, ISC, Apache-2.0).
See ATTRIBUTION.md for full source and license details.

## Testing

```bash
cd packages/ag-ui-ext
bun run test -- premedShapes
```
