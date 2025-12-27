"use client";

/**
 * Premed Shapes Panel — Sidebar UI
 * Displays searchable, categorized shape library with click-to-insert
 */

import { Search, Check, AlertCircle, Beaker, Brain, HeartPulse, Atom } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { cn } from "../../../lib/utils";
import { Input } from "../../ui/input";
import { getAllShapes, getShapesByCategory, SHAPE_CATEGORIES } from "./shapeRegistry";
import { filterShapes } from "./search";
import { insertShapeIntoCanvas, getNextInsertPosition } from "./insertShape";
import type { ShapeCategory, ShapeEntry } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PremedShapesPanelProps {
  /** draw.io ref with merge action */
  drawioRef?: { merge: (data: { xml: string }) => void } | null;
  /** Callback when a shape is inserted */
  onInsert?: (shape: ShapeEntry) => void;
  /** Callback when insertion fails */
  onInsertError?: (shape: ShapeEntry, error: Error) => void;
  /** Optional className */
  className?: string;
}

type InsertStatus = "idle" | "success" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Category Icons
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<ShapeCategory | "all", React.ReactNode> = {
  all: null,
  clinical: <HeartPulse className="h-3.5 w-3.5" />,
  lab: <Beaker className="h-3.5 w-3.5" />,
  anatomy: <Brain className="h-3.5 w-3.5" />,
  "bio-chem": <Atom className="h-3.5 w-3.5" />,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function PremedShapesPanel({
  drawioRef,
  onInsert,
  onInsertError,
  className,
}: PremedShapesPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ShapeCategory | "all">("all");
  const [insertCount, setInsertCount] = useState(0);
  const [lastInserted, setLastInserted] = useState<string | null>(null);
  const [insertStatus, setInsertStatus] = useState<InsertStatus>("idle");

  // Get filtered shapes
  const allShapes = useMemo(() => getAllShapes(), []);
  const filteredResults = useMemo(
    () => filterShapes(allShapes, { category: activeCategory, query: searchQuery }),
    [allShapes, activeCategory, searchQuery]
  );

  // Handle shape insertion
  const handleInsertShape = useCallback(
    (shape: ShapeEntry) => {
      if (!drawioRef) {
        setInsertStatus("error");
        onInsertError?.(shape, new Error("Canvas not ready"));
        setTimeout(() => setInsertStatus("idle"), 2000);
        return;
      }

      try {
        const position = getNextInsertPosition(insertCount);
        const success = insertShapeIntoCanvas(drawioRef, shape, position);

        if (success) {
          setInsertCount((c) => c + 1);
          setLastInserted(shape.id);
          setInsertStatus("success");
          onInsert?.(shape);
          setTimeout(() => {
            setInsertStatus("idle");
            setLastInserted(null);
          }, 1500);
        } else {
          throw new Error("Merge failed");
        }
      } catch (error) {
        setInsertStatus("error");
        onInsertError?.(shape, error instanceof Error ? error : new Error("Unknown error"));
        setTimeout(() => setInsertStatus("idle"), 2000);
      }
    },
    [drawioRef, insertCount, onInsert, onInsertError]
  );

  const isCanvasReady = !!drawioRef;

  return (
    <div className={cn("flex h-full flex-col gap-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Premed Shapes</h3>
        {insertStatus === "success" && (
          <span className="flex items-center gap-1 text-xs text-emerald-500">
            <Check className="h-3 w-3" />
            Inserted
          </span>
        )}
        {insertStatus === "error" && (
          <span className="flex items-center gap-1 text-xs text-red-500">
            <AlertCircle className="h-3 w-3" />
            Failed
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search shapes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 pl-9 text-sm"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1.5">
        <CategoryTab
          id="all"
          label="All"
          count={allShapes.length}
          isActive={activeCategory === "all"}
          onClick={() => setActiveCategory("all")}
        />
        {SHAPE_CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat.id}
            id={cat.id}
            label={cat.label}
            count={getShapesByCategory(cat.id).length}
            isActive={activeCategory === cat.id}
            onClick={() => setActiveCategory(cat.id)}
          />
        ))}
      </div>

      {/* Canvas Status Warning */}
      {!isCanvasReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          Canvas not ready. Open the drawboard to insert shapes.
        </div>
      )}

      {/* Shape Grid */}
      <div className="flex-1 overflow-auto">
        {filteredResults.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No shapes found
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredResults.map(({ shape }) => (
              <ShapeButton
                key={shape.id}
                shape={shape}
                isInserted={lastInserted === shape.id}
                disabled={!isCanvasReady}
                onClick={() => handleInsertShape(shape)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/40 pt-2 text-xs text-muted-foreground">
        {filteredResults.length} shape{filteredResults.length !== 1 ? "s" : ""} • Click to insert
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryTabProps {
  id: ShapeCategory | "all";
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function CategoryTab({ id, label, count, isActive, onClick }: CategoryTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {CATEGORY_ICONS[id]}
      {label}
      <span className="text-[10px] opacity-70">({count})</span>
    </button>
  );
}

interface ShapeButtonProps {
  shape: ShapeEntry;
  isInserted: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ShapeButton({ shape, isInserted, disabled, onClick }: ShapeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Insert ${shape.name}`}
      className={cn(
        "group relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all",
        "hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        isInserted && "border-emerald-500/50 bg-emerald-500/10"
      )}
    >
      {/* Shape Preview */}
      <div className="relative h-10 w-10 flex items-center justify-center">
        <img
          src={shape.svgDataUri}
          alt={shape.name}
          className="h-8 w-8 object-contain"
          draggable={false}
        />
        {isInserted && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
        )}
      </div>

      {/* Shape Name */}
      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground leading-tight text-center line-clamp-2">
        {shape.name}
      </span>
    </button>
  );
}

export default PremedShapesPanel;
