/**
 * Gameplay-related Tauri IPC service
 *
 * Handles communication with Rust backend for:
 * - Loading/saving gameplay.yaml configs
 * - Validation against 3D asset markers
 * - Runtime state communication
 */

import { invoke } from '@tauri-apps/api/core';
import type { GameplayConfig, ValidationReport } from '@/types';

/**
 * Load gameplay.yaml from a world directory
 */
export async function loadGameplay(worldPath: string): Promise<GameplayConfig> {
  return invoke<GameplayConfig>('load_gameplay', { worldPath });
}

/**
 * Save gameplay config to gameplay.yaml
 */
export async function saveGameplay(
  worldPath: string,
  config: GameplayConfig
): Promise<void> {
  return invoke('save_gameplay', { worldPath, config });
}

/**
 * Validate gameplay config against GLB markers
 */
export async function validateGameplay(worldPath: string): Promise<ValidationReport> {
  return invoke<ValidationReport>('validate_gameplay', { worldPath });
}

/**
 * Get marker names from a GLB file
 */
export async function getMarkerNames(glbPath: string): Promise<string[]> {
  return invoke<string[]>('get_marker_names', { glbPath });
}

/**
 * Export gameplay config to JSON format for Godot
 */
export async function exportGameplayJson(
  worldPath: string,
  outputPath: string
): Promise<void> {
  return invoke('export_gameplay_json', { worldPath, outputPath });
}

/**
 * Check if gameplay.yaml exists in a world directory
 */
export async function gameplayExists(worldPath: string): Promise<boolean> {
  return invoke<boolean>('gameplay_exists', { worldPath });
}

/**
 * Get list of available patrol paths from markers
 */
export async function getPatrolPaths(glbPath: string): Promise<string[]> {
  return invoke<string[]>('get_patrol_paths', { glbPath });
}

/**
 * Create a new empty gameplay config with defaults
 */
export function createEmptyGameplayConfig(worldId: string): GameplayConfig {
  return {
    schema_version: '1.0',
    world_id: worldId,
    player: {
      spawn_marker: 'PLAYER_SPAWN',
      spawn_rotation: 0,
      movement: {
        walk_speed: 3.0,
        run_speed: 6.0,
        can_crouch: true,
        can_jump: true,
      },
      interaction: {
        reach_distance: 2.5,
        prompt_key: 'E',
      },
    },
    entities: {},
    interactions: {},
    triggers: {},
    audio_zones: {},
    objectives: [],
    rules: {
      inventory: {
        max_slots: 12,
        allow_drop: true,
      },
      save: {
        auto_save: true,
        save_points_only: false,
      },
    },
  };
}
