/**
 * Style C - "Damped Water-Glass Ripple (Liquid/Refraction)"
 *
 * A glassy, watery membrane under the UI. Hover creates small damped ripples;
 * intent etches thin "capillary trails" that fade; click creates an impulse ring
 * with refractive shimmer; latch forms a standing wave node.
 */

import * as THREE from "three";

// -----------------------------------------------------------------------------
// Shader Code
// -----------------------------------------------------------------------------

export const WATER_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const WATER_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uHeightTex;     // Current height from simulation
uniform sampler2D uPrevHeightTex; // Previous height (for velocity)
uniform vec4 uHover;
uniform float uProbeRadius;
uniform vec4 uAnchors[8];
uniform int uAnchorCount;

varying vec2 vUv;
varying vec3 vPosition;

const float PI = 3.14159265359;

// ============================================================================
// Normal Reconstruction
// ============================================================================

vec3 computeNormal(vec2 uv, float texelSize) {
  float hL = texture2D(uHeightTex, uv + vec2(-texelSize, 0.0)).r;
  float hR = texture2D(uHeightTex, uv + vec2(texelSize, 0.0)).r;
  float hU = texture2D(uHeightTex, uv + vec2(0.0, texelSize)).r;
  float hD = texture2D(uHeightTex, uv + vec2(0.0, -texelSize)).r;
  
  float dx = (hR - hL) * 2.0;
  float dy = (hU - hD) * 2.0;
  
  return normalize(vec3(-dx, -dy, 0.1));
}

// ============================================================================
// Fresnel Effect
// ============================================================================

float fresnel(vec3 normal, vec3 viewDir, float power) {
  return pow(1.0 - max(dot(normal, viewDir), 0.0), power);
}

// ============================================================================
// Chromatic Aberration
// ============================================================================

vec3 chromaticOffset(vec2 uv, vec3 normal, float amount) {
  vec2 offset = normal.xy * amount;
  
  float r = texture2D(uHeightTex, uv + offset * 1.0).r;
  float g = texture2D(uHeightTex, uv + offset * 0.5).r;
  float b = texture2D(uHeightTex, uv).r;
  
  return vec3(r, g, b);
}

// ============================================================================
// Caustics (Simplified)
// ============================================================================

float caustics(vec2 uv, float time) {
  vec2 p = uv * 10.0;
  float c1 = sin(p.x * 3.0 + time * 1.5) * sin(p.y * 3.0 + time * 1.2);
  float c2 = sin(p.x * 4.0 - time * 1.8) * sin(p.y * 4.0 + time * 1.4);
  return (c1 + c2) * 0.5 + 0.5;
}

// ============================================================================
// Main Shader
// ============================================================================

void main() {
  vec2 uv = vUv;
  float texelSize = 1.0 / 256.0; // Assuming 256 resolution
  
  // Sample height and compute velocity
  float height = texture2D(uHeightTex, uv).r - 0.5; // Center around 0
  float prevHeight = texture2D(uPrevHeightTex, uv).r - 0.5;
  float velocity = height - prevHeight;
  
  // Compute surface normal
  vec3 normal = computeNormal(uv, texelSize);
  
  // View direction (simplified, looking down Z)
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  
  // ========================================================================
  // Base Water Color
  // ========================================================================
  
  // Deep blue-teal base
  vec3 deepColor = vec3(0.01, 0.03, 0.06);
  vec3 shallowColor = vec3(0.05, 0.15, 0.2);
  
  // Mix based on height (higher = shallower appearance)
  vec3 waterColor = mix(deepColor, shallowColor, height * 2.0 + 0.5);
  
  // ========================================================================
  // Fresnel Rim
  // ========================================================================
  
  float fresnelValue = fresnel(normal, viewDir, 2.0);
  vec3 rimColor = vec3(0.3, 0.6, 0.8);
  waterColor += rimColor * fresnelValue * 0.3;
  
  // ========================================================================
  // Refraction-like Effect (Chromatic)
  // ========================================================================
  
  vec3 chromatic = chromaticOffset(uv, normal, 0.01);
  float chromaticIntensity = abs(height) * 2.0;
  vec3 refractionColor = vec3(0.2, 0.5, 0.7) * (chromatic - 0.5) * 2.0;
  waterColor += refractionColor * chromaticIntensity * 0.3;
  
  // ========================================================================
  // Gradient Highlighting (Edges where height changes)
  // ========================================================================
  
  float gradient = length(normal.xy);
  vec3 highlightColor = vec3(0.5, 0.8, 1.0);
  waterColor += highlightColor * gradient * 0.4;
  
  // ========================================================================
  // Caustics
  // ========================================================================
  
  float causticsVal = caustics(uv, uTime);
  float causticsZone = smoothstep(0.0, 0.3, abs(height));
  waterColor += vec3(0.2, 0.4, 0.5) * causticsVal * causticsZone * 0.15;
  
  // ========================================================================
  // Velocity-based Sparkle
  // ========================================================================
  
  float sparkle = abs(velocity) * 10.0;
  sparkle = smoothstep(0.0, 1.0, sparkle);
  waterColor += vec3(0.8, 0.9, 1.0) * sparkle * 0.5;
  
  // ========================================================================
  // Hover Indicator
  // ========================================================================
  
  if (uHover.w > 0.5) {
    vec2 hoverUv = uHover.xy;
    float hoverDist = length(uv - hoverUv);
    
    // Soft glow at hover point
    float hoverGlow = smoothstep(uProbeRadius * 1.5, 0.0, hoverDist);
    vec3 hoverColor = uHover.z > 0.5 
      ? vec3(1.0, 0.4, 0.6) // Etch = pink
      : vec3(0.4, 0.8, 1.0); // Probe = cyan
    
    waterColor += hoverColor * hoverGlow * 0.3;
    
    // Ring indicator
    float ring = smoothstep(uProbeRadius * 0.8, uProbeRadius, hoverDist) *
                 smoothstep(uProbeRadius * 1.2, uProbeRadius, hoverDist);
    waterColor += hoverColor * ring * 0.4;
  }
  
  // ========================================================================
  // Anchor Indicators (Standing Wave Sources)
  // ========================================================================
  
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    
    vec2 anchorUv = uAnchors[i].xy;
    float strength = uAnchors[i].z;
    float phase = uAnchors[i].w;
    
    float anchorDist = length(uv - anchorUv);
    
    // Pulsing core
    float pulse = 0.5 + 0.5 * sin(uTime * 4.0 + phase);
    float core = smoothstep(0.03, 0.0, anchorDist) * pulse;
    
    // Emanating rings
    float ringPattern = sin((anchorDist - uTime * 0.3) * 40.0) * 0.5 + 0.5;
    float ringFade = smoothstep(0.2, 0.02, anchorDist);
    float rings = ringPattern * ringFade * strength;
    
    vec3 anchorColor = vec3(0.4, 1.0, 0.7); // Aqua-green
    waterColor += anchorColor * (core + rings * 0.2) * strength;
  }
  
  // ========================================================================
  // Final Adjustments
  // ========================================================================
  
  // Subtle vignette
  vec2 vignetteUv = uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(vignetteUv, vignetteUv) * 0.2;
  waterColor *= vignette;
  
  // Gamma hint
  waterColor = pow(waterColor, vec3(0.95));
  
  gl_FragColor = vec4(waterColor, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Material Factory
// -----------------------------------------------------------------------------

export interface WaterUniforms {
  [key: string]: { value: unknown };
  uTime: { value: number };
  uResolution: { value: THREE.Vector2 };
  uHeightTex: { value: THREE.Texture | null };
  uPrevHeightTex: { value: THREE.Texture | null };
  uHover: { value: THREE.Vector4 };
  uProbeRadius: { value: number };
  uAnchors: { value: THREE.Vector4[] };
  uAnchorCount: { value: number };
}

export function createWaterUniforms(): WaterUniforms {
  return {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uHeightTex: { value: null },
    uPrevHeightTex: { value: null },
    uHover: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
    uProbeRadius: { value: 0.08 },
    uAnchors: {
      value: Array(8)
        .fill(null)
        .map(() => new THREE.Vector4(0, 0, 0, 0)),
    },
    uAnchorCount: { value: 0 },
  };
}

export function createWaterMaterial(uniforms: WaterUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
}

