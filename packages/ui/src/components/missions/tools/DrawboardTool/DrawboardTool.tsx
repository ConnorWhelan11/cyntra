"use client";

/**
 * DrawboardTool — Drawing/diagramming tool for missions
 * Wraps DrawboardLayout with Premed Shapes panel and emits tool events
 */

import { Palette } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { DrawIoEmbedRef } from "react-drawio";
import type { MissionTool, MissionToolRenderProps } from "../../../../missions/types";
import { useMissionRuntime } from "../../../../missions/provider";
import { DrawboardCanvas, type DrawboardCanvasHandle } from "../../../ai-drawboard/DrawboardCanvas";
import { DrawboardToolbar } from "../../../ai-drawboard/DrawboardToolbar";
import { PremedShapesPanel } from "../../../ai-drawboard/premedShapes";
import type { ShapeEntry } from "../../../ai-drawboard/premedShapes";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Panel Component
// ─────────────────────────────────────────────────────────────────────────────

export function DrawboardToolPanel({ toolId }: MissionToolRenderProps) {
  const { dispatch } = useMissionRuntime();
  const canvasRef = useRef<DrawboardCanvasHandle>(null);
  const [activeTool, setActiveTool] = useState("select");

  // Handle XML changes from canvas
  const handleXmlChange = useCallback(
    (xml: string) => {
      dispatch({
        type: "tool/event",
        toolId,
        name: "drawboard/xmlChanged",
        data: { xml },
      } as Parameters<typeof dispatch>[0]);
    },
    [dispatch, toolId]
  );

  // Handle shape insertion
  const handleShapeInsert = useCallback(
    (shape: ShapeEntry) => {
      dispatch({
        type: "tool/event",
        toolId,
        name: "drawboard/shapeInserted",
        data: { shapeId: shape.id, shapeName: shape.name },
      } as Parameters<typeof dispatch>[0]);
    },
    [dispatch, toolId]
  );

  // Get draw.io ref for merge operations
  const getDrawioRef = useCallback((): DrawIoEmbedRef | null => {
    return canvasRef.current?.getInstance() ?? null;
  }, []);

  // Handle canvas export
  const handleExport = useCallback(() => {
    canvasRef.current?.exportDiagram("xmlsvg");
  }, []);

  return (
    <div className="drawboard-tool flex h-full gap-3 p-3">
      {/* Main Canvas Area */}
      <div className="flex flex-1 flex-col gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur">
        {/* Mode Label */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="rounded-full bg-purple-500/10 px-3 py-1 text-purple-400">
              Mission Mode
            </span>
            <span className="text-muted-foreground/80">Drawboard</span>
          </div>
          <button
            onClick={handleExport}
            className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Save
          </button>
        </div>

        {/* Toolbar */}
        <DrawboardToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onUndo={() => {
            // draw.io handles undo internally via keyboard shortcuts
          }}
          onRedo={() => {
            // draw.io handles redo internally via keyboard shortcuts
          }}
        />

        {/* Canvas */}
        <div className="flex-1 min-h-[400px]">
          <DrawboardCanvas
            ref={canvasRef}
            onXmlChange={handleXmlChange}
            onExport={(payload) => {
              if (payload.xml) {
                handleXmlChange(payload.xml);
              }
            }}
            urlParameters={{
              // Enable autosave to track changes
              // Keep libraries disabled since we provide our own panel
              libraries: false,
              ui: "min",
              dark: true,
            }}
            className="h-full"
          />
        </div>
      </div>

      {/* Sidebar with Premed Shapes */}
      <div className="w-[280px] rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
        <PremedShapesPanel
          drawioRef={getDrawioRef()}
          onInsert={handleShapeInsert}
          onInsertError={(shape, error) => {
            console.warn(`[DrawboardTool] Failed to insert ${shape.name}:`, error);
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definition
// ─────────────────────────────────────────────────────────────────────────────

export const DrawboardTool: MissionTool = {
  id: "glia.drawboard",
  title: "Drawboard",
  description: "Draw diagrams and visual explanations",
  icon: <Palette className="h-4 w-4" />,
  Panel: DrawboardToolPanel,
  handlesEvents: true,
};
