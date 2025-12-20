/**
 * Water Simulation RTT
 *
 * Ping-pong render targets implementing the damped wave equation for
 * realistic water ripple simulation.
 *
 * Wave equation: d²h/dt² = c² * ∇²h - damping * dh/dt
 * Discretized: h[t+1] = 2*h[t] - h[t-1] + c²*(laplacian) - damping*(h[t] - h[t-1])
 */

import * as THREE from "three";

// -----------------------------------------------------------------------------
// Water Update Shader
// -----------------------------------------------------------------------------

const WATER_UPDATE_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WATER_UPDATE_FRAGMENT = /* glsl */ `
uniform sampler2D uPrevTex;   // h[t-1]
uniform sampler2D uCurrentTex; // h[t]
uniform vec2 uResolution;
uniform float uDamping;
uniform float uWaveSpeed;

// Impulse injection
uniform vec2 uImpulsePos;
uniform float uImpulseStrength;
uniform float uImpulseRadius;

// Anchor oscillators (standing wave sources)
uniform vec4 uAnchors[8]; // xy = pos, z = strength, w = phase
uniform int uAnchorCount;
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 texel = 1.0 / uResolution;
  
  // Sample current and previous heights
  float hCurrent = texture2D(uCurrentTex, vUv).r;
  float hPrev = texture2D(uPrevTex, vUv).r;
  
  // Sample neighbors for Laplacian
  float hLeft = texture2D(uCurrentTex, vUv + vec2(-texel.x, 0.0)).r;
  float hRight = texture2D(uCurrentTex, vUv + vec2(texel.x, 0.0)).r;
  float hUp = texture2D(uCurrentTex, vUv + vec2(0.0, texel.y)).r;
  float hDown = texture2D(uCurrentTex, vUv + vec2(0.0, -texel.y)).r;
  
  // Laplacian (discrete second derivative)
  float laplacian = hLeft + hRight + hUp + hDown - 4.0 * hCurrent;
  
  // Wave equation with damping
  float c2 = uWaveSpeed * uWaveSpeed;
  float hNew = 2.0 * hCurrent - hPrev + c2 * laplacian - uDamping * (hCurrent - hPrev);
  
  // Impulse injection (for clicks/bursts)
  if (uImpulseStrength > 0.0) {
    float dist = length(vUv - uImpulsePos);
    float impulse = smoothstep(uImpulseRadius, 0.0, dist) * uImpulseStrength;
    hNew += impulse;
  }
  
  // Anchor oscillators (standing waves)
  for (int i = 0; i < 8; i++) {
    if (i >= uAnchorCount) break;
    
    vec2 anchorPos = uAnchors[i].xy;
    float strength = uAnchors[i].z;
    float phase = uAnchors[i].w;
    
    float dist = length(vUv - anchorPos);
    float oscillation = sin(uTime * 8.0 + phase) * strength * 0.3;
    float falloff = smoothstep(0.05, 0.0, dist);
    hNew += oscillation * falloff;
  }
  
  // Clamp to prevent instability
  hNew = clamp(hNew, -1.0, 1.0);
  
  gl_FragColor = vec4(hNew, hNew, hNew, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Water Simulation RTT Class
// -----------------------------------------------------------------------------

export class WaterSimRTT {
  private rtCurrent: THREE.WebGLRenderTarget;
  private rtPrev: THREE.WebGLRenderTarget;
  private rtTemp: THREE.WebGLRenderTarget;
  private updateMaterial: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(resolution: number = 256) {

    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };

    this.rtCurrent = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions);
    this.rtPrev = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions);
    this.rtTemp = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions);

    this.updateMaterial = new THREE.ShaderMaterial({
      vertexShader: WATER_UPDATE_VERTEX,
      fragmentShader: WATER_UPDATE_FRAGMENT,
      uniforms: {
        uPrevTex: { value: null },
        uCurrentTex: { value: null },
        uResolution: { value: new THREE.Vector2(resolution, resolution) },
        uDamping: { value: 0.03 },
        uWaveSpeed: { value: 0.3 },
        uImpulsePos: { value: new THREE.Vector2(0.5, 0.5) },
        uImpulseStrength: { value: 0 },
        uImpulseRadius: { value: 0.03 },
        uAnchors: {
          value: Array(8)
            .fill(null)
            .map(() => new THREE.Vector4(0, 0, 0, 0)),
        },
        uAnchorCount: { value: 0 },
        uTime: { value: 0 },
      },
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.updateMaterial);

    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Initialize with WebGL renderer
   */
  init(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    this.clear();
  }

  /**
   * Run one simulation step
   */
  update(options: {
    time: number;
    damping?: number;
    waveSpeed?: number;
    impulsePos?: { x: number; y: number } | null;
    impulseStrength?: number;
    impulseRadius?: number;
    anchors?: Array<{ uv: { x: number; y: number }; strength: number; phase: number }>;
  }): void {
    if (!this.renderer) return;

    const {
      time,
      damping = 0.03,
      waveSpeed = 0.3,
      impulsePos = null,
      impulseStrength = 0,
      impulseRadius = 0.03,
      anchors = [],
    } = options;

    // Update uniforms
    this.updateMaterial.uniforms.uPrevTex.value = this.rtPrev.texture;
    this.updateMaterial.uniforms.uCurrentTex.value = this.rtCurrent.texture;
    this.updateMaterial.uniforms.uDamping.value = damping;
    this.updateMaterial.uniforms.uWaveSpeed.value = waveSpeed;
    this.updateMaterial.uniforms.uImpulseStrength.value = impulsePos ? impulseStrength : 0;
    this.updateMaterial.uniforms.uTime.value = time;

    if (impulsePos) {
      this.updateMaterial.uniforms.uImpulsePos.value.set(impulsePos.x, impulsePos.y);
    }

    this.updateMaterial.uniforms.uImpulseRadius.value = impulseRadius;
    this.updateMaterial.uniforms.uAnchorCount.value = anchors.length;

    for (let i = 0; i < 8; i++) {
      if (i < anchors.length) {
        const a = anchors[i];
        this.updateMaterial.uniforms.uAnchors.value[i].set(
          a.uv.x,
          a.uv.y,
          a.strength,
          a.phase
        );
      }
    }

    // Render to temp
    this.renderer.setRenderTarget(this.rtTemp);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    // Swap buffers: prev = current, current = temp
    const oldPrev = this.rtPrev;
    this.rtPrev = this.rtCurrent;
    this.rtCurrent = this.rtTemp;
    this.rtTemp = oldPrev;
  }

  /**
   * Add an impulse at a specific position
   */
  addImpulse(pos: { x: number; y: number }, strength: number, radius: number): void {
    // Will be applied in next update call
    this.updateMaterial.uniforms.uImpulsePos.value.set(pos.x, pos.y);
    this.updateMaterial.uniforms.uImpulseStrength.value = strength;
    this.updateMaterial.uniforms.uImpulseRadius.value = radius;
  }

  /**
   * Get the current height texture
   */
  getTexture(): THREE.Texture {
    return this.rtCurrent.texture;
  }

  /**
   * Get the previous height texture (for velocity computation)
   */
  getPrevTexture(): THREE.Texture {
    return this.rtPrev.texture;
  }

  /**
   * Clear the simulation
   */
  clear(): void {
    if (!this.renderer) return;

    const clearColor = this.renderer.getClearColor(new THREE.Color());
    const clearAlpha = this.renderer.getClearAlpha();

    this.renderer.setRenderTarget(this.rtCurrent);
    this.renderer.setClearColor(0x808080, 1); // Mid-gray = 0 height
    this.renderer.clear();

    this.renderer.setRenderTarget(this.rtPrev);
    this.renderer.clear();

    this.renderer.setRenderTarget(this.rtTemp);
    this.renderer.clear();

    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(clearColor, clearAlpha);
  }

  /**
   * Resize the simulation
   */
  resize(resolution: number): void {
    this.rtCurrent.setSize(resolution, resolution);
    this.rtPrev.setSize(resolution, resolution);
    this.rtTemp.setSize(resolution, resolution);
    this.updateMaterial.uniforms.uResolution.value.set(resolution, resolution);
    this.clear();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.rtCurrent.dispose();
    this.rtPrev.dispose();
    this.rtTemp.dispose();
    this.updateMaterial.dispose();
    this.quad.geometry.dispose();
  }
}

