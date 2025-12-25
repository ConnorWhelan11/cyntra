/**
 * Immersa-specific types
 * Re-exports from common for convenience
 */

export type { ImmersaPresentation, ImmersaAsset } from "@/types";

/**
 * Message types for postMessage bridge communication
 */
export type ImmersaMessageType =
  | "ready"
  | "save_presentation"
  | "request_assets"
  | "load_assets"
  | "load_presentation"
  | "project_changed";

export interface ImmersaMessage {
  type: ImmersaMessageType;
  payload?: unknown;
}

export interface ImmersaSavePayload {
  id: string;
  title: string;
  data: unknown;
}

export interface ImmersaLoadAssetsPayload {
  assets: Array<{
    name: string;
    path: string;
    url: string;
    size: number;
  }>;
}

export interface ImmersaLoadPresentationPayload {
  id: string;
  data: unknown;
}
