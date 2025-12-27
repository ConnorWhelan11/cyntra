export type GlyphState =
  | "idle"
  | "listening"
  | "thinking"
  | "responding"
  | "success"
  | "error"
  | "sleep";

export interface GlyphObjectProps {
  state?: GlyphState;
  scale?: number;
  position?: [number, number, number];
  variant?: "default" | "inGraph";
  /** Override model URL if you ever host it elsewhere */
  modelUrl?: string;
}

export interface GlyphSceneProps extends GlyphObjectProps {
  className?: string;
}
