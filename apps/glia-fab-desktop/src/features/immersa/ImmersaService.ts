/**
 * Immersa Tauri IPC service
 * Wraps Tauri commands for presentation and asset management
 */

import { invoke } from "@tauri-apps/api/core";
import type { ImmersaAsset } from "@/types";

/**
 * List all GLB assets available in the project
 */
export async function listImmersaAssets(
  projectRoot: string
): Promise<ImmersaAsset[]> {
  return invoke<ImmersaAsset[]>("list_immersa_assets", {
    projectRoot,
  });
}

/**
 * Save a presentation to the project's Immersa data directory
 */
export async function savePresentation(
  projectRoot: string,
  id: string,
  data: unknown
): Promise<void> {
  const dataStr = JSON.stringify(data);
  await invoke("save_immersa_presentation", {
    params: {
      projectRoot,
      id,
      data: dataStr,
    },
  });
}

/**
 * Load a presentation from the project's Immersa data directory
 */
export async function loadPresentation(
  projectRoot: string,
  id: string
): Promise<unknown | null> {
  try {
    const dataStr = await invoke<string>("load_immersa_presentation", {
      params: {
        projectRoot,
        id,
      },
    });
    return JSON.parse(dataStr) as unknown;
  } catch {
    return null;
  }
}

/**
 * List all presentation IDs in the project
 */
export async function listPresentations(
  projectRoot: string
): Promise<string[]> {
  return invoke<string[]>("list_immersa_presentations", {
    projectRoot,
  });
}

/**
 * Delete a presentation from the project
 */
export async function deletePresentation(
  projectRoot: string,
  id: string
): Promise<void> {
  await invoke("delete_immersa_presentation", {
    params: {
      projectRoot,
      id,
    },
  });
}
