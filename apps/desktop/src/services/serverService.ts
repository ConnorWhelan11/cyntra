/**
 * Server-related Tauri IPC service
 */

import { invoke } from "@tauri-apps/api/core";
import type { ServerInfo } from "@/types";

export async function getServerInfo(): Promise<ServerInfo> {
  return invoke<ServerInfo>("get_server_info");
}

export async function setServerRoots(params: {
  viewerDir: string | null;
  projectRoot: string | null;
}): Promise<void> {
  return invoke("set_server_roots", { params });
}
