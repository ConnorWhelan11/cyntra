import { inflate } from "pako";

export type DiagramExport = {
  raw: string;
  xml?: string | null;
};

/**
 * Extracts the diagram XML from the draw.io export payload.
 * The incoming string is a base64 SVG data URL produced by draw.io.
 */
export function extractDiagramXML(xmlSvgString: string): string | null {
  try {
    const base64Prefix = "data:image/svg+xml;base64,";
    const trimmed =
      xmlSvgString.startsWith(base64Prefix)
        ? xmlSvgString.slice(base64Prefix.length)
        : xmlSvgString;

    const svgString = base64Decode(trimmed);
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgElement = svgDoc.querySelector("svg");
    const encodedContent = svgElement?.getAttribute("content");
    if (!encodedContent) return null;

    const xmlContent = decodeHtmlEntities(encodedContent);
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    const diagramElement = xmlDoc.querySelector("diagram");
    const base64Diagram = diagramElement?.textContent;
    if (!base64Diagram) return null;

    const binary = base64ToUint8Array(base64Diagram);
    const decompressed = inflate(binary, { windowBits: -15 });
    const decoded = new TextDecoder("utf-8").decode(decompressed);
    return decodeURIComponent(decoded);
  } catch (error) {
    console.error("[drawio] Failed to extract diagram XML", error);
    return null;
  }
}

export function createEmptyDiagramXML(): string {
  return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
}

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

function base64Decode(input: string): string {
  if (typeof atob === "function") {
    return atob(input);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "base64").toString("binary");
  }
  throw new Error("No base64 decoder available in this environment");
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = base64Decode(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

