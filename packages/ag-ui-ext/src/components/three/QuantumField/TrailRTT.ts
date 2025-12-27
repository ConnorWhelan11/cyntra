/**
 * Quantum Field Canvas - Trail RTT System
 *
 * Ping-pong render target for etch trail accumulation with decay.
 */

import * as THREE from "three";

// -----------------------------------------------------------------------------
// Trail Update Shader
// -----------------------------------------------------------------------------

const TRAIL_UPDATE_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TRAIL_UPDATE_FRAGMENT = /* glsl */ `
uniform sampler2D uPrevTex;
uniform float uDecay;
uniform vec2 uInjectPos; // UV position to inject
uniform float uInjectStrength; // 0 = no injection
uniform float uInjectRadius;

varying vec2 vUv;

void main() {
  // Sample previous frame
  vec4 prev = texture2D(uPrevTex, vUv);
  
  // Apply decay
  float decayed = prev.r * (1.0 - uDecay);
  
  // Inject new trail at position
  if (uInjectStrength > 0.0) {
    float dist = length(vUv - uInjectPos);
    float injection = smoothstep(uInjectRadius, 0.0, dist) * uInjectStrength;
    decayed = max(decayed, injection);
  }
  
  // Clamp to prevent runaway values
  decayed = clamp(decayed, 0.0, 1.0);
  
  gl_FragColor = vec4(decayed, decayed, decayed, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Trail RTT Class
// -----------------------------------------------------------------------------

export class TrailRTT {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private current: THREE.WebGLRenderTarget;
  private updateMaterial: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(width: number = 512, height: number = 512) {
    // Create render targets
    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };

    this.rtA = new THREE.WebGLRenderTarget(width, height, rtOptions);
    this.rtB = new THREE.WebGLRenderTarget(width, height, rtOptions);
    this.current = this.rtA;

    // Create update material
    this.updateMaterial = new THREE.ShaderMaterial({
      vertexShader: TRAIL_UPDATE_VERTEX,
      fragmentShader: TRAIL_UPDATE_FRAGMENT,
      uniforms: {
        uPrevTex: { value: null },
        uDecay: { value: 0.02 },
        uInjectPos: { value: new THREE.Vector2(0.5, 0.5) },
        uInjectStrength: { value: 0 },
        uInjectRadius: { value: 0.02 },
      },
    });

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.updateMaterial);

    // Create orthographic scene/camera for RTT
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Initialize with WebGL renderer (must be called once)
   */
  init(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;

    // Clear both targets
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();

    renderer.setRenderTarget(this.rtA);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();

    renderer.setRenderTarget(this.rtB);
    renderer.clear();

    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
  }

  /**
   * Update the trail with optional injection
   */
  update(options: {
    decay?: number;
    injectPos?: { x: number; y: number } | null;
    injectStrength?: number;
    injectRadius?: number;
  }): void {
    if (!this.renderer) return;

    const { decay = 0.02, injectPos = null, injectStrength = 0, injectRadius = 0.02 } = options;

    // Determine source and target
    const source = this.current;
    const target = this.current === this.rtA ? this.rtB : this.rtA;

    // Update uniforms
    this.updateMaterial.uniforms.uPrevTex.value = source.texture;
    this.updateMaterial.uniforms.uDecay.value = decay;
    this.updateMaterial.uniforms.uInjectStrength.value = injectPos ? injectStrength : 0;

    if (injectPos) {
      this.updateMaterial.uniforms.uInjectPos.value.set(injectPos.x, injectPos.y);
    }

    this.updateMaterial.uniforms.uInjectRadius.value = injectRadius;

    // Render to target
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    // Swap
    this.current = target;
  }

  /**
   * Get the current trail texture
   */
  getTexture(): THREE.Texture {
    return this.current.texture;
  }

  /**
   * Set the decay rate
   */
  setDecay(decay: number): void {
    this.updateMaterial.uniforms.uDecay.value = decay;
  }

  /**
   * Clear all trails
   */
  clear(): void {
    if (!this.renderer) return;

    const clearColor = this.renderer.getClearColor(new THREE.Color());
    const clearAlpha = this.renderer.getClearAlpha();

    this.renderer.setRenderTarget(this.rtA);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();

    this.renderer.setRenderTarget(this.rtB);
    this.renderer.clear();

    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(clearColor, clearAlpha);
  }

  /**
   * Resize the RTT buffers
   */
  resize(width: number, height: number): void {
    this.rtA.setSize(width, height);
    this.rtB.setSize(width, height);
    this.clear();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    this.updateMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
