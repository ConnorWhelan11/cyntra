/**
 * Style A - "Constellation Lattice (Sacred/Alien)"
 *
 * A faint, quasi-sacred lattice—like a star-chart etched into glass—mostly invisible until interaction.
 * Hover reveals localized "constellation tension" (tiny points brighten, connecting filaments appear,
 * subtle iridescent interference bands). Click produces a crisp expanding harmonic ring;
 * selection latches a persistent anchor node with a tether.
 */

import * as THREE from "three";

// -----------------------------------------------------------------------------
// Shader Code
// -----------------------------------------------------------------------------

export const CONSTELLATION_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CONSTELLATION_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uHover; // xy = uv, z = intent (0=probe, 1=etch), w = active
uniform vec4 uImpulses[24]; // xy = uv, z = radius, w = amp
uniform float uImpulsesAge[24]; // normalized age (0-1, 1 = expired)
uniform int uImpulseCount;
uniform vec4 uAnchors[8]; // xy = uv, z = strength, w = phase
uniform int uAnchorCount;
uniform sampler2D uTrailTex; // RTT trail texture
uniform float uTrailEnabled;
uniform float uProbeRadius;

varying vec2 vUv;
varying vec3 vPosition;

// Constants
const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// Noise functions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Triangular lattice SDF
float triangularLattice(vec2 uv, float scale) {
  uv *= scale;
  
  // Transform to triangular coordinates
  vec2 a = mod(uv, vec2(1.0, sqrt(3.0)));
  vec2 b = mod(uv + vec2(0.5, sqrt(3.0) * 0.5), vec2(1.0, sqrt(3.0)));
  
  float da = min(min(
    length(a),
    length(a - vec2(1.0, 0.0))
  ), length(a - vec2(0.5, sqrt(3.0) * 0.5)));
  
  float db = min(min(
    length(b),
    length(b - vec2(1.0, 0.0))
  ), length(b - vec2(0.5, sqrt(3.0) * 0.5)));
  
  return min(da, db);
}

// Hexagonal distance for hex lattice
float hexDist(vec2 p) {
  p = abs(p);
  return max(p.x, dot(p, vec2(0.5, 0.866025)));
}

// Hex lattice
float hexLattice(vec2 uv, float scale) {
  uv *= scale;
  vec2 r = vec2(1.0, 1.732);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  return min(hexDist(a), hexDist(b));
}

// Smooth circle
float circle(vec2 uv, vec2 center, float radius, float softness) {
  float d = length(uv - center);
  return 1.0 - smoothstep(radius - softness, radius + softness, d);
}

// Ring shape
float ring(vec2 uv, vec2 center, float radius, float thickness, float softness) {
  float d = length(uv - center);
  float inner = smoothstep(radius - thickness - softness, radius - thickness, d);
  float outer = 1.0 - smoothstep(radius, radius + softness, d);
  return inner * outer;
}

// Iridescent color based on angle
vec3 iridescence(float t, float intensity) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(TAU * (c * t + d)) * intensity;
}

void main() {
  vec2 uv = vUv;
  
  // =========================================================================
  // Base Layer: Subtle dark with faint lattice
  // =========================================================================
  
  vec3 baseColor = vec3(0.01, 0.015, 0.025);
  
  // Hex lattice - very subtle
  float hexVal = hexLattice(uv, 12.0);
  float hexLine = smoothstep(0.06, 0.03, hexVal);
  
  // Triangular lattice overlay
  float triVal = triangularLattice(uv, 8.0);
  float triLine = smoothstep(0.08, 0.04, triVal);
  
  // Combine lattices with subtle opacity
  float latticeBase = max(hexLine * 0.03, triLine * 0.02);
  vec3 latticeColor = vec3(0.1, 0.3, 0.4) * latticeBase;
  
  // Add subtle noise drift
  float drift = fbm(uv * 3.0 + uTime * 0.1) * 0.02;
  
  vec3 color = baseColor + latticeColor + drift;
  
  // =========================================================================
  // Trail Layer (RTT etch)
  // =========================================================================
  
  if (uTrailEnabled > 0.5) {
    vec4 trailSample = texture2D(uTrailTex, uv);
    float trailIntensity = trailSample.r;
    
    // Trail glow with iridescence
    vec3 trailColor = iridescence(trailIntensity * 2.0 + uTime * 0.1, 0.6);
    color += trailColor * trailIntensity * 0.4;
  }
  
  // =========================================================================
  // Hover Probe Effect
  // =========================================================================
  
  if (uHover.w > 0.5) {
    vec2 hoverUv = uHover.xy;
    float probeRadius = uProbeRadius;
    float isEtch = uHover.z;
    
    // Distance to hover point
    float hoverDist = length(uv - hoverUv);
    
    // Lattice reveal in probe zone
    float revealZone = 1.0 - smoothstep(probeRadius * 0.5, probeRadius * 1.5, hoverDist);
    
    // Enhanced lattice in reveal zone
    float revealedLattice = max(hexLine, triLine) * revealZone;
    vec3 revealColor = isEtch > 0.5 
      ? vec3(0.9, 0.2, 0.5) // magenta for etch
      : vec3(0.1, 0.9, 0.95); // cyan for probe
    
    color += revealColor * revealedLattice * (isEtch > 0.5 ? 0.5 : 0.3);
    
    // Central glow
    float centralGlow = circle(uv, hoverUv, probeRadius * 0.3, probeRadius * 0.2);
    color += revealColor * centralGlow * (isEtch > 0.5 ? 0.4 : 0.2);
    
    // Interference bands (iridescence)
    float interference = sin((hoverDist - uTime * 0.3) * 40.0) * 0.5 + 0.5;
    vec3 iriColor = iridescence(interference + hoverDist * 2.0, 0.4);
    float iriZone = smoothstep(probeRadius * 1.5, probeRadius * 0.3, hoverDist);
    color += iriColor * iriZone * 0.15;
    
    // Crackle noise near probe
    float crackle = hash(uv * 200.0 + uTime * 10.0);
    float crackleZone = circle(uv, hoverUv, probeRadius * 1.2, probeRadius * 0.3);
    color += vec3(0.15, 0.6, 0.7) * crackle * crackleZone * 0.08;
  }
  
  // =========================================================================
  // Impulse Rings (Bursts)
  // =========================================================================
  
  for (int i = 0; i < 24; i++) {
    if (i >= uImpulseCount) break;
    
    vec4 imp = uImpulses[i];
    float age = uImpulsesAge[i];
    
    if (age >= 1.0) continue;
    
    vec2 impUv = imp.xy;
    float baseRadius = imp.z;
    float amp = imp.w;
    
    // Expanding ring with harmonic overtones
    float expandedRadius = baseRadius + age * 0.35;
    
    // Primary ring
    float thickness = 0.008 + (1.0 - age) * 0.015;
    float primaryRing = ring(uv, impUv, expandedRadius, thickness, 0.003);
    
    // Secondary harmonic ring
    float secondaryRadius = expandedRadius * 0.7;
    float secondaryRing = ring(uv, impUv, secondaryRadius, thickness * 0.7, 0.002);
    
    // Tertiary harmonic
    float tertiaryRadius = expandedRadius * 0.4;
    float tertiaryRing = ring(uv, impUv, tertiaryRadius, thickness * 0.5, 0.002);
    
    // Fade with age
    float fade = (1.0 - age * age) * amp;
    
    // Interference pattern
    float dist = length(uv - impUv);
    float interference = sin((dist - uTime * 0.8) * 80.0) * 0.5 + 0.5;
    
    // Ring colors with iridescence
    vec3 ringColor = iridescence(interference + age, 0.7);
    
    // Add harmonic contribution
    color += ringColor * primaryRing * fade;
    color += ringColor * secondaryRing * fade * 0.5;
    color += ringColor * tertiaryRing * fade * 0.25;
    
    // Inner glow (initial flash)
    float flash = (1.0 - age) * (1.0 - age);
    float flashGlow = circle(uv, impUv, baseRadius * (1.0 - age * 0.5), 0.02);
    color += vec3(1.0, 0.9, 0.95) * flashGlow * flash * amp * 0.3;
  }
  
  // =========================================================================
  // Anchors (Persistent Nodes)
  // =========================================================================
  
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    
    vec4 anchor = uAnchors[i];
    vec2 anchorUv = anchor.xy;
    float strength = anchor.z;
    float phase = anchor.w;
    
    // Distance to anchor
    float anchorDist = length(uv - anchorUv);
    
    // Pulsing core glow
    float pulse = 0.6 + 0.4 * sin(uTime * 2.5 + phase);
    float coreGlow = circle(uv, anchorUv, 0.025, 0.015) * strength * pulse;
    
    // Halo rings
    float halo1 = ring(uv, anchorUv, 0.04 + sin(uTime * 1.5 + phase) * 0.01, 0.003, 0.002);
    float halo2 = ring(uv, anchorUv, 0.06 + cos(uTime * 1.2 + phase) * 0.01, 0.002, 0.002);
    
    // Radial tether streaks
    vec2 toAnchor = anchorUv - uv;
    float angle = atan(toAnchor.y, toAnchor.x);
    float streakPattern = 0.5 + 0.5 * sin(angle * 6.0 + uTime * 1.5 + phase);
    float streakFade = smoothstep(0.15, 0.0, anchorDist);
    float streak = streakPattern * streakFade * strength * 0.15;
    
    // Lattice activation around anchor
    float activationZone = smoothstep(0.12, 0.03, anchorDist);
    float activatedLattice = max(hexLine, triLine) * activationZone * strength;
    
    // Anchor color (emerald with gold accents)
    vec3 anchorColor = mix(
      vec3(0.2, 0.9, 0.5), // emerald
      vec3(1.0, 0.85, 0.3), // gold
      sin(phase + uTime) * 0.5 + 0.5
    );
    
    color += anchorColor * coreGlow;
    color += anchorColor * (halo1 + halo2) * strength * pulse * 0.6;
    color += anchorColor * streak;
    color += anchorColor * activatedLattice * 0.2;
  }
  
  // =========================================================================
  // Final adjustments
  // =========================================================================
  
  // Subtle vignette
  vec2 vignetteUv = uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(vignetteUv, vignetteUv) * 0.15;
  color *= vignette;
  
  // Gamma correction hint
  color = pow(color, vec3(0.95));
  
  gl_FragColor = vec4(color, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Points Layer Shader
// -----------------------------------------------------------------------------

export const CONSTELLATION_POINTS_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform vec4 uHover; // xy = uv, z = intent, w = active
uniform vec4 uAnchors[8];
uniform int uAnchorCount;
uniform float uProbeRadius;

attribute float aPhase;
attribute float aSize;

varying float vBrightness;
varying float vPhase;

void main() {
  vec3 pos = position;
  vec2 posUv = pos.xy * 0.5 + 0.5; // Convert from -1..1 to 0..1
  
  // Base brightness
  float brightness = 0.3;
  
  // Hover proximity boost
  if (uHover.w > 0.5) {
    float hoverDist = length(posUv - uHover.xy);
    float hoverBoost = 1.0 - smoothstep(uProbeRadius * 0.5, uProbeRadius * 2.0, hoverDist);
    brightness += hoverBoost * 0.7;
    
    // Subtle position attraction toward hover
    vec2 toHover = uHover.xy - posUv;
    pos.xy += toHover * hoverBoost * 0.02;
  }
  
  // Anchor proximity boost
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    vec2 anchorUv = uAnchors[i].xy;
    float strength = uAnchors[i].z;
    float anchorDist = length(posUv - anchorUv);
    float anchorBoost = 1.0 - smoothstep(0.05, 0.15, anchorDist);
    brightness += anchorBoost * strength * 0.5;
  }
  
  // Gentle drift animation
  float drift = sin(uTime * 0.5 + aPhase * 6.28) * 0.003;
  pos.xy += drift;
  
  vBrightness = brightness;
  vPhase = aPhase;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Size with distance attenuation and brightness boost
  float baseSizeScale = aSize * (0.8 + brightness * 0.4);
  gl_PointSize = baseSizeScale * (300.0 / -mvPosition.z);
}
`;

export const CONSTELLATION_POINTS_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;

varying float vBrightness;
varying float vPhase;

void main() {
  // Circular point with soft edge
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  
  if (dist > 0.5) discard;
  
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
  
  // Twinkle effect
  float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + vPhase * 6.28);
  
  // Color based on brightness
  vec3 color = mix(
    vec3(0.15, 0.4, 0.5), // dim: teal
    vec3(0.4, 0.95, 1.0), // bright: cyan
    vBrightness
  );
  
  // Add slight warmth to brightest points
  if (vBrightness > 0.7) {
    color = mix(color, vec3(1.0, 0.9, 0.8), (vBrightness - 0.7) * 2.0);
  }
  
  gl_FragColor = vec4(color, alpha * vBrightness * twinkle);
}
`;

// -----------------------------------------------------------------------------
// Material Factory
// -----------------------------------------------------------------------------

export interface ConstellationUniforms {
  [key: string]: { value: unknown };
  uTime: { value: number };
  uResolution: { value: THREE.Vector2 };
  uHover: { value: THREE.Vector4 };
  uImpulses: { value: THREE.Vector4[] };
  uImpulsesAge: { value: Float32Array };
  uImpulseCount: { value: number };
  uAnchors: { value: THREE.Vector4[] };
  uAnchorCount: { value: number };
  uTrailTex: { value: THREE.Texture | null };
  uTrailEnabled: { value: number };
  uProbeRadius: { value: number };
}

export function createConstellationUniforms(): ConstellationUniforms {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uHover: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
    uImpulses: {
      value: Array(24)
        .fill(null)
        .map(() => new THREE.Vector4(0, 0, 0, 0)),
    },
    uImpulsesAge: { value: new Float32Array(24) },
    uImpulseCount: { value: 0 },
    uAnchors: {
      value: Array(8)
        .fill(null)
        .map(() => new THREE.Vector4(0, 0, 0, 0)),
    },
    uAnchorCount: { value: 0 },
    uTrailTex: { value: null },
    uTrailEnabled: { value: 0 },
    uProbeRadius: { value: 0.08 },
  };
}

export function createConstellationMaterial(uniforms: ConstellationUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CONSTELLATION_VERTEX_SHADER,
    fragmentShader: CONSTELLATION_FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
}

export function createConstellationPointsMaterial(
  uniforms: ConstellationUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CONSTELLATION_POINTS_VERTEX_SHADER,
    fragmentShader: CONSTELLATION_POINTS_FRAGMENT_SHADER,
    uniforms: {
      uTime: uniforms.uTime,
      uHover: uniforms.uHover,
      uAnchors: uniforms.uAnchors,
      uAnchorCount: uniforms.uAnchorCount,
      uProbeRadius: uniforms.uProbeRadius,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// -----------------------------------------------------------------------------
// Points Geometry Factory
// -----------------------------------------------------------------------------

export function createConstellationPointsGeometry(
  count: number,
  planeWidth: number,
  planeHeight: number
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Random position within plane bounds (in NDC-like space for UV mapping)
    positions[i * 3] = (Math.random() - 0.5) * planeWidth;
    positions[i * 3 + 1] = (Math.random() - 0.5) * planeHeight;
    positions[i * 3 + 2] = 0.01; // Slightly in front of plane

    phases[i] = Math.random();
    sizes[i] = 1.0 + Math.random() * 2.0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  return geometry;
}
