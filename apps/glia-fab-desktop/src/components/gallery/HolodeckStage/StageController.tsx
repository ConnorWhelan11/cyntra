import { useFrame, useThree } from "@react-three/fiber";
import { Environment, ContactShadows, OrbitControls } from "@react-three/drei";
import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";

interface StageControllerProps {
  /** Target position to look at (usually asset center) */
  target?: [number, number, number];
  /** Whether to animate camera transitions */
  animating?: boolean;
  /** Called when camera animation completes */
  onAnimationComplete?: () => void;
  /** Whether to enable slow auto-orbit in idle/featured mode */
  enableAutoOrbit?: boolean;
  /** Whether to enable user-controlled orbit (drag to rotate, scroll to zoom) */
  enableUserControls?: boolean;
  /** Reduced motion preference */
  reducedMotion?: boolean;
}

/**
 * StageController - Manages camera, lighting, and environment for the stage
 *
 * Lighting setup (3-point):
 * - Key light: Main illumination from upper right
 * - Fill light: Softer fill from left
 * - Rim light: Edge definition from behind
 */
export function StageController({
  target = [0, 0, 0],
  animating = false,
  onAnimationComplete,
  enableAutoOrbit = false,
  enableUserControls = false,
  reducedMotion = false,
}: StageControllerProps) {
  const { camera } = useThree();
  const orbitAngle = useRef(0);
  const animProgress = useRef(0);

  // Default camera position (looking at model center from front)
  const defaultPos = useMemo(() => new THREE.Vector3(0, 2.5, 5), []);
  const targetVec = useMemo(() => new THREE.Vector3(...target), [target]);

  // Orbit radius and elevation for auto-orbit mode
  const orbitRadius = 5;
  const orbitElevation = 2.5;

  useFrame((_, delta) => {
    // Camera animation (settle to target)
    if (animating && !reducedMotion) {
      animProgress.current = Math.min(1, animProgress.current + delta * 2.5);
      const ease = 1 - Math.pow(1 - animProgress.current, 3); // ease-out cubic

      camera.position.lerp(defaultPos, ease * 0.1);
      camera.lookAt(targetVec);

      if (animProgress.current >= 1) {
        onAnimationComplete?.();
        animProgress.current = 0;
      }
    } else if (reducedMotion) {
      // Instant snap for reduced motion
      camera.position.copy(defaultPos);
      camera.lookAt(targetVec);
      onAnimationComplete?.();
    }

    // Slow auto-orbit in featured mode (when user controls are disabled)
    if (enableAutoOrbit && !enableUserControls && !animating && !reducedMotion) {
      orbitAngle.current += delta * 0.08; // ~45 seconds per rotation
      const x = Math.sin(orbitAngle.current) * orbitRadius;
      const z = Math.cos(orbitAngle.current) * orbitRadius;

      camera.position.set(x, orbitElevation, z);
      camera.lookAt(targetVec);
    }
  });

  // Reset animation progress on target change
  useEffect(() => {
    animProgress.current = 0;
  }, [target]);

  return (
    <>
      {/* User-controlled orbit (drag to rotate, scroll to zoom) */}
      {enableUserControls && (
        <OrbitControls
          target={targetVec}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
          minDistance={2.5}
          maxDistance={12}
          // Keep camera above ground (15° to 75° from vertical)
          minPolarAngle={Math.PI * 0.15}
          maxPolarAngle={Math.PI * 0.45}
          makeDefault
        />
      )}

      {/* Ambient base illumination */}
      <ambientLight intensity={0.4} color="#e8f4ff" />

      {/* Key light (upper right front) */}
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.0}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />

      {/* Fill light (left side, warm tint) */}
      <directionalLight
        position={[-3, 2, 4]}
        intensity={0.5}
        color="#fff5e6"
      />

      {/* Rim light (behind, cyan tint for holodeck feel) */}
      <pointLight
        position={[0, 4, -5]}
        intensity={0.8}
        color="#7fdbff"
        distance={15}
        decay={2}
      />

      {/* Accent point light for depth */}
      <pointLight
        position={[-4, 1, -2]}
        intensity={0.3}
        color="#ff7fdb"
        distance={10}
        decay={2}
      />

      {/* Environment map for reflections */}
      <Environment preset="city" />

      {/* Soft contact shadow at ground level (y=0 where model sits) */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.4}
        scale={10}
        blur={2}
        far={4}
        color="#000000"
      />
    </>
  );
}

export default StageController;
