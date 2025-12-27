/**
 * Pareto Surface Shaders - Organic biomorphic GLSL for 3D visualization
 * Features: cellular patterns, iridescence, subsurface scattering, breathing animation
 */

export const paretoVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBreathing;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying float vFitness;

  attribute float fitness;

  // Simple noise for organic displacement
  float noise(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.5432))) * 43758.5453);
  }

  void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normal;
    vFitness = fitness;

    // Organic breathing displacement
    vec3 displaced = position;
    float breathe = sin(uTime * 0.5 + position.x * 2.0 + position.z * 2.0) * uBreathing;
    displaced.y += breathe * 0.05;

    // Add subtle wobble based on fitness
    float wobble = noise(position * 5.0 + uTime * 0.1) * 0.02 * fitness;
    displaced += normal * wobble;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const paretoFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLowColor;
  uniform vec3 uMidColor;
  uniform vec3 uHighColor;
  uniform vec3 uFrontierColor;
  uniform float uIridescence;
  uniform float uCellular;
  uniform sampler2D uDataTexture;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying float vFitness;

  // Hash function for cellular noise
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  // Voronoi cellular pattern
  float voronoi(vec2 uv, float time) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);

    float minDist = 1.0;

    for(int x = -1; x <= 1; x++) {
      for(int y = -1; y <= 1; y++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 point = hash2(i + neighbor);
        point = 0.5 + 0.5 * sin(time * 0.3 + 6.2831 * point);
        float dist = length(neighbor + point - f);
        minDist = min(minDist, dist);
      }
    }

    return minDist;
  }

  // Spectral color from angle (iridescence)
  vec3 spectral(float t) {
    vec3 a = vec3(0.5);
    vec3 b = vec3(0.5);
    vec3 c = vec3(1.0);
    vec3 d = vec3(0.0, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
  }

  // Subsurface scattering approximation
  vec3 subsurface(vec3 color, vec3 normal, vec3 viewDir, float depth) {
    float scatter = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
    vec3 scatterColor = color * vec3(1.2, 0.95, 0.9);
    return mix(color, scatterColor, scatter * depth * 0.5);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vPosition);

    // Fitness-based base color interpolation
    vec3 baseColor;
    if (vFitness < 0.33) {
      baseColor = mix(uLowColor, uMidColor, vFitness * 3.0);
    } else if (vFitness < 0.66) {
      baseColor = mix(uMidColor, uHighColor, (vFitness - 0.33) * 3.0);
    } else {
      baseColor = mix(uHighColor, uFrontierColor, (vFitness - 0.66) * 3.0);
    }

    // Cellular pattern overlay
    float cell = voronoi(vUv * 8.0, uTime);
    float cellEdge = smoothstep(0.0, 0.1, cell) * smoothstep(0.4, 0.2, cell);
    baseColor = mix(baseColor, baseColor * 1.3, cellEdge * uCellular);

    // Iridescence based on view angle
    float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
    vec3 iridescent = spectral(fresnel + vFitness * 0.5 + uTime * 0.1);
    baseColor = mix(baseColor, iridescent, fresnel * uIridescence);

    // Subsurface scattering for organic feel
    baseColor = subsurface(baseColor, normal, viewDir, vFitness);

    // Membrane glow at edges
    float edge = pow(fresnel, 2.0);
    baseColor += vec3(0.3, 0.8, 0.7) * edge * 0.3;

    // Subtle pulsing on high fitness areas
    float pulse = sin(uTime * 2.0 + vFitness * 6.28) * 0.5 + 0.5;
    if (vFitness > 0.8) {
      baseColor += uFrontierColor * pulse * 0.2;
    }

    gl_FragColor = vec4(baseColor, 0.9);
  }
`;

// Point shader for Pareto-optimal points
export const pointVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPointSize;

  attribute float fitness;
  attribute float isOptimal;

  varying float vFitness;
  varying float vIsOptimal;

  void main() {
    vFitness = fitness;
    vIsOptimal = isOptimal;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Pulse size for optimal points
    float pulse = 1.0 + sin(uTime * 3.0) * 0.2 * isOptimal;
    gl_PointSize = uPointSize * pulse * (1.0 + fitness * 0.5);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const pointFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uOptimalColor;
  uniform vec3 uNormalColor;

  varying float vFitness;
  varying float vIsOptimal;

  void main() {
    // Circular point shape
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    // Soft edge
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

    // Color based on optimal status
    vec3 color = mix(uNormalColor, uOptimalColor, vIsOptimal);

    // Glow for high fitness
    float glow = smoothstep(0.2, 0.0, dist) * vFitness;
    color += vec3(0.3, 0.6, 0.5) * glow;

    // Nucleus effect for optimal points
    if (vIsOptimal > 0.5 && dist < 0.15) {
      color = mix(color, vec3(1.0, 0.9, 0.7), 0.5);
    }

    gl_FragColor = vec4(color, alpha * 0.9);
  }
`;

// Axis helper shader
export const axisVertexShader = /* glsl */ `
  varying vec3 vColor;
  attribute vec3 color;

  void main() {
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const axisFragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, 0.6);
  }
`;

// Default colors (OKLCH converted to RGB approximations)
export const defaultColors = {
  low: [0.65, 0.35, 0.35], // evo-low (red)
  mid: [0.85, 0.75, 0.35], // evo-mid (yellow)
  high: [0.45, 0.75, 0.45], // evo-high (green)
  frontier: [0.9, 0.75, 0.4], // evo-frontier (gold)
  optimal: [0.95, 0.85, 0.5], // Bright gold
  normal: [0.45, 0.65, 0.6], // Teal
};
