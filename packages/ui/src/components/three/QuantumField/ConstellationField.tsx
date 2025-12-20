"use client";

/**
 * Constellation Field - Style A Implementation
 *
 * A faint, quasi-sacred lattice with iridescent interference, harmonic burst rings,
 * and constellation-like points that brighten near interactions.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FieldBus } from "./FieldBus";
import { clientToNdc } from "./domMapping";
import {
  createConstellationMaterial,
  createConstellationPointsGeometry,
  createConstellationPointsMaterial,
  createConstellationUniforms,
  type ConstellationUniforms,
} from "./styles/styleA";
import { TrailRTT } from "./TrailRTT";
import type { FieldConfig, FieldRuntimeState } from "./types";

// Reusable raycast objects
const _raycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();
const _intersections: THREE.Intersection[] = [];

interface ConstellationFieldProps {
  bus: FieldBus;
  config: FieldConfig;
}

export function ConstellationField({ bus, config }: ConstellationFieldProps) {
  const { camera, size, gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const trailRttRef = useRef<TrailRTT | null>(null);
  const uniformsRef = useRef<ConstellationUniforms | null>(null);

  // Local refs for state (avoid re-renders)
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

  // Calculate plane size based on camera
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

  // Create uniforms (shared between plane and points)
  const uniforms = useMemo(() => {
    const u = createConstellationUniforms();
    u.uResolution.value.set(size.width, size.height);
    u.uProbeRadius.value = config.probeRadius;
    uniformsRef.current = u;
    return u;
  }, [size.width, size.height, config.probeRadius]);

  // Create plane material
  const planeMaterial = useMemo(() => {
    return createConstellationMaterial(uniforms);
  }, [uniforms]);

  // Create points geometry and material
  const pointsGeometry = useMemo(() => {
    return createConstellationPointsGeometry(
      config.pointsCount,
      planeSize.width,
      planeSize.height
    );
  }, [config.pointsCount, planeSize.width, planeSize.height]);

  const pointsMaterial = useMemo(() => {
    return createConstellationPointsMaterial(uniforms);
  }, [uniforms]);

  // Initialize trail RTT
  useEffect(() => {
    if (config.enableTrails) {
      trailRttRef.current = new TrailRTT(
        config.rttResolution,
        config.rttResolution
      );
      trailRttRef.current.init(gl);
      uniforms.uTrailEnabled.value = 1;
    } else {
      uniforms.uTrailEnabled.value = 0;
    }

    return () => {
      if (trailRttRef.current) {
        trailRttRef.current.dispose();
        trailRttRef.current = null;
      }
    };
  }, [config.enableTrails, config.rttResolution, gl, uniforms]);

  // Animation frame
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const currentTs = Date.now();
    const currentState = stateRef.current;

    // Process pending events with raycast UV computation
    bus.processPendingWithUv(computeUv);

    // Tick the bus
    bus.tick(delta * 1000, currentTs);

    // Update time
    uniforms.uTime.value = state.clock.elapsedTime;

    // Update hover uniform
    const hover = currentState.hover;
    if (hover.active) {
      uniforms.uHover.value.set(
        hover.uv.x,
        hover.uv.y,
        hover.intent === "etch" ? 1 : 0,
        1
      );

      // Update trail RTT if etch mode
      if (config.enableTrails && trailRttRef.current && hover.intent === "etch") {
        trailRttRef.current.update({
          decay: config.etchDecay,
          injectPos: hover.uv,
          injectStrength: 0.8,
          injectRadius: 0.015,
        });
        uniforms.uTrailTex.value = trailRttRef.current.getTexture();
      } else if (config.enableTrails && trailRttRef.current) {
        // Just decay existing trails
        trailRttRef.current.update({
          decay: config.etchDecay,
          injectPos: null,
          injectStrength: 0,
        });
        uniforms.uTrailTex.value = trailRttRef.current.getTexture();
      }
    } else {
      uniforms.uHover.value.w = 0;

      // Decay trails when not hovering
      if (config.enableTrails && trailRttRef.current) {
        trailRttRef.current.update({
          decay: config.etchDecay,
          injectPos: null,
          injectStrength: 0,
        });
        uniforms.uTrailTex.value = trailRttRef.current.getTexture();
      }
    }

    // Update impulses
    const impulses = currentState.impulses;
    uniforms.uImpulseCount.value = impulses.length;

    for (let i = 0; i < 24; i++) {
      if (i < impulses.length) {
        const imp = impulses[i];
        const age = Math.min(
          1,
          (currentTs - imp.startTs) / config.impulseDecayMs
        );
        uniforms.uImpulses.value[i].set(
          imp.uv.x,
          imp.uv.y,
          imp.radius,
          imp.amplitude
        );
        uniforms.uImpulsesAge.value[i] = age;
      } else {
        uniforms.uImpulsesAge.value[i] = 1;
      }
    }

    // Update anchors
    const anchors = Array.from(currentState.anchors.values());
    uniforms.uAnchorCount.value = anchors.length;

    for (let i = 0; i < 8; i++) {
      if (i < anchors.length) {
        const anchor = anchors[i];
        const phase = (currentTs - anchor.createdTs) * 0.001;
        uniforms.uAnchors.value[i].set(
          anchor.uv.x,
          anchor.uv.y,
          anchor.strength,
          phase
        );
      }
    }
  });

  // Dispose on unmount
  useEffect(() => {
    return () => {
      planeMaterial.dispose();
      pointsMaterial.dispose();
      pointsGeometry.dispose();
    };
  }, [planeMaterial, pointsMaterial, pointsGeometry]);

  return (
    <group>
      {/* Main plane with constellation shader */}
      <mesh ref={meshRef} position={[0, 0, 0]} material={planeMaterial}>
        <planeGeometry args={[planeSize.width, planeSize.height]} />
      </mesh>

      {/* Points layer */}
      <points ref={pointsRef} geometry={pointsGeometry} material={pointsMaterial} />
    </group>
  );
}

