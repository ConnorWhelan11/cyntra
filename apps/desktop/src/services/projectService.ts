/**
 * Project-related Tauri IPC service
 */

import { invoke } from "@tauri-apps/api/core";
import type { ProjectInfo } from "@/types";

export async function detectProject(root: string): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("detect_project", { root });
}

export async function getGlobalEnv(): Promise<string | null> {
  return invoke<string | null>("get_global_env");
}

export async function setGlobalEnv(text: string): Promise<void> {
  return invoke("set_global_env", { params: { text } });
}

export async function clearGlobalEnv(): Promise<void> {
  return invoke("clear_global_env");
}
