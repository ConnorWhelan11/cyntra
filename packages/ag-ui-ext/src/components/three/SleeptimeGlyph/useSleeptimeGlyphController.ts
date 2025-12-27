import { useEffect } from "react";
import * as THREE from "three";
import type { SleeptimeGlyphState } from "./types";
import { STATE_SPEEDS } from "./types";

type ActionsMap = Record<string, THREE.AnimationAction | undefined>;

/**
 * Maps sleeptime states to base glyph animation states.
 * Sleeptime uses a subset of the glyph animations with modified timing.
 */
const STATE_TO_GLYPH: Record<SleeptimeGlyphState, string> = {
  dormant: "Sleep",
  ingesting: "Thinking",
  distilling: "Thinking",
  consolidating: "Responding",
  injecting: "Responding",
  complete: "Success",
};

const LOOP_STATES: SleeptimeGlyphState[] = [
  "dormant",
  "ingesting",
  "distilling",
  "consolidating",
  "injecting",
];

function getPrefixForState(state: SleeptimeGlyphState): string {
  const glyphState = STATE_TO_GLYPH[state];
  return `Glyph_${glyphState}_`;
}

export function useSleeptimeGlyphController(state: SleeptimeGlyphState, actions: ActionsMap) {
  useEffect(() => {
    if (!actions) return;

    const prefix = getPrefixForState(state);
    const loop = LOOP_STATES.includes(state);
    const speed = STATE_SPEEDS[state];

    // Find matching actions
    const targetActions = Object.entries(actions)
      .filter(([name]) => name.startsWith(prefix))
      .map(([, action]) => action)
      .filter((a): a is THREE.AnimationAction => !!a);

    if (targetActions.length === 0) {
      // Fallback to Idle if state animation doesn't exist
      const idleActions = Object.entries(actions)
        .filter(([name]) => name.startsWith("Glyph_Idle_"))
        .map(([, action]) => action)
        .filter((a): a is THREE.AnimationAction => !!a);

      if (idleActions.length > 0) {
        Object.values(actions).forEach((action) => {
          if (!action || !action.isRunning()) return;
          action.fadeOut(0.5);
        });

        idleActions.forEach((action) => {
          action.reset();
          action.setEffectiveTimeScale(speed);
          action.setEffectiveWeight(1);
          action.loop = THREE.LoopRepeat;
          action.fadeIn(0.5).play();
        });
      }
      return;
    }

    // Fade out current animations
    Object.values(actions).forEach((action) => {
      if (!action || !action.isRunning()) return;
      action.fadeOut(0.5); // Slower fade for dreamier feel
    });

    // Configure and play target animations
    targetActions.forEach((action) => {
      action.reset();
      action.setEffectiveTimeScale(speed);
      action.setEffectiveWeight(1);
      action.clampWhenFinished = !loop;
      action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
      action.fadeIn(0.5).play();
    });
  }, [state, actions]);
}
