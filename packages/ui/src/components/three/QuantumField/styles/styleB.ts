/**
 * Style B - "PCB Vector Field (Sci-Fi/Engineering)"
 *
 * A technical substrate: circuit-board routing traces and vector-field arrows that "route"
 * energy around UI surfaces. Hover creates a "routing negotiation" (signals bend into nearest tracks);
 * etch draws crisp conductor paths; click bursts like an oscilloscope impulse;
 * latch becomes a pin/via node with persistent trace to origin.
 */

import * as THREE from "three";

// -----------------------------------------------------------------------------
// Shader Code
// -----------------------------------------------------------------------------

export const PCB_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PCB_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uHover; // xy = uv, z = intent (0=probe, 1=etch), w = active
uniform vec4 uImpulses[24]; // xy = uv, z = radius, w = amp
uniform float uImpulsesAge[24];
uniform int uImpulseCount;
uniform vec4 uAnchors[8]; // xy = uv, z = strength, w = phase
uniform int uAnchorCount;
uniform sampler2D uTrailTex;
uniform float uTrailEnabled;
uniform float uProbeRadius;

// === Ultra-Fine Lattice Uniforms ===
uniform float uMicroGrid1;      // Fine grid frequency (default ~60)
uniform float uMicroGrid2;      // Ultra-fine grid frequency (default ~200)
uniform float uMicroGridStrength; // Overall micro-lattice visibility (0-1)
uniform float uRevealStrength;  // How much hover reveals the lattice (0-1)
uniform float uMicroWarp;       // Domain warp amount (subtle, ~0.01-0.05)
uniform float uEtchDistortion;  // UV distortion in etched areas (0-0.02)

// === Phase Lens Uniforms ===
uniform vec4 uLens;             // xy = center uv, z = radius, w = magnification
uniform float uLensVelocity;    // 0..1 normalized cursor velocity
uniform float uLensChromatic;   // chromatic aberration intensity (0-1)
uniform float uLensEnabled;     // 0 or 1

// === Lattice Mode Uniform ===
uniform int uLatticeMode;       // 0=rect, 1=hex, 2=tri

// === Etch Velocity Uniform ===
uniform float uEtchVelocity;    // 0..1 for visual feedback in etch

// === Palette / Atmosphere Uniforms ===
uniform int uPaletteMode;       // 0=glia-cyan, 1=orchid, 2=amber, 3=mono, 4=ice
uniform float uAccentIntensity; // 0-2, default 1.0
uniform float uIridescenceStrength; // 0-1
uniform float uIridescenceScale;    // 1-40
uniform float uExposure;        // 0.6-2.0
uniform float uFilmic;          // 0-1
uniform float uGrainStrength;   // 0-0.08
uniform float uCrtStrength;     // 0-1
uniform float uCopperStrength;  // 0-1

varying vec2 vUv;
varying vec3 vPosition;

const float PI = 3.14159265359;

// ============================================================================
// Noise Functions
// ============================================================================

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
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

// Curl noise for vector field
vec2 curlNoise(vec2 p) {
  float eps = 0.01;
  float n1 = noise(p + vec2(eps, 0.0));
  float n2 = noise(p - vec2(eps, 0.0));
  float n3 = noise(p + vec2(0.0, eps));
  float n4 = noise(p - vec2(0.0, eps));
  
  return vec2(n3 - n4, n1 - n2) / (2.0 * eps);
}

// ============================================================================
// Ultra-Fine Micro-Lattice Functions
// ============================================================================

// Anti-aliased grid line using fwidth for stable rendering at any zoom
// Returns 0-1 where 1 = on the grid line
float gridAA(vec2 uv, float freq, float thickness) {
  vec2 gridUv = fract(uv * freq);
  vec2 gridDeriv = fwidth(uv * freq);
  
  // Distance to nearest grid line (horizontal + vertical)
  vec2 lineDistH = abs(gridUv - 0.5);
  vec2 lineDistV = abs(gridUv);
  
  // Use smoothstep with fwidth for anti-aliasing
  float lineH = 1.0 - smoothstep(thickness - gridDeriv.y, thickness + gridDeriv.y, lineDistH.y);
  float lineV = 1.0 - smoothstep(thickness - gridDeriv.x, thickness + gridDeriv.x, lineDistH.x);
  
  // Also check lines at cell edges (0/1)
  float edgeH = 1.0 - smoothstep(thickness - gridDeriv.y, thickness + gridDeriv.y, min(gridUv.y, 1.0 - gridUv.y));
  float edgeV = 1.0 - smoothstep(thickness - gridDeriv.x, thickness + gridDeriv.x, min(gridUv.x, 1.0 - gridUv.x));
  
  return max(max(lineH, lineV), max(edgeH, edgeV));
}

// Rotated grid lines for hex/tri lattice - returns AA line intensity
float gridRotatedAA(vec2 uv, float freq, float thickness, float angleDeg) {
  float rad = angleDeg * PI / 180.0;
  float c = cos(rad);
  float s = sin(rad);
  mat2 rot = mat2(c, -s, s, c);
  vec2 rotUv = rot * uv;
  
  float lineCoord = rotUv.x * freq;
  float lineDeriv = fwidth(lineCoord);
  float lineDist = abs(fract(lineCoord) - 0.5);
  
  return 1.0 - smoothstep(thickness - lineDeriv, thickness + lineDeriv, lineDist);
}

// Triangular lattice: 3 sets of parallel lines at 0°, 60°, 120°
// Creates a hexagonal cell pattern with triangular subdivisions
float triLatticeAA(vec2 uv, float freq, float thickness) {
  float line0 = gridRotatedAA(uv, freq, thickness, 0.0);
  float line60 = gridRotatedAA(uv, freq, thickness, 60.0);
  float line120 = gridRotatedAA(uv, freq, thickness, 120.0);
  
  return max(line0, max(line60, line120));
}

// Hexagonal lattice with node emphasis at hex centers
float hexLatticeAA(vec2 uv, float freq, float thickness) {
  // Base tri lattice
  float tri = triLatticeAA(uv, freq, thickness);
  
  // Hex centers: scale and offset for honeycomb pattern
  // Convert to axial coordinates for hex tiling
  float hexScale = freq * 0.577; // 1/sqrt(3) for hex aspect
  vec2 hexUv = vec2(uv.x * 1.1547, uv.y + uv.x * 0.5774);
  hexUv *= hexScale;
  
  vec2 hexCell = floor(hexUv);
  vec2 hexFrac = fract(hexUv);
  
  // Distance to hex center
  float centerDist = length(hexFrac - 0.5);
  float nodeDeriv = fwidth(hexUv.x);
  float node = 1.0 - smoothstep(0.15 - nodeDeriv, 0.15 + nodeDeriv, centerDist);
  
  // Combine lattice lines with emphasized nodes
  return max(tri, node * 0.7);
}

// Unified lattice function that selects mode
// mode: 0=rect, 1=hex, 2=tri
float latticeLines(vec2 uv, float freq, float thickness, int mode) {
  if (mode == 1) {
    return hexLatticeAA(uv, freq, thickness);
  } else if (mode == 2) {
    return triLatticeAA(uv, freq, thickness);
  }
  // Default: rect
  return gridAA(uv, freq, thickness);
}

// ============================================================================
// Phase Lens Functions (WebGL1 compatible - no struct returns)
// ============================================================================

// Compute lens mask (0=outside, 1=center) for given UV
float computeLensMask(vec2 uv, vec2 lensCenter, float lensRadius) {
  float lensDist = length(uv - lensCenter);
  return smoothstep(lensRadius, lensRadius * 0.4, lensDist);
}

// Compute lens rim highlight (chromatic fringe zone)
float computeLensRim(vec2 uv, vec2 lensCenter, float lensRadius, float velocity) {
  float lensDist = length(uv - lensCenter);
  float rimInner = smoothstep(lensRadius * 0.75, lensRadius * 0.88, lensDist);
  float rimOuter = smoothstep(lensRadius * 1.05, lensRadius * 0.92, lensDist);
  float rim = rimInner * rimOuter;
  return rim * (1.0 + velocity * 0.5);
}

// Compute lens-distorted UV for magnification effect
vec2 computeLensDistortedUv(vec2 uv, vec2 lensCenter, float lensRadius, float magnification) {
  vec2 toLens = uv - lensCenter;
  float lensDist = length(toLens);
  float mask = smoothstep(lensRadius, lensRadius * 0.4, lensDist);
  
  // Magnification distortion: pull UVs toward center inside lens
  float distortionStrength = mask * (magnification - 1.0) * 0.25;
  vec2 distortDir = normalize(toLens + 0.0001);
  return uv - distortDir * distortionStrength * lensDist;
}

// Domain warping for organic feel - returns warped UV
vec2 warpUV(vec2 uv, float amount, float time) {
  // Use curl noise for divergence-free warping (feels more natural)
  vec2 warp = curlNoise(uv * 5.0 + time * 0.05);
  return uv + warp * amount;
}

// Compute reveal mask - how much the lattice should be visible
// Based on distance to hover point, anchors, and etch trails
float computeReveal(vec2 uv, vec2 hoverUv, float hoverActive, float probeRadius, float revealStr) {
  float reveal = 0.0;
  
  // Hover probe reveals the lattice
  if (hoverActive > 0.5) {
    float hoverDist = length(uv - hoverUv);
    // Wider, softer reveal zone
    reveal = smoothstep(probeRadius * 3.0, probeRadius * 0.3, hoverDist) * revealStr;
  }
  
  return reveal;
}

// ============================================================================
// Palette System (Cinematic Color Scarcity)
// ============================================================================

// Get base/background color for palette mode
vec3 paletteBase(int mode) {
  // All modes start near-black for scarcity
  if (mode == 0) return vec3(0.003, 0.012, 0.010); // glia-cyan: deep teal-black
  if (mode == 1) return vec3(0.008, 0.005, 0.015); // orchid: deep purple-black
  if (mode == 2) return vec3(0.012, 0.008, 0.003); // amber: warm black
  if (mode == 3) return vec3(0.008, 0.012, 0.008); // mono: green-black
  if (mode == 4) return vec3(0.005, 0.010, 0.018); // ice: cold blue-black
  return vec3(0.005, 0.010, 0.008);
}

// Get lattice color for palette mode (revealed state)
vec3 paletteLattice(int mode, float reveal) {
  vec3 dim, bright;
  
  if (mode == 0) { // glia-cyan
    dim = vec3(0.02, 0.06, 0.05);
    bright = vec3(0.04, 0.32, 0.28);
  } else if (mode == 1) { // orchid
    dim = vec3(0.04, 0.02, 0.06);
    bright = vec3(0.25, 0.12, 0.45);
  } else if (mode == 2) { // amber
    dim = vec3(0.06, 0.04, 0.02);
    bright = vec3(0.45, 0.30, 0.08);
  } else if (mode == 3) { // mono
    dim = vec3(0.02, 0.05, 0.02);
    bright = vec3(0.08, 0.35, 0.12);
  } else { // ice
    dim = vec3(0.03, 0.05, 0.08);
    bright = vec3(0.15, 0.35, 0.55);
  }
  
  return mix(dim, bright, reveal);
}

// Get accent color for palette mode (etch, impulses, rim)
vec3 paletteAccent(int mode) {
  if (mode == 0) return vec3(0.15, 1.0, 0.7);   // glia-cyan: neon mint
  if (mode == 1) return vec3(0.4, 0.9, 1.0);    // orchid: cyan fringe
  if (mode == 2) return vec3(0.2, 0.8, 0.7);    // amber: teal edge
  if (mode == 3) return vec3(0.3, 1.0, 0.4);    // mono: bright green
  if (mode == 4) return vec3(0.6, 0.85, 1.0);   // ice: pale blue-white
  return vec3(0.2, 1.0, 0.6);
}

// Get copper/trace color for palette mode (subdued)
vec3 paletteCopper(int mode) {
  if (mode == 0) return vec3(0.06, 0.15, 0.12); // glia-cyan: dark teal
  if (mode == 1) return vec3(0.12, 0.06, 0.18); // orchid: dark purple
  if (mode == 2) return vec3(0.18, 0.12, 0.04); // amber: dark gold
  if (mode == 3) return vec3(0.06, 0.12, 0.06); // mono: dark green
  if (mode == 4) return vec3(0.08, 0.12, 0.18); // ice: dark blue
  return vec3(0.08, 0.15, 0.10);
}

// ============================================================================
// Iridescent Interference (Thin-Film Spectral Shimmer)
// ============================================================================

// Spectral color from phase (cheap cosine-based rainbow)
vec3 spectral(float t) {
  // Phase-offset cosines for RGB
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.67); // Phase offsets for rainbow
  return a + b * cos(6.28318 * (c * t + d));
}

// Compute iridescence for a surface point
vec3 iridescence(vec2 uv, float time, float scale, float strength) {
  // Phase based on UV position + time + noise for organic feel
  float phase = dot(uv, vec2(0.7, 0.3)) * scale + time * 0.06;
  phase += noise(uv * 12.0) * 0.3;
  
  vec3 spec = spectral(phase);
  // Return as deviation from neutral (centered around 0.5)
  return (spec - 0.5) * strength;
}

// ============================================================================
// Atmosphere (Filmic Tonemap + Grain + CRT)
// ============================================================================

// ACES-ish filmic tonemap approximation
vec3 filmicTonemap(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Film grain (stable, not flickery)
float filmGrain(vec2 uv, vec2 resolution, float time) {
  vec2 px = uv * resolution;
  // Use floor to get per-pixel noise, add time for subtle animation
  float grain = hash(floor(px * 0.5) + floor(time * 30.0));
  return grain - 0.5; // Center around 0
}

// CRT scanline + aperture grille effect
float crtEffect(vec2 uv, float time, float strength) {
  // Scanlines (horizontal)
  float scanline = sin(uv.y * 900.0 + time * 1.5) * 0.5 + 0.5;
  scanline = pow(scanline, 1.5) * 0.15;
  
  // Aperture grille (vertical RGB stripes, very subtle)
  float grille = sin(uv.x * 1400.0) * 0.5 + 0.5;
  grille = pow(grille, 2.0) * 0.08;
  
  // Combine with vignette falloff (stronger at edges)
  vec2 vigUv = uv * 2.0 - 1.0;
  float vigDist = length(vigUv);
  float edgeFalloff = smoothstep(0.3, 1.2, vigDist);
  
  return (scanline + grille) * strength * (0.3 + edgeFalloff * 0.7);
}

// ============================================================================
// PCB Trace SDFs
// ============================================================================

// Manhattan distance grid
float manhattanGrid(vec2 uv, float spacing) {
  vec2 grid = abs(fract(uv * spacing) - 0.5);
  float manhattan = min(grid.x, grid.y);
  return manhattan;
}

// Horizontal trace
float hTrace(vec2 uv, float y, float width) {
  return abs(uv.y - y) - width * 0.5;
}

// Vertical trace
float vTrace(vec2 uv, float x, float width) {
  return abs(uv.x - x) - width * 0.5;
}

// Via (circular pad)
float via(vec2 uv, vec2 center, float radius) {
  return length(uv - center) - radius;
}

// Combined trace network (procedural)
float traceNetwork(vec2 uv, float scale) {
  uv *= scale;
  
  // Main grid lines
  float gridSpacing = 0.2;
  float traceWidth = 0.01;
  
  vec2 gridUv = mod(uv, gridSpacing) - gridSpacing * 0.5;
  float hLine = abs(gridUv.y) - traceWidth;
  float vLine = abs(gridUv.x) - traceWidth;
  
  // Create Manhattan-style traces with some randomization
  float h1 = hTrace(uv, 0.1, traceWidth);
  float h2 = hTrace(uv, 0.3, traceWidth * 0.8);
  float h3 = hTrace(uv, 0.5, traceWidth);
  float h4 = hTrace(uv, 0.7, traceWidth * 0.8);
  float h5 = hTrace(uv, 0.9, traceWidth);
  
  float v1 = vTrace(uv, 0.15, traceWidth);
  float v2 = vTrace(uv, 0.35, traceWidth * 0.8);
  float v3 = vTrace(uv, 0.55, traceWidth);
  float v4 = vTrace(uv, 0.75, traceWidth * 0.8);
  float v5 = vTrace(uv, 0.95, traceWidth);
  
  float traces = min(min(min(min(h1, h2), min(h3, h4)), h5),
                     min(min(min(v1, v2), min(v3, v4)), v5));
  
  return min(traces, min(hLine, vLine));
}

// ============================================================================
// Main Shader
// ============================================================================

void main() {
  vec2 uv = vUv;
  
  // Base: use palette-defined substrate color (near-black, cinematic)
  vec3 baseColor = paletteBase(uPaletteMode);
  vec3 color = baseColor;
  
  // ========================================================================
  // Sample Etch Trail Early (for UV distortion + reveal boost)
  // ========================================================================
  
  float trailIntensity = 0.0;
  if (uTrailEnabled > 0.5) {
    vec4 trailSample = texture2D(uTrailTex, uv);
    trailIntensity = trailSample.r;
  }
  
  // ========================================================================
  // UV Distortion in Etched Areas (makes it feel engraved)
  // ========================================================================
  
  vec2 distortedUv = uv;
  if (trailIntensity > 0.01) {
    // Add subtle UV distortion based on trail + noise
    vec2 distortNoise = curlNoise(uv * 30.0 + uTime * 0.2);
    distortedUv += distortNoise * trailIntensity * uEtchDistortion;
  }
  
  // ========================================================================
  // Compute Reveal Mask (hover/anchor proximity increases lattice visibility)
  // ========================================================================
  
  float reveal = computeReveal(uv, uHover.xy, uHover.w, uProbeRadius, uRevealStrength);
  
  // Anchors also reveal the lattice
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    float anchorDist = length(uv - uAnchors[i].xy);
    reveal = max(reveal, smoothstep(0.15, 0.02, anchorDist) * uAnchors[i].z * uRevealStrength);
  }
  
  // Etched areas are always revealed
  reveal = max(reveal, trailIntensity * 1.5);
  reveal = clamp(reveal, 0.0, 1.0);
  
  // ========================================================================
  // Phase Lens Setup (if enabled)
  // ========================================================================
  
  float lensMask = 0.0;
  float lensRim = 0.0;
  vec2 lensDistortedUv = distortedUv;
  
  if (uLensEnabled > 0.5 && uHover.w > 0.5) {
    vec2 lensCenter = uLens.xy;
    float lensRadius = uLens.z;
    float lensMag = uLens.w;
    
    lensMask = computeLensMask(distortedUv, lensCenter, lensRadius);
    lensRim = computeLensRim(distortedUv, lensCenter, lensRadius, uLensVelocity);
    lensDistortedUv = computeLensDistortedUv(distortedUv, lensCenter, lensRadius, lensMag);
  }
  
  // ========================================================================
  // Ultra-Fine Micro-Lattice Layer (THE STAR)
  // ========================================================================
  
  // Apply domain warping for organic, alive feel
  vec2 warpedUv = warpUV(distortedUv, uMicroWarp, uTime);
  vec2 warpedLensUv = warpUV(lensDistortedUv, uMicroWarp, uTime);
  
  // Two-frequency micro-grid using selected lattice mode
  float microGrid1 = latticeLines(warpedUv, uMicroGrid1, 0.02, uLatticeMode);
  float microGrid2 = latticeLines(warpedUv, uMicroGrid2, 0.015, uLatticeMode);
  
  // Lens-magnified versions (higher detail inside lens)
  float microGrid1Lens = latticeLines(warpedLensUv, uMicroGrid1 * 1.3, 0.018, uLatticeMode);
  float microGrid2Lens = latticeLines(warpedLensUv, uMicroGrid2 * 1.2, 0.012, uLatticeMode);
  
  // Blend between normal and lens-magnified based on lens mask
  float effectiveMicroGrid1 = mix(microGrid1, microGrid1Lens, lensMask);
  float effectiveMicroGrid2 = mix(microGrid2, microGrid2Lens, lensMask);
  
  // Combine grids with different weights
  float microLattice = max(effectiveMicroGrid1 * 0.7, effectiveMicroGrid2 * 0.4);
  
  // Lens boosts reveal effect (magnification = amplified visibility)
  float lensRevealBoost = lensMask * 0.6;
  float effectiveReveal = min(reveal + lensRevealBoost, 1.0);
  
  // Base visibility is very subtle; reveal increases it dramatically
  // COLOR SCARCITY: Reduce base visibility, accents only where energy is
  float latticeVis = uMicroGridStrength * (0.05 + effectiveReveal * 0.95);
  
  // Lattice color: use palette system
  vec3 baseLatticeColor = paletteLattice(uPaletteMode, effectiveReveal);
  
  // Inside lens: boost saturation + add iridescence
  vec3 lensLatticeColor = baseLatticeColor * 1.3;
  vec3 iridescentShift = iridescence(warpedLensUv, uTime, uIridescenceScale, uIridescenceStrength);
  lensLatticeColor += iridescentShift * lensMask * 0.4;
  
  vec3 latticeColor = mix(baseLatticeColor, lensLatticeColor, lensMask);
  
  // COLOR SCARCITY: Reduce base lattice contribution, boost only in high-energy zones
  float latticeEnergy = max(effectiveReveal, lensMask * 0.6);
  color += latticeColor * microLattice * latticeVis * (0.6 + latticeEnergy * 0.4);
  
  // Add subtle "energy nodes" at grid intersections when revealed
  if (effectiveReveal > 0.3) {
    vec2 nodeUv = fract(warpedLensUv * uMicroGrid1);
    float nodeDist = length(nodeUv - 0.5);
    float node = smoothstep(0.08, 0.02, nodeDist);
    float nodePulse = 0.5 + 0.5 * sin(uTime * 3.0 + (floor(warpedLensUv.x * uMicroGrid1) + floor(warpedLensUv.y * uMicroGrid1)) * 0.5);
    // Boost node brightness inside lens, use palette accent
    float nodeBoost = 1.0 + lensMask * 0.4;
    vec3 nodeColor = paletteAccent(uPaletteMode) * 0.4;
    color += nodeColor * node * effectiveReveal * nodePulse * 0.3 * nodeBoost;
  }
  
  // ========================================================================
  // Phase Lens Rim Effect (iridescent + chromatic fringe)
  // ========================================================================
  
  if (lensRim > 0.01) {
    // Get accent color from palette
    vec3 accentColor = paletteAccent(uPaletteMode);
    
    // Chromatic aberration on rim
    float rimOffset = lensRim * uLensChromatic;
    
    // Iridescent shimmer on rim (the wow factor)
    vec3 rimIridescence = iridescence(distortedUv, uTime * 1.5, uIridescenceScale * 2.0, 1.0);
    
    // Base rim color from accent
    vec3 rimColor = accentColor * 0.6;
    
    // Add chromatic split
    rimColor.r += rimOffset * 0.2;
    rimColor.b -= rimOffset * 0.15;
    
    // Add iridescence to rim
    rimColor += rimIridescence * uIridescenceStrength * 0.5;
    
    // Velocity adds warmth to rim
    rimColor = mix(rimColor, accentColor * vec3(1.2, 0.8, 0.6), uLensVelocity * 0.3);
    
    color += rimColor * lensRim * 0.3 * uAccentIntensity;
  }
  
  // ========================================================================
  // PCB Traces Layer (SUBDUED - rails under the lattice, not the main show)
  // ========================================================================
  
  float traceScale = 5.0;
  float traceSdf = traceNetwork(distortedUv, traceScale);
  float traceEdge = smoothstep(0.002, -0.002, traceSdf);
  
  // Copper color from palette (subdued to match theme)
  vec3 copperColor = paletteCopper(uPaletteMode) * (0.8 + 0.2 * noise(uv * 20.0));
  
  // Traces are very faint - controlled by copperStrength
  // COLOR SCARCITY: Traces are just "rails", not the star
  float traceVis = (0.05 + reveal * 0.3) * uCopperStrength;
  color += copperColor * traceEdge * traceVis;
  
  // ========================================================================
  // Trail Layer (Etched Inscription - enhanced with char edge + velocity)
  // ========================================================================
  
  // Track etch mask for color scarcity
  float etchMask = 0.0;
  
  if (uTrailEnabled > 0.5 && trailIntensity > 0.01) {
    // Sharpened edge for crisp inscription look
    float sharpTrail = smoothstep(0.05, 0.3, trailIntensity);
    etchMask = sharpTrail; // Store for accent calculation
    
    // === Char Edge Detection (burned/charred rim around inscription) ===
    vec2 texelSize = vec2(1.0 / 512.0);
    float trailN = texture2D(uTrailTex, uv + vec2(0.0, texelSize.y)).r;
    float trailS = texture2D(uTrailTex, uv - vec2(0.0, texelSize.y)).r;
    float trailE = texture2D(uTrailTex, uv + vec2(texelSize.x, 0.0)).r;
    float trailW = texture2D(uTrailTex, uv - vec2(texelSize.x, 0.0)).r;
    
    vec2 trailGrad = vec2(trailE - trailW, trailN - trailS);
    float edgeStrength = clamp(length(trailGrad) * 8.0, 0.0, 1.0);
    
    // Char color: palette-aware burned edge
    vec3 charColor = paletteCopper(uPaletteMode) * 0.5;
    
    // Core glow: use palette accent for inscription
    float velocityDim = 1.0 - uEtchVelocity * 0.2;
    vec3 accentColor = paletteAccent(uPaletteMode);
    vec3 coreColor = accentColor * velocityDim;
    
    // Add subtle iridescence to inscription core
    vec3 etchIridescence = iridescence(uv, uTime, uIridescenceScale * 0.5, uIridescenceStrength);
    coreColor += etchIridescence * 0.2;
    
    color += coreColor * sharpTrail * 0.5 * uAccentIntensity;
    
    // Char edge: subtract warm dark at edges
    color = mix(color, charColor, edgeStrength * sharpTrail * 0.35);
    
    // Soft bloom edge using palette lattice color
    float softTrail = smoothstep(0.0, 0.15, trailIntensity);
    vec3 bloomColor = paletteLattice(uPaletteMode, 0.5);
    float bloomFactor = 1.0 - uEtchVelocity * 0.4;
    color += bloomColor * softTrail * 0.25 * bloomFactor;
    
    // Increase micro-lattice visibility in etched areas
    float latticeAcceptance = sharpTrail * (1.0 + edgeStrength * 0.3);
    color += latticeColor * microLattice * latticeAcceptance * 0.35;
    
    // Subtle sparkle using palette accent
    float sparkleGate = sharpTrail * (1.0 - edgeStrength * 0.5);
    float sparkle = noise(uv * 500.0 + uTime * 5.0);
    color += accentColor * 0.3 * sparkle * sparkleGate * 0.12;
    
    // Velocity streaking
    if (uEtchVelocity > 0.3) {
      float streak = noise(uv * 200.0 + uTime * 8.0) * uEtchVelocity;
      color += accentColor * 0.4 * streak * sharpTrail * 0.08;
    }
  }
  
  // ========================================================================
  // Hover Probe Effect (enhanced with Phase Lens integration)
  // ========================================================================
  
  if (uHover.w > 0.5) {
    vec2 hoverUv = uHover.xy;
    float isEtch = uHover.z;
    float hoverDist = length(uv - hoverUv);
    
    // Routing highlight zone
    float highlightZone = smoothstep(uProbeRadius * 2.0, uProbeRadius * 0.5, hoverDist);
    
    // Highlight nearby traces using palette
    float nearbyTraces = traceEdge * highlightZone;
    vec3 accentColor = paletteAccent(uPaletteMode);
    vec3 highlightColor = isEtch > 0.5 
      ? accentColor * vec3(1.2, 0.6, 0.3) // Warm accent for etch
      : accentColor; // Cool accent for probe
    
    color += highlightColor * nearbyTraces * 0.5 * uAccentIntensity;
    
    // If lens is enabled, the lens rim acts as indicator (no square needed)
    if (uLensEnabled < 0.5) {
      float indicator = smoothstep(uProbeRadius * 0.4, uProbeRadius * 0.3, hoverDist);
      indicator *= smoothstep(uProbeRadius * 0.2, uProbeRadius * 0.3, hoverDist);
      color += highlightColor * indicator * 0.35;
    }
    
    // Data packet flow animation using lattice color
    float flow = sin((hoverDist - uTime * 2.0) * 50.0) * 0.5 + 0.5;
    float flowZone = smoothstep(uProbeRadius * 1.5, uProbeRadius * 0.3, hoverDist);
    color += paletteLattice(uPaletteMode, 0.8) * flow * flowZone * nearbyTraces * 0.25;
  }
  
  // ========================================================================
  // Impulse Rings (Square Engineering Bursts)
  // ========================================================================
  
  for (int i = 0; i < 24; i++) {
    if (i >= uImpulseCount) break;
    
    vec4 imp = uImpulses[i];
    float age = uImpulsesAge[i];
    
    if (age >= 1.0) continue;
    
    vec2 impUv = imp.xy;
    float baseRadius = imp.z;
    float amp = imp.w;
    
    // Square expanding ring (Manhattan distance)
    vec2 toImp = abs(uv - impUv);
    float sqDist = max(toImp.x, toImp.y);
    float expandedRadius = baseRadius + age * 0.3;
    
    // Ring with thickness
    float ringThickness = 0.01 + (1.0 - age) * 0.015;
    float ringOuter = smoothstep(expandedRadius + ringThickness, expandedRadius, sqDist);
    float ringInner = smoothstep(expandedRadius - ringThickness, expandedRadius, sqDist);
    float squareRing = ringOuter * ringInner;
    
    // Fade with age
    float fade = (1.0 - age * age) * amp;
    
    // Burst color from palette accent with age transition
    vec3 accentColor = paletteAccent(uPaletteMode);
    vec3 burstColor = mix(
      accentColor,
      accentColor * vec3(1.3, 1.0, 0.6), // Warmer as it fades
      age
    );
    
    color += burstColor * squareRing * fade * 0.7 * uAccentIntensity;
    
    // Data traveling along traces from burst
    float impDist = length(uv - impUv);
    float traceActivation = smoothstep(0.3, 0.0, abs(traceSdf)) * 
                           smoothstep(expandedRadius * 1.5, expandedRadius * 0.5, impDist) * 
                           (1.0 - age);
    color += paletteLattice(uPaletteMode, 0.7) * traceActivation * fade * 0.25;
  }
  
  // ========================================================================
  // Anchors (Vias/Pins)
  // ========================================================================
  
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    
    vec4 anchor = uAnchors[i];
    vec2 anchorUv = anchor.xy;
    float strength = anchor.z;
    float phase = anchor.w;
    
    float anchorDist = length(uv - anchorUv);
    
    // Via pad (circular)
    float viaPad = smoothstep(0.025, 0.02, anchorDist);
    
    // Via hole (inner dark circle)
    float viaHole = smoothstep(0.008, 0.012, anchorDist);
    
    // Ring around via
    float viaRing = smoothstep(0.03, 0.028, anchorDist) * smoothstep(0.025, 0.028, anchorDist);
    
    // Pulsing glow
    float pulse = 0.6 + 0.4 * sin(uTime * 2.0 + phase);
    
    // Via color using palette
    vec3 padColor = paletteCopper(uPaletteMode) * 2.0;
    vec3 ringColor = paletteAccent(uPaletteMode);
    
    color += padColor * viaPad * viaHole * strength * 0.7 * uCopperStrength;
    color += ringColor * viaRing * strength * pulse * uAccentIntensity;
    
    // Emanating trace activation
    float emanate = smoothstep(0.15, 0.03, anchorDist) * traceEdge * strength;
    float emanatePulse = sin(anchorDist * 50.0 - uTime * 3.0 + phase) * 0.5 + 0.5;
    color += ringColor * emanate * emanatePulse * 0.25;
  }
  
  // ========================================================================
  // Vector Field Visualization (Subtle, palette-aware)
  // ========================================================================
  
  vec2 flowDir = curlNoise(uv * 3.0 + uTime * 0.1);
  float flowMag = length(flowDir);
  
  // Subtle directional lines using palette lattice color
  vec2 lineUv = uv + flowDir * 0.01;
  float flowLine = abs(fract(dot(lineUv, normalize(flowDir + 0.001)) * 20.0) - 0.5);
  float flowVis = smoothstep(0.1, 0.05, flowLine) * flowMag * 0.06;
  color += paletteLattice(uPaletteMode, 0.2) * flowVis;
  
  // ========================================================================
  // Atmosphere Pass (Exposure + Filmic + Grain + CRT + Vignette)
  // ========================================================================
  
  // Apply exposure
  color *= uExposure;
  
  // Filmic tonemapping (blend between linear and filmic)
  vec3 filmicColor = filmicTonemap(color);
  color = mix(color, filmicColor, uFilmic);
  
  // Film grain (subtle, stable)
  if (uGrainStrength > 0.001) {
    float grain = filmGrain(uv, uResolution, uTime);
    color += grain * uGrainStrength;
  }
  
  // CRT effect (scanlines + aperture grille, gated by vignette)
  if (uCrtStrength > 0.01) {
    float crt = crtEffect(uv, uTime, uCrtStrength);
    color -= crt * 0.1;
  }
  
  // Vignette (slightly stronger for cinematic focus)
  vec2 vignetteUv = uv * 2.0 - 1.0;
  float vignetteDist = length(vignetteUv);
  float vignette = 1.0 - vignetteDist * vignetteDist * 0.2;
  color *= vignette;
  
  // Clamp to prevent negative values from grain/CRT
  color = max(color, vec3(0.0));
  
  gl_FragColor = vec4(color, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Arrow Instance Shader
// -----------------------------------------------------------------------------

export const PCB_ARROWS_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform vec4 uHover;
uniform vec4 uAnchors[8];
uniform int uAnchorCount;
uniform float uProbeRadius;
// FIX: Add plane size uniform for correct UV normalization
uniform vec2 uPlaneSize;
// FIX: Add max point size uniform to prevent blowout
uniform float uMaxPointSize;

attribute float aPhase;
attribute float aSize;

varying float vBrightness;
varying float vPhase;
varying vec2 vArrowDir;

// Curl noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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

vec2 curlNoise(vec2 p) {
  float eps = 0.01;
  float n1 = noise(p + vec2(eps, 0.0));
  float n2 = noise(p - vec2(eps, 0.0));
  float n3 = noise(p + vec2(0.0, eps));
  float n4 = noise(p - vec2(0.0, eps));
  
  return vec2(n3 - n4, n1 - n2) / (2.0 * eps);
}

void main() {
  vec3 pos = position;
  
  // FIX: Correct UV normalization - plane positions are in world coords (e.g. -10 to +10)
  // Convert to 0-1 UV space by dividing by plane size
  vec2 posUv = (pos.xy / uPlaneSize) + 0.5;
  
  // Get flow direction from curl noise
  vec2 flowDir = curlNoise(posUv * 3.0 + uTime * 0.1);
  
  // Modify flow toward hover point (subtle)
  if (uHover.w > 0.5) {
    vec2 toHover = uHover.xy - posUv;
    float hoverDist = length(toHover);
    // FIX: Reduce attraction strength to prevent warping entire field
    float attraction = smoothstep(uProbeRadius * 3.0, 0.0, hoverDist);
    flowDir = mix(flowDir, normalize(toHover + 0.001), attraction * 0.3);
  }
  
  // Modify flow toward anchors (subtle)
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    vec2 anchorUv = uAnchors[i].xy;
    float strength = uAnchors[i].z;
    vec2 toAnchor = anchorUv - posUv;
    float anchorDist = length(toAnchor);
    float pull = smoothstep(0.2, 0.0, anchorDist) * strength;
    flowDir = mix(flowDir, normalize(toAnchor + 0.001), pull * 0.3);
  }
  
  vArrowDir = normalize(flowDir + 0.001);
  
  // Base brightness (reduced to prevent blowout)
  float brightness = 0.15 + length(flowDir) * 1.0;
  
  // Hover boost (reduced)
  if (uHover.w > 0.5) {
    float hoverDist = length(posUv - uHover.xy);
    float hoverBoost = smoothstep(uProbeRadius * 2.0, uProbeRadius * 0.5, hoverDist);
    brightness += hoverBoost * 0.3;
  }
  
  vBrightness = clamp(brightness, 0.0, 1.0);
  vPhase = aPhase;
  
  // FIX: REMOVED the rotation that was clustering everything toward origin
  // The old code: pos.xy = rotation * pos.xy * 0.5; was scaling positions down by 0.5
  // This caused all points to cluster in a small area
  // Instead, just apply a tiny jitter for animation
  pos.xy += flowDir * sin(uTime * 2.0 + aPhase * 6.28) * 0.02;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // FIX: Safer point size calculation with clamp to prevent giant points
  float rawSize = aSize * (0.5 + brightness * 0.3) * (60.0 / -mvPosition.z);
  gl_PointSize = clamp(rawSize, 1.0, uMaxPointSize);
}
`;

export const PCB_ARROWS_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform int uPaletteMode;
uniform float uAccentIntensity;

varying float vBrightness;
varying float vPhase;
varying vec2 vArrowDir;

// Palette-aware arrow colors (simplified versions of main shader palettes)
vec3 arrowColorDim(int mode) {
  if (mode == 0) return vec3(0.03, 0.12, 0.10); // glia-cyan
  if (mode == 1) return vec3(0.08, 0.04, 0.12); // orchid
  if (mode == 2) return vec3(0.12, 0.08, 0.03); // amber
  if (mode == 3) return vec3(0.04, 0.10, 0.04); // mono
  if (mode == 4) return vec3(0.05, 0.10, 0.15); // ice
  return vec3(0.05, 0.12, 0.10);
}

vec3 arrowColorBright(int mode) {
  if (mode == 0) return vec3(0.08, 0.35, 0.30); // glia-cyan
  if (mode == 1) return vec3(0.20, 0.15, 0.35); // orchid
  if (mode == 2) return vec3(0.30, 0.22, 0.08); // amber
  if (mode == 3) return vec3(0.10, 0.30, 0.12); // mono
  if (mode == 4) return vec3(0.12, 0.28, 0.40); // ice
  return vec3(0.10, 0.30, 0.25);
}

void main() {
  vec2 center = gl_PointCoord - 0.5;
  
  // Arrow shape (triangle pointing in flow direction)
  float angle = atan(vArrowDir.y, vArrowDir.x);
  mat2 rot = mat2(cos(-angle), -sin(-angle), sin(-angle), cos(-angle));
  vec2 p = rot * center;
  
  // Triangle SDF approximation
  float arrow = max(abs(p.y) - (0.3 - p.x * 0.8), p.x - 0.25);
  
  if (arrow > 0.0) discard;
  
  float alpha = smoothstep(0.0, -0.05, arrow);
  
  // Flow animation (subtle)
  float flow = sin(uTime * 4.0 + vPhase * 6.28) * 0.2 + 0.8;
  
  // Color from palette (darker base, brighter tips)
  vec3 color = mix(
    arrowColorDim(uPaletteMode),
    arrowColorBright(uPaletteMode),
    vBrightness
  );
  
  // Apply accent intensity
  color *= (0.8 + uAccentIntensity * 0.2);
  
  // Reduced alpha to prevent additive blowout
  gl_FragColor = vec4(color, alpha * vBrightness * flow * 0.22);
}
`;

// -----------------------------------------------------------------------------
// Material Factory
// -----------------------------------------------------------------------------

export interface PcbUniforms {
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
  // FIX: New uniforms for correct UV normalization and point size control
  uPlaneSize: { value: THREE.Vector2 };
  uMaxPointSize: { value: number };
  // === Ultra-Fine Lattice Uniforms ===
  uMicroGrid1: { value: number };
  uMicroGrid2: { value: number };
  uMicroGridStrength: { value: number };
  uRevealStrength: { value: number };
  uMicroWarp: { value: number };
  uEtchDistortion: { value: number };
  // === Phase Lens Uniforms ===
  uLens: { value: THREE.Vector4 }; // xy = center uv, z = radius, w = magnification
  uLensVelocity: { value: number }; // 0..1 normalized velocity
  uLensChromatic: { value: number }; // chromatic aberration intensity
  uLensEnabled: { value: number }; // 0 or 1
  // === Lattice Mode Uniform ===
  uLatticeMode: { value: number }; // 0=rect, 1=hex, 2=tri
  // === Etch Velocity Uniform ===
  uEtchVelocity: { value: number }; // 0..1 for visual feedback
  // === Palette / Atmosphere Uniforms ===
  uPaletteMode: { value: number }; // 0=glia-cyan, 1=orchid, 2=amber, 3=mono, 4=ice
  uAccentIntensity: { value: number }; // 0-2
  uIridescenceStrength: { value: number }; // 0-1
  uIridescenceScale: { value: number }; // 1-40
  uExposure: { value: number }; // 0.6-2.0
  uFilmic: { value: number }; // 0-1
  uGrainStrength: { value: number }; // 0-0.08
  uCrtStrength: { value: number }; // 0-1
  uCopperStrength: { value: number }; // 0-1
}

export function createPcbUniforms(): PcbUniforms {
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
    // FIX: New uniforms - will be set from PcbField.tsx
    uPlaneSize: { value: new THREE.Vector2(20, 15) },
    uMaxPointSize: { value: 8 },
    // === Ultra-Fine Lattice Uniforms ===
    uMicroGrid1: { value: 60 },      // Fine grid frequency
    uMicroGrid2: { value: 200 },     // Ultra-fine grid frequency
    uMicroGridStrength: { value: 0.8 }, // Overall lattice visibility
    uRevealStrength: { value: 1.0 },   // How much hover reveals lattice
    uMicroWarp: { value: 0.015 },      // Subtle domain warping
    uEtchDistortion: { value: 0.008 }, // UV distortion in etched areas
    // === Phase Lens Uniforms ===
    uLens: { value: new THREE.Vector4(0.5, 0.5, 0.12, 1.0) }, // center, radius, mag
    uLensVelocity: { value: 0 },
    uLensChromatic: { value: 0.35 },
    uLensEnabled: { value: 1 },
    // === Lattice Mode Uniform ===
    uLatticeMode: { value: 0 }, // 0=rect, 1=hex, 2=tri
    // === Etch Velocity Uniform ===
    uEtchVelocity: { value: 0 },
    // === Palette / Atmosphere Uniforms ===
    uPaletteMode: { value: 1 }, // Default: orchid (museum-grade)
    uAccentIntensity: { value: 1.1 },
    uIridescenceStrength: { value: 0.35 },
    uIridescenceScale: { value: 14 },
    uExposure: { value: 1.0 },
    uFilmic: { value: 0.85 },
    uGrainStrength: { value: 0.015 },
    uCrtStrength: { value: 0.25 },
    uCopperStrength: { value: 0.15 },
  };
}

export function createPcbMaterial(uniforms: PcbUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PCB_VERTEX_SHADER,
    fragmentShader: PCB_FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
}

export function createPcbArrowsMaterial(
  uniforms: PcbUniforms,
  blending: "normal" | "additive" = "normal"
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PCB_ARROWS_VERTEX_SHADER,
    fragmentShader: PCB_ARROWS_FRAGMENT_SHADER,
    uniforms: {
      uTime: uniforms.uTime,
      uHover: uniforms.uHover,
      uAnchors: uniforms.uAnchors,
      uAnchorCount: uniforms.uAnchorCount,
      uProbeRadius: uniforms.uProbeRadius,
      // UV normalization and point size control
      uPlaneSize: uniforms.uPlaneSize,
      uMaxPointSize: uniforms.uMaxPointSize,
      // Palette uniforms for arrows
      uPaletteMode: uniforms.uPaletteMode,
      uAccentIntensity: uniforms.uAccentIntensity,
    },
    transparent: true,
    depthWrite: false,
    // FIX: Default to normal blending for debugging; additive can be enabled via config
    blending: blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// -----------------------------------------------------------------------------
// Arrows Geometry Factory
// -----------------------------------------------------------------------------

export function createPcbArrowsGeometry(
  count: number,
  planeWidth: number,
  planeHeight: number
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  // Grid distribution for arrows
  const gridSizeX = Math.ceil(Math.sqrt(count * (planeWidth / planeHeight)));
  const gridSizeY = Math.ceil(count / gridSizeX);

  for (let i = 0; i < count; i++) {
    const gx = i % gridSizeX;
    const gy = Math.floor(i / gridSizeX);

    // Position with slight jitter
    const jitterX = (Math.random() - 0.5) * 0.3;
    const jitterY = (Math.random() - 0.5) * 0.3;

    positions[i * 3] =
      ((gx + 0.5 + jitterX) / gridSizeX - 0.5) * planeWidth;
    positions[i * 3 + 1] =
      ((gy + 0.5 + jitterY) / gridSizeY - 0.5) * planeHeight;
    positions[i * 3 + 2] = 0.02;

    phases[i] = Math.random();
    sizes[i] = 2.0 + Math.random() * 1.5;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  return geometry;
}

