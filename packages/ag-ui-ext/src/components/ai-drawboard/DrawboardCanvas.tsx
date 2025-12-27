"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { DrawIoEmbed, type DrawIoEmbedRef } from "react-drawio";
import { cn } from "../../lib/utils";
import { createEmptyDiagramXML, extractDiagramXML, type DiagramExport } from "./drawioUtils";

// Mirrors react-drawio ExportFormats (not exported by the package types)
export type DrawboardExportFormat = "html" | "html2" | "svg" | "xmlsvg" | "png" | "xmlpng";

export type DrawboardCanvasHandle = {
  /**
   * Trigger a draw.io export. Defaults to "xmlsvg" which contains both XML + SVG.
   */
  exportDiagram: (format?: DrawboardExportFormat) => void;
  /**
   * Load a full draw.io XML document.
   */
  loadDiagram: (xml: string) => void;
  /**
   * Access the underlying draw.io ref for advanced use.
   */
  getInstance: () => DrawIoEmbedRef | null;
};

export type DrawboardCanvasProps = {
  /**
   * Initial draw.io XML to load. If omitted, an empty diagram is loaded.
   */
  initialXml?: string;
  /**
   * Called whenever draw.io exports content (e.g., after exportDiagram).
   * Provides both the raw export payload and the extracted XML (if available).
   */
  onExport?: (payload: DiagramExport) => void;
  /**
   * Convenience callback fired when XML is successfully extracted from an export.
   */
  onXmlChange?: (xml: string) => void;
  /**
   * Optional additional url parameters forwarded to draw.io.
   */
  urlParameters?: Record<string, unknown>;
  /**
   * Optional className to style the container.
   */
  className?: string;
};

const defaultUrlParams = {
  spin: true,
  libraries: false,
  saveAndExit: false,
  noExitBtn: true,
};

export const DrawboardCanvas = forwardRef<DrawboardCanvasHandle, DrawboardCanvasProps>(
  function DrawboardCanvas(
    { initialXml, onExport, onXmlChange, urlParameters, className }: DrawboardCanvasProps,
    ref
  ) {
    const drawioRef = useRef<DrawIoEmbedRef | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        exportDiagram: (format: DrawboardExportFormat = "xmlsvg") => {
          drawioRef.current?.exportDiagram({ format });
        },
        loadDiagram: (xml: string) => {
          drawioRef.current?.load({ xml });
        },
        getInstance: () => drawioRef.current,
      }),
      []
    );

    useEffect(() => {
      if (drawioRef.current) {
        const xmlToLoad = initialXml || createEmptyDiagramXML();
        drawioRef.current.load({ xml: xmlToLoad });
      }
    }, [initialXml]);

    const handleExport = (data: unknown) => {
      const raw = (() => {
        if (!data || typeof data !== "object") return "";
        const payload = (data as { data?: unknown }).data;
        return typeof payload === "string" ? payload : "";
      })();

      const xml = raw ? extractDiagramXML(raw) : null;
      onExport?.({ raw, xml });
      if (xml) {
        onXmlChange?.(xml);
      }
    };

    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-2xl border border-border/50 bg-background shadow-sm",
          className
        )}
      >
        <DrawIoEmbed
          ref={drawioRef}
          onExport={handleExport}
          urlParameters={{ ...defaultUrlParams, ...urlParameters }}
        />
      </div>
    );
  }
);
