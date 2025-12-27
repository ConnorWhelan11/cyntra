import { useEffect } from "react";
import * as THREE from "three";
import type { GlyphState } from "./types";

type ActionsMap = Record<string, THREE.AnimationAction | undefined>;

const LOOP_STATES: GlyphState[] = ["idle", "listening", "thinking", "sleep"];

function getPrefixForState(state: GlyphState): string {
  // Must match your Blender action naming: Glyph_Idle_Core, Glyph_Idle_Root, ...
  const capitalized = state.charAt(0).toUpperCase() + state.slice(1);
  return `Glyph_${capitalized}_`;
}

export function useGlyphController(state: GlyphState, actions: ActionsMap) {
  useEffect(() => {
    if (!actions) return;

    const prefix = getPrefixForState(state);
    const loop = LOOP_STATES.includes(state);

    // Figure out which actions belong to this state
    const targetActions = Object.entries(actions)
      .filter(([name]) => name.startsWith(prefix))
      .map(([, action]) => action)
      .filter((a): a is THREE.AnimationAction => !!a);

    // If we don't have any actions for this state yet, just stay with whatever was playing
    if (targetActions.length === 0) {
      return;
    }

    // Fade out everything first
    Object.values(actions).forEach((action) => {
      if (!action || !action.isRunning()) return;
      action.fadeOut(0.3);
    });

    // Configure and play all actions for this state
    targetActions.forEach((action) => {
      action.reset();
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(1);
      action.clampWhenFinished = !loop;
      action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
      action.fadeIn(0.3).play();
    });
  }, [state, actions]);
}
