/**
 * Shell Plugin System - Type Definitions
 */
import type { ReactNode } from "react";
import type { SigilName } from "@/components/shared/sigils";

export type AppId = string;

export interface PluginSession {
  id: string;
  appId: AppId;
  label: string;
  meta?: Record<string, unknown>;
  lastAccessed?: number;
}

export interface PluginRoute {
  path: string;
  element: ReactNode;
  index?: boolean;
}

export interface PluginCommand {
  id: string;
  title: string;
  shortcut?: string;
  handler: () => void | Promise<void>;
}

export interface SessionProvider {
  getSessions: () => PluginSession[] | Promise<PluginSession[]>;
  createSession: (label?: string, meta?: Record<string, unknown>) => PluginSession | Promise<PluginSession>;
  deleteSession: (sessionId: string) => void | Promise<void>;
  getSession: (sessionId: string) => PluginSession | null | Promise<PluginSession | null>;
}

export interface AppPlugin {
  id: AppId;
  name: string;
  sigil: SigilName;
  order: number;
  routes: PluginRoute[];
  sessionProvider?: SessionProvider;
  commands?: PluginCommand[];
}

export interface PluginRegistry {
  getPlugins: () => AppPlugin[];
  getPlugin: (id: AppId) => AppPlugin | undefined;
}
