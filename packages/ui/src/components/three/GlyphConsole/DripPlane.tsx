"use client";

import { useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import * as THREE from "three";

interface DripPlaneProps {
  intensity: number; // 0–1
}

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uIntensity;
  
  uniform vec3 uBaseColor;
  uniform vec3 uVeinColor;

  varying vec2 vUv;

  // ------------------------------------------------------------------
  // Utils
  // ------------------------------------------------------------------

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  // Smooth max for goo blending
  float smax(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(a, b, h) + k * h * (1.0 - h);
  }

  // ------------------------------------------------------------------
  // Main
  // ------------------------------------------------------------------

  void main() {
    // Center X (0 at middle)
    float x = vUv.x - 0.5;
    // Y goes 0 (bottom/front) to 1 (top/under-card)
    float y = vUv.y;

    // -------------------------------------------------
    // 1. Sticky Band (Top / Underside of Card)
    // -------------------------------------------------
    // Sits at y ~ 1.0. 
    // We give it a wavy bottom edge.
    float bandNoise = noise(vec2(x * 6.0, uTime * 0.3));
    float bandThickness = 0.1 + 0.05 * uIntensity; // slightly thicker at high intensity
    // Defines how far down from top the band goes
    float distFromTop = 1.0 - y;
    float bandField = smoothstep(bandThickness + 0.05, bandThickness, distFromTop + bandNoise * 0.03);

    // -------------------------------------------------
    // 2. Vertical Drips (Hanging Down)
    // -------------------------------------------------
    // We create distinct columns of drips using X coordinates
    float numDrips = 10.0; 
    float xCol = x * numDrips;
    float colId = floor(xCol);
    float xRel = fract(xCol) - 0.5; // -0.5 to 0.5 within column

    // Random properties per column
    float colHash = random(vec2(colId, 42.0));
    
    // Drip presence: not every column has a drip
    // Increase density with intensity
    float dripThreshold = 0.7 - 0.4 * uIntensity; 
    float hasDrip = step(dripThreshold, colHash);

    // Drip length: oscillates slowly
    // High intensity -> longer drips
    float dripCycle = sin(uTime * (0.5 + colHash) + colHash * 10.0);
    float maxLen = 0.3 + 0.6 * uIntensity; // up to 90% down
    float currentLen = maxLen * (0.6 + 0.4 * dripCycle);
    
    // Drip shape: tapered cylinder
    // Thicker at top (y=1), thinner at tip
    float dripWidth = 0.25 * (y + 0.2); 
    float xDripShape = smoothstep(dripWidth, dripWidth - 0.1, abs(xRel));
    
    // Vertical extent of this drip
    // It starts at top (1.0) and goes down to (1.0 - currentLen)
    float yDripShape = smoothstep(1.0 - currentLen - 0.1, 1.0 - currentLen, y);
    
    float dripField = xDripShape * yDripShape * hasDrip;

    // -------------------------------------------------
    // 3. Pool (Bottom accumulation)
    // -------------------------------------------------
    // Sits near y=0
    // Grows with intensity
    vec2 poolPos = vec2(x, y * 1.5); // flatten Y
    // Distort pool shape
    float poolDistort = noise(vec2(x * 3.0, uTime * 0.2));
    float poolRadius = 0.15 * uIntensity; // Small at 0, larger at 1
    float poolField = smoothstep(poolRadius, poolRadius - 0.1, length(poolPos) + poolDistort * 0.05);

    // -------------------------------------------------
    // 4. Combine "Goo" Fields
    // -------------------------------------------------
    // Blend everything together smoothly
    float liquid = smax(bandField, dripField, 0.15);
    liquid = smax(liquid, poolField, 0.2);

    // Apply horizontal mask (Card Width)
    // Constrain to center ~80% of plane
    float hMask = smoothstep(0.45, 0.35, abs(x));
    liquid *= hMask;

    // -------------------------------------------------
    // 5. Internal Veins / Noise
    // -------------------------------------------------
    // Slow swirling texture inside the liquid
    vec2 veinUv = vUv * vec2(3.0, 5.0) + vec2(0.0, uTime * 0.15);
    float veinNoise = noise(veinUv);
    // High contrast veins
    float veins = smoothstep(0.45, 0.75, veinNoise);
    
    // Increase vein activity/brightness with intensity
    float veinBright = 0.5 + 1.0 * uIntensity;

    // -------------------------------------------------
    // 6. Color & Alpha
    // -------------------------------------------------
    // Base color + Veins
    vec3 col = uBaseColor;
    // Veins are additive on top
    col += uVeinColor * veins * veinBright * liquid;
    
    // Extra brightness/bloom in the "thickest" parts (center of drips/pool)
    // We use the raw liquid field as a density map
    float coreGlow = smoothstep(0.8, 1.0, liquid);
    col += uVeinColor * coreGlow * 0.8;

    // Sparkles (Cosmic dust)
    // Sparse specks within the liquid volume
    float sparkleNoise = random(vUv * 80.0 + floor(uTime * 2.0)); // twinkle
    float sparkle = step(0.985, sparkleNoise) * liquid;
    col += vec3(1.0, 1.0, 1.0) * sparkle;

    // Final Alpha
    // Cutoff the liquid field to get the edge
    float alpha = smoothstep(0.05, 0.2, liquid);
    // Overall visibility
    alpha *= 0.95; // slightly transparent even at thickest

    gl_FragColor = vec4(col, alpha);
  }
`;

export const DripPlane: React.FC<DripPlaneProps> = ({ intensity }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Create uniform values once
  const uniforms = useRef({
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uBaseColor: { value: new THREE.Color("#021f28") }, // Darker teal/black
    uVeinColor: { value: new THREE.Color("#00f7ff") }, // Bright Cyan
  });

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    // Lerp intensity for smooth transitions
    materialRef.current.uniforms.uIntensity.value = THREE.MathUtils.lerp(
      materialRef.current.uniforms.uIntensity.value,
      intensity,
      0.05 // Slower lerp for viscous feel
    );
  });

  return (
    // Position: Just under the card.
    // Card is approx at y=-0.5 (center).
    // Plane top needs to be there.
    // Plane height 6 -> top is at y_pos + 3.
    // So y_pos + 3 = -0.5 => y_pos = -3.5.
    // Let's check previous position. It was -1.4.
    // Let's try -2.8 to move it down so "top" aligns with card bottom.
    // Rotation: tilted back to face camera slightly?
    // Or vertical? "Gravity" implies vertical.
    // If we rotate -PI/2.4 (~-75deg), it's mostly flat. Gravity works in projected UVs (y down).
    // That's fine for a "holographic floor" effect.
    <mesh position={[0, -2.0, -0.5]} rotation={[-Math.PI / 3, 0, 0]}>
      <planeGeometry args={[10, 6, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        blending={THREE.NormalBlending} // Normal blending for "thick" liquid, Additive for "hologram"
        // Let's use Normal blending to get the "goo" obscuring things behind it slightly,
        // or Additive if we want pure light. User said "thick, viscous fluid".
        // Normal blending with alpha is better for "liquid".
        depthWrite={false}
        uniforms={uniforms.current}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
