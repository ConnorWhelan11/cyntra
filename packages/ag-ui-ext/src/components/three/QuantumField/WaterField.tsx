"use client";

/**
 * Water Field - Style C Implementation
 *
 * A glassy, watery membrane with damped ripple simulation.
 * Hover creates small ripples; etch writes capillary trails;
 * click produces impulse rings; latch creates standing wave nodes.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FieldBus } from "./FieldBus";
import { clientToNdc } from "./domMapping";
import { createWaterMaterial, createWaterUniforms, type WaterUniforms } from "./styles/styleC";
import { WaterSimRTT } from "./WaterSimRTT";
import type { FieldConfig, FieldRuntimeState } from "./types";

// Reusable raycast objects
const _raycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();
const _intersections: THREE.Intersection[] = [];

interface WaterFieldProps {
  bus: FieldBus;
  config: FieldConfig;
}

export function WaterField({ bus, config }: WaterFieldProps) {
  const { camera, size, gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const simRef = useRef<WaterSimRTT | null>(null);
  const uniformsRef = useRef<WaterUniforms | null>(null);

  // Local refs for state
  const stateRef = useRef<FieldRuntimeState>(bus.getSnapshot());

  // Subscribe to bus updates
  useEffect(() => {
    const unsub = bus.subscribe((state) => {
      stateRef.current = state;
    });
    return unsub;
  }, [bus]);

  // UV computation via raycast
  const computeUv = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      if (!meshRef.current) return null;

      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();

      const ndc = clientToNdc(clientX - rect.left, clientY - rect.top, {
        width: rect.width,
        height: rect.height,
      });

      _ndcVec.set(ndc.x, ndc.y);
      _raycaster.setFromCamera(_ndcVec, camera);

      _intersections.length = 0;
      meshRef.current.raycast(_raycaster, _intersections);

      if (_intersections.length > 0 && _intersections[0].uv) {
        return {
          x: _intersections[0].uv.x,
          y: _intersections[0].uv.y,
        };
      }

      return null;
    },
    [camera, gl.domElement]
  );

  // Calculate plane size
  const planeSize = useMemo(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = camera.position.z;
      const vFov = (camera.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * (size.width / size.height);
      return { width: width * 1.2, height: height * 1.2 };
    }
    return { width: 20, height: 15 };
  }, [camera, size]);

  // Create uniforms
  const uniforms = useMemo(() => {
    const u = createWaterUniforms();
    u.uResolution.value.set(size.width, size.height);
    u.uProbeRadius.value = config.probeRadius;
    uniformsRef.current = u;
    return u;
  }, [size.width, size.height, config.probeRadius]);

  // Create material
  const material = useMemo(() => {
    return createWaterMaterial(uniforms);
  }, [uniforms]);

  // Initialize water simulation
  useEffect(() => {
    simRef.current = new WaterSimRTT(config.rttResolution);
    simRef.current.init(gl);

    return () => {
      if (simRef.current) {
        simRef.current.dispose();
        simRef.current = null;
      }
    };
  }, [config.rttResolution, gl]);

  // Track last hover position for continuous ripples
  const lastHoverRef = useRef<{ x: number; y: number } | null>(null);

  // Animation frame
  useFrame((state, delta) => {
    if (!meshRef.current || !simRef.current) return;

    const currentTs = Date.now();
    const currentState = stateRef.current;
    const sim = simRef.current;

    // Process pending bus events
    bus.processPendingWithUv(computeUv);

    // Tick the bus
    bus.tick(delta * 1000, currentTs);

    // Update time
    uniforms.uTime.value = state.clock.elapsedTime;

    // Prepare impulse for this frame
    let frameImpulse: { pos: { x: number; y: number }; strength: number; radius: number } | null =
      null;

    // Handle hover - create small continuous ripples
    const hover = currentState.hover;
    if (hover.active) {
      uniforms.uHover.value.set(hover.uv.x, hover.uv.y, hover.intent === "etch" ? 1 : 0, 1);

      // Continuous small ripples while hovering
      const rippleStrength = hover.intent === "etch" ? 0.15 : 0.05;

      // Only create ripple if position changed (avoid standing waves from stationary hover)
      if (lastHoverRef.current) {
        const moved =
          Math.abs(hover.uv.x - lastHoverRef.current.x) > 0.005 ||
          Math.abs(hover.uv.y - lastHoverRef.current.y) > 0.005;
        if (moved) {
          frameImpulse = {
            pos: hover.uv,
            strength: rippleStrength,
            radius: 0.02,
          };
        }
      }
      lastHoverRef.current = { ...hover.uv };
    } else {
      uniforms.uHover.value.w = 0;
      lastHoverRef.current = null;
    }

    // Handle bursts - strong impulses
    const impulses = currentState.impulses;
    for (const imp of impulses) {
      const age = (currentTs - imp.startTs) / config.impulseDecayMs;
      // Only add impulse in first frame
      if (age < 0.05) {
        frameImpulse = {
          pos: imp.uv,
          strength: imp.amplitude * 0.5,
          radius: imp.radius,
        };
      }
    }

    // Prepare anchors for simulation
    const anchors = Array.from(currentState.anchors.values()).map((anchor) => ({
      uv: anchor.uv,
      strength: anchor.strength,
      phase: (currentTs - anchor.createdTs) * 0.001,
    }));

    // Update simulation
    sim.update({
      time: state.clock.elapsedTime,
      damping: 0.015, // Lower damping for longer ripples
      waveSpeed: 0.4,
      impulsePos: frameImpulse?.pos ?? null,
      impulseStrength: frameImpulse?.strength ?? 0,
      impulseRadius: frameImpulse?.radius ?? 0.03,
      anchors,
    });

    // Update shader textures
    uniforms.uHeightTex.value = sim.getTexture();
    uniforms.uPrevHeightTex.value = sim.getPrevTexture();

    // Update anchor uniforms for shader visualization
    uniforms.uAnchorCount.value = anchors.length;
    for (let i = 0; i < 8; i++) {
      if (i < anchors.length) {
        const a = anchors[i];
        uniforms.uAnchors.value[i].set(a.uv.x, a.uv.y, a.strength, a.phase);
      }
    }
  });

  // Dispose on unmount
  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} material={material}>
      <planeGeometry args={[planeSize.width, planeSize.height]} />
    </mesh>
  );
}
