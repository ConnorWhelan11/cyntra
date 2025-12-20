import * as THREE from "three";

// Easing function for smooth containment animation
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Generate a deterministic but chaotic-looking position for a node
export const generateChaosPosition = (
  index: number,
  seed: number
): THREE.Vector3 => {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = index * goldenAngle + seed;
  const phi = Math.acos(1 - 2 * ((index + 0.5) / 11));

  // Chaos radius: far outside the box (5-8 units)
  const radius = 5 + Math.sin(index * 2.3 + seed) * 3;

  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta) + Math.sin(index * 1.7) * 2,
    radius * Math.cos(phi)
  );
};
