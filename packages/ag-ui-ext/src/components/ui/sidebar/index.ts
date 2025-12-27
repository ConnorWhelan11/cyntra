// Core exports
export { ANIMATION_CONFIG, ms } from "./core/animations";
export { DesktopSidebar, Sidebar, SidebarBody } from "./core/SidebarBody";
export { SidebarProvider, useSidebar } from "./core/SidebarContext";

// Collapsed components
export { CollapsedShard } from "./collapsed/CollapsedShard";
export { EmbeddedShard } from "./collapsed/EmbeddedShard";
export { ShardPip } from "./collapsed/ShardPip";

// Expanded components
export { MorphingSidebar } from "./expanded/MorphingSidebar";
export { SidebarFeaturedCard } from "./expanded/SidebarFeaturedCard";
export { SidebarLink } from "./expanded/SidebarLink";
export { SidebarModule } from "./expanded/SidebarModule";
export { SidebarRealmsSection } from "./expanded/SidebarRealmsSection";
export { SidebarSection } from "./expanded/SidebarSection";
export { SidebarToolsSlab } from "./expanded/SidebarToolsSlab";

// Mobile components
export { MobileSidebar } from "./mobile/MobileSidebar";

// Types
export type {
  AnimationDirection,
  AnimationPhase,
  CollapsedShardProps,
  DesktopSidebarProps,
  DockItem,
  EmbeddedShardProps,
  Links,
  MorphingSidebarProps,
  RealmDef,
  SidebarAccent,
  SidebarContextProps,
  SidebarFeaturedCardProps,
  SidebarModuleProps,
  SidebarRealmsSectionProps,
  SidebarToolsSlabProps,
} from "./types";

// Styles
export {
  accentColorMap,
  getLinkAccentStyles,
  getModuleAccentStyles,
  getSectionAccentStyles,
  getShardPipStyles,
} from "./styles";
