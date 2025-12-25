import { useGLTF, Center } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useRef, useMemo, useLayoutEffect, useEffect } from "react";
import * as THREE from "three";

interface AssetModelProps {
  /** URL to the GLB/GLTF file */
  modelUrl: string;
  /** Whether this is a ghost preview (lower opacity) */
  isGhost?: boolean;
  /** Reduced motion preference */
  reducedMotion?: boolean;
  /** Called when model finishes loading */
  onLoad?: () => void;
  /** Called on load error */
  onError?: (error: Error) => void;
}

/**
 * Fallback component shown while GLB is loading
 */
function ModelLoadingFallback() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#1a2a4a"
        wireframe
        transparent
        opacity={0.5}
      />
    </mesh>
  );
}

/**
 * Inner component that loads and renders the GLB model
 */
function LoadedModel({
  modelUrl,
  isGhost,
  reducedMotion,
  onLoad,
  onError: _onError,
}: AssetModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const timeOffset = useRef(Math.random() * Math.PI * 2);
  // Track which URL we've called onLoad for (not just a boolean)
  const loadedUrlRef = useRef<string | null>(null);

  // Load the GLB
  const { scene } = useGLTF(modelUrl);

  // Clone scene for safe manipulation
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  // Signal load complete when scene is available for THIS model URL
  useEffect(() => {
    if (scene && loadedUrlRef.current !== modelUrl) {
      loadedUrlRef.current = modelUrl;
      onLoad?.();
    }
  }, [scene, modelUrl, onLoad]);

  // Calculate bounding box for auto-scaling and positioning
  const { scale, yOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Target size: fit within 3 units
    const targetScale = maxDim > 0 ? 3 / maxDim : 1;

    // Place model ON ground (bottom at y=0) rather than centered
    const yOff = -box.min.y * targetScale;

    return { scale: targetScale, yOffset: yOff };
  }, [clonedScene]);

  // Setup materials
  useLayoutEffect(() => {
    clonedScene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;

      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Apply ghost effect if needed
      if (isGhost) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];

        materials.forEach((mat) => {
          if (mat && "transparent" in mat) {
            (mat as THREE.MeshStandardMaterial).transparent = true;
            (mat as THREE.MeshStandardMaterial).opacity = 0.5;
          }
        });
      }
    });
  }, [clonedScene, isGhost]);

  // Micro-wobble animation (subtle life)
  useFrame(({ clock }) => {
    if (reducedMotion || !groupRef.current) return;

    const t = clock.getElapsedTime() + timeOffset.current;
    groupRef.current.rotation.y = Math.sin(t * 0.2) * 0.02;
  });

  return (
    <group ref={groupRef}>
      <Center position={[0, yOffset, 0]}>
        <primitive object={clonedScene} scale={scale} />
      </Center>
    </group>
  );
}

/**
 * AssetModel - Loads and displays a GLB/GLTF model with auto-scaling
 *
 * Features:
 * - Auto-centers and scales to fit stage
 * - Supports ghost preview mode (50% opacity)
 * - Subtle idle animation (disabled with reduced motion)
 * - Fallback during load
 */
export function AssetModel(props: AssetModelProps) {
  return (
    <Suspense fallback={<ModelLoadingFallback />}>
      <LoadedModel {...props} />
    </Suspense>
  );
}

/**
 * Preload a GLB for faster display later
 */
export function preloadModel(url: string) {
  useGLTF.preload(url);
}

export default AssetModel;
