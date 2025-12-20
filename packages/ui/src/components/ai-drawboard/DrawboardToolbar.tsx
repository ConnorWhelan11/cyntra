"use client";

import React from "react";
import {
  Circle,
  Link2,
  MousePointer2,
  Redo2,
  Square,
  Type as TypeIcon,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export type DrawTool = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

export type DrawboardToolbarProps = {
  activeTool?: string;
  onToolChange?: (toolId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onMagic?: () => void;
  tools?: DrawTool[];
  className?: string;
};

const defaultTools: DrawTool[] = [
  { id: "select", label: "Select", icon: <MousePointer2 className="h-4 w-4" /> },
  { id: "rectangle", label: "Rectangle", icon: <Square className="h-4 w-4" /> },
  { id: "ellipse", label: "Ellipse", icon: <Circle className="h-4 w-4" /> },
  { id: "text", label: "Text", icon: <TypeIcon className="h-4 w-4" /> },
  { id: "connector", label: "Connector", icon: <Link2 className="h-4 w-4" /> },
];

export function DrawboardToolbar({
  activeTool = "select",
  onToolChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetView,
  onMagic,
  tools = defaultTools,
  className,
}: DrawboardToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        {tools.map((tool) => {
          const isActive = activeTool === tool.id;
          return (
            <Button
              key={tool.id}
              size="sm"
              variant={isActive ? "default" : "ghost"}
              className={cn(
                "h-9 px-2",
                isActive && "border border-primary/60 shadow-primary/20 shadow-sm",
              )}
              onClick={() => onToolChange?.(tool.id)}
            >
              {tool.icon}
              <span className="ml-2 text-xs">{tool.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="mx-2 h-6 w-px bg-border/70" />

      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mx-2 h-6 w-px bg-border/70" />

      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={onResetView}>
          <span className="text-xs font-medium">Fit</span>
        </Button>
        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {onMagic && (
        <>
          <div className="mx-2 h-6 w-px bg-border/70" />
          <Button
            size="sm"
            variant="secondary"
            className="h-9 px-3 gap-2"
            onClick={onMagic}
          >
            <Wand2 className="h-4 w-4" />
            <span className="text-xs font-medium">Agent Assist</span>
          </Button>
        </>
      )}
    </div>
  );
}

