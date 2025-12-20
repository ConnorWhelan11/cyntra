"use client";

/**
 * PCB Field - Style B Implementation
 *
 * A technical substrate with circuit-board routing traces and vector-field arrows
 * that "route" energy around UI surfaces.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FieldBus } from "./FieldBus";
import { clientToNdc } from "./domMapping";
import {
  createPcbArrowsGeometry,
  createPcbArrowsMaterial,
  createPcbMaterial,
  createPcbUniforms,
  type PcbUniforms,
} from "./styles/styleB";
import { TrailRTT } from "./TrailRTT";
import type { FieldConfig, FieldRuntimeState } from "./types";

// Reusable raycast objects
const _raycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();
const _intersections: THREE.Intersection[] = [];

interface PcbFieldProps {
  bus: FieldBus;
  config: FieldConfig;
}

export function PcbField({ bus, config }: PcbFieldProps) {
  const { camera, size, gl } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const arrowsRef = useRef<THREE.Points>(null);
  const trailRttRef = useRef<TrailRTT | null>(null);
  const uniformsRef = useRef<PcbUniforms | null>(null);

  // Local refs for state
  const stateRef = useRef<FieldRuntimeState>(bus.getSnapshot());

  // === Phase Lens tracking refs ===
  const lensUvRef = useRef({ x: 0.5, y: 0.5 });
  const prevLensUvRef = useRef({ x: 0.5, y: 0.5 });
  const lensVelocityRef = useRef(0);
  
  // === Etch velocity tracking refs ===
  const prevEtchUvRef = useRef({ x: 0.5, y: 0.5 });
  const etchVelocityRef = useRef(0);

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
    const u = createPcbUniforms();
    u.uResolution.value.set(size.width, size.height);
    u.uProbeRadius.value = config.probeRadius;
    // FIX: Set plane size for correct UV normalization in arrows shader
    u.uPlaneSize.value.set(planeSize.width, planeSize.height);
    // FIX: Set max point size from config to prevent blowout
    u.uMaxPointSize.value = config.arrowsMaxPointSize;
    // === Ultra-Fine Lattice Uniforms ===
    u.uMicroGrid1.value = config.microGrid1;
    u.uMicroGrid2.value = config.microGrid2;
    u.uMicroGridStrength.value = config.microGridStrength;
    u.uRevealStrength.value = config.revealStrength;
    u.uMicroWarp.value = config.microWarp;
    u.uEtchDistortion.value = config.etchDistortion;
    // === Phase Lens Uniforms ===
    u.uLensEnabled.value = config.lensEnabled ? 1 : 0;
    u.uLens.value.set(0.5, 0.5, config.lensRadius, config.lensMagnification);
    u.uLensChromatic.value = config.lensChromatic;
    // === Lattice Mode Uniform ===
    const latticeModeMap = { rect: 0, hex: 1, tri: 2 };
    u.uLatticeMode.value = latticeModeMap[config.latticeMode] ?? 0;
    // === Palette / Atmosphere Uniforms ===
    const paletteModeMap = { "glia-cyan": 0, "orchid": 1, "amber": 2, "mono": 3, "ice": 4 };
    u.uPaletteMode.value = paletteModeMap[config.paletteMode] ?? 1;
    u.uAccentIntensity.value = config.accentIntensity;
    u.uIridescenceStrength.value = config.iridescenceStrength;
    u.uIridescenceScale.value = config.iridescenceScale;
    u.uExposure.value = config.exposure;
    u.uFilmic.value = config.filmic;
    u.uGrainStrength.value = config.grainStrength;
    u.uCrtStrength.value = config.crtStrength;
    u.uCopperStrength.value = config.copperStrength;
    uniformsRef.current = u;
    return u;
  }, [
    size.width, size.height, config.probeRadius,
    planeSize.width, planeSize.height, config.arrowsMaxPointSize,
    config.microGrid1, config.microGrid2, config.microGridStrength,
    config.revealStrength, config.microWarp, config.etchDistortion,
    config.lensEnabled, config.lensRadius, config.lensMagnification,
    config.lensChromatic, config.latticeMode,
    config.paletteMode, config.accentIntensity, config.iridescenceStrength,
    config.iridescenceScale, config.exposure, config.filmic,
    config.grainStrength, config.crtStrength, config.copperStrength,
  ]);

  // Create plane material
  const planeMaterial = useMemo(() => {
    return createPcbMaterial(uniforms);
  }, [uniforms]);

  // Create arrows geometry and material
  // FIX: Reduced arrow count from 40% to 15% of pointsCount to prevent overcrowding
  const arrowCount = Math.floor(config.pointsCount * 0.15);

  const arrowsGeometry = useMemo(() => {
    return createPcbArrowsGeometry(
      arrowCount,
      planeSize.width,
      planeSize.height
    );
  }, [arrowCount, planeSize.width, planeSize.height]);

  const arrowsMaterial = useMemo(() => {
    // FIX: Pass blending mode from config for debugging
    return createPcbArrowsMaterial(uniforms, config.arrowsBlending);
  }, [uniforms, config.arrowsBlending]);

  // Invisible raycast material for when plane is hidden (for hover detection)
  const invisibleMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  }, []);

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

    // Process pending events
    bus.processPendingWithUv(computeUv);

    // Tick the bus
    bus.tick(delta * 1000, currentTs);

    // Update time
    uniforms.uTime.value = state.clock.elapsedTime;

    // Update hover
    const hover = currentState.hover;
    // Compute effective decay (0 if frozen)
    const effectiveDecay = config.etchFreeze ? 0 : config.etchDecay;
    
    // === Phase Lens Tracking (smooth follow with inertia) ===
    if (hover.active && config.lensEnabled) {
      const target = hover.uv;
      const current = lensUvRef.current;
      const inertia = 1 - config.lensInertia;
      
      // Lerp lens position toward hover
      lensUvRef.current = {
        x: current.x + (target.x - current.x) * inertia,
        y: current.y + (target.y - current.y) * inertia,
      };
      
      // Calculate lens velocity (distance traveled per frame, normalized)
      const dx = lensUvRef.current.x - prevLensUvRef.current.x;
      const dy = lensUvRef.current.y - prevLensUvRef.current.y;
      const rawVel = Math.sqrt(dx * dx + dy * dy) / Math.max(delta, 0.001);
      
      // Smooth velocity with exponential decay
      const velSmoothing = 0.85;
      lensVelocityRef.current = lensVelocityRef.current * velSmoothing + rawVel * (1 - velSmoothing);
      
      // Normalize velocity (0-1 range, tuned for typical cursor speeds)
      const normalizedVel = Math.min(lensVelocityRef.current * config.lensVelocityBoost * 2, 1);
      
      // Store prev for next frame
      prevLensUvRef.current = { ...lensUvRef.current };
      
      // Update lens uniforms
      uniforms.uLens.value.set(
        lensUvRef.current.x,
        lensUvRef.current.y,
        config.lensRadius,
        config.lensMagnification
      );
      uniforms.uLensVelocity.value = normalizedVel;
    }
    
    // === Etch Velocity Tracking ===
    let computedEtchRadius = config.etchRadius;
    if (hover.active && hover.intent === "etch") {
      const dx = hover.uv.x - prevEtchUvRef.current.x;
      const dy = hover.uv.y - prevEtchUvRef.current.y;
      const rawVel = Math.sqrt(dx * dx + dy * dy) / Math.max(delta, 0.001);
      
      // Smooth etch velocity
      const velSmoothing = 0.8;
      etchVelocityRef.current = etchVelocityRef.current * velSmoothing + rawVel * (1 - velSmoothing);
      
      // Normalize velocity (0-1)
      const normalizedEtchVel = Math.min(etchVelocityRef.current * config.etchVelocityScale * 3, 1);
      
      // Velocity taper: high velocity = smaller radius
      computedEtchRadius = config.etchRadiusMax - 
        (config.etchRadiusMax - config.etchRadiusMin) * normalizedEtchVel;
      
      prevEtchUvRef.current = { x: hover.uv.x, y: hover.uv.y };
      uniforms.uEtchVelocity.value = normalizedEtchVel;
    } else {
      // Decay etch velocity when not etching
      etchVelocityRef.current *= 0.9;
      uniforms.uEtchVelocity.value = Math.min(etchVelocityRef.current, 1);
    }
    
    if (hover.active) {
      uniforms.uHover.value.set(
        hover.uv.x,
        hover.uv.y,
        hover.intent === "etch" ? 1 : 0,
        1
      );

      // Trail RTT for etch - use velocity-adjusted radius for inscription-quality strokes
      if (config.enableTrails && trailRttRef.current && hover.intent === "etch") {
        trailRttRef.current.update({
          decay: effectiveDecay,
          injectPos: hover.uv,
          injectStrength: config.etchStrength,
          injectRadius: computedEtchRadius,
        });
        uniforms.uTrailTex.value = trailRttRef.current.getTexture();
      } else if (config.enableTrails && trailRttRef.current) {
        trailRttRef.current.update({
          decay: effectiveDecay,
          injectPos: null,
          injectStrength: 0,
        });
        uniforms.uTrailTex.value = trailRttRef.current.getTexture();
      }
    } else {
      uniforms.uHover.value.w = 0;

      if (config.enableTrails && trailRttRef.current) {
        trailRttRef.current.update({
          decay: effectiveDecay,
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
      arrowsMaterial.dispose();
      arrowsGeometry.dispose();
      invisibleMaterial.dispose();
    };
  }, [planeMaterial, arrowsMaterial, arrowsGeometry, invisibleMaterial]);

  return (
    <group>
      {/* Main plane with PCB shader (conditionally rendered for debugging) */}
      {config.showPcbPlane && (
        <mesh ref={meshRef} position={[0, 0, 0]} material={planeMaterial}>
          <planeGeometry args={[planeSize.width, planeSize.height]} />
        </mesh>
      )}
      {/* Invisible mesh for raycasting when plane is hidden */}
      {!config.showPcbPlane && (
        <mesh ref={meshRef} position={[0, 0, 0]} material={invisibleMaterial}>
          <planeGeometry args={[planeSize.width, planeSize.height]} />
        </mesh>
      )}

      {/* Arrow flow layer (conditionally rendered for debugging) */}
      {config.showArrows && (
        <points ref={arrowsRef} geometry={arrowsGeometry} material={arrowsMaterial} />
      )}
    </group>
  );
}

