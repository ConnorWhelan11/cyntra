import React from "react";

export interface DockItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  hasActivity?: boolean;
}

export interface RealmDef {
  id: string;
  name: string;
  shortName?: string; // e.g., "OUTORA"
  pixelColors: string[];
  accentColor: string;
  isLocked?: boolean;
}

export interface CollapsedShardProps {
  activeRealm: RealmDef;
  realms?: RealmDef[];
  studioDocks: DockItem[];
  socialDocks: DockItem[];
  onExpandSidebar: () => void;
  onDockClick?: (dock: DockItem, section: "studio" | "social") => void;
  onRealmChange?: (realm: RealmDef) => void;
  sessionProgress?: number; // 0-1 for active session
  className?: string;
}

export interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

export type AnimationPhase = "idle" | "phase1" | "phase2" | "phase3" | "phase4";
export type AnimationDirection = "opening" | "closing" | null;

export interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
  // Animation state
  animationPhase: AnimationPhase;
  animationDirection: AnimationDirection;
  isAnimating: boolean;
  // Phase progress (0-1 within current phase)
  phaseProgress: number;
}

export type SidebarAccent =
  | "cyan"
  | "moonlit_orchid"
  | "teal"
  | "violet"
  | "amber"
  | "emerald"
  | "rose";

export interface DesktopSidebarProps extends React.ComponentProps<"div"> {
  // Shard mode props - when provided, enables the shard collapsed view
  shardMode?: boolean;
  activeRealm?: RealmDef;
  realms?: RealmDef[];
  studioDocks?: DockItem[];
  socialDocks?: DockItem[];
  onDockClick?: (dock: DockItem, section: "studio" | "social") => void;
  onRealmChange?: (realm: RealmDef) => void;
  sessionProgress?: number;
  children?: React.ReactNode;
}

export interface MorphingSidebarProps {
  className?: string;
  activeRealm: RealmDef;
  realms?: RealmDef[];
  studioDocks: DockItem[];
  socialDocks: DockItem[];
  onDockClick?: (dock: DockItem, section: "studio" | "social") => void;
  onRealmChange?: (realm: RealmDef) => void;
  sessionProgress?: number;
  children: React.ReactNode;
}

export interface EmbeddedShardProps {
  activeRealm: RealmDef;
  realms?: RealmDef[];
  studioDocks: DockItem[];
  socialDocks: DockItem[];
  onExpandSidebar: () => void;
  onDockClick?: (dock: DockItem, section: "studio" | "social") => void;
  onRealmChange?: (realm: RealmDef) => void;
  sessionProgress?: number;
  isExpanding: boolean;
}

export interface SidebarModuleProps {
  children: React.ReactNode;
  className?: string;
  accent?: SidebarAccent;
  glowIntensity?: "none" | "subtle" | "medium";
}

export interface SidebarToolsSlabProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
}

export interface SidebarFeaturedCardProps {
  link: Links;
  title?: string;
  subtitle?: string;
  className?: string;
  pixelColors?: string[];
  pixelGap?: number;
  pixelSpeed?: number;
  locked?: boolean;
  accentColor?: "teal" | "violet" | "amber" | "rose";
  compact?: boolean;
}

export interface SidebarRealmsSectionProps {
  children: React.ReactNode;
  className?: string;
}
