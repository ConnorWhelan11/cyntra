/**
 * Quantum Field Canvas - DOM Mapping Utilities
 *
 * Converts DOM coordinates to NDC and provides raycast helpers.
 */

import * as THREE from "three";

// -----------------------------------------------------------------------------
// Coordinate Conversion
// -----------------------------------------------------------------------------

/**
 * Convert client coordinates to Normalized Device Coordinates (NDC)
 * NDC range: x: [-1, 1], y: [-1, 1] (y is flipped: top = 1, bottom = -1)
 */
export function clientToNdc(
  clientX: number,
  clientY: number,
  viewport?: { width: number; height: number }
): { x: number; y: number } {
  const vw = viewport?.width ?? window.innerWidth;
  const vh = viewport?.height ?? window.innerHeight;

  return {
    x: (clientX / vw) * 2 - 1,
    y: -((clientY / vh) * 2 - 1),
  };
}

/**
 * Convert NDC to UV coordinates (0-1 range, origin at bottom-left)
 */
export function ndcToUv(ndc: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (ndc.x + 1) / 2,
    y: (ndc.y + 1) / 2,
  };
}

/**
 * Convert client coordinates directly to UV
 */
export function clientToUv(
  clientX: number,
  clientY: number,
  viewport?: { width: number; height: number }
): { x: number; y: number } {
  const ndc = clientToNdc(clientX, clientY, viewport);
  return ndcToUv(ndc);
}

/**
 * Get the center of an element in client coordinates
 */
export function getElementCenter(element: HTMLElement): {
  x: number;
  y: number;
} {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Get element bounds in NDC space
 */
export function getElementNdcBounds(
  element: HTMLElement,
  viewport?: { width: number; height: number }
): {
  min: { x: number; y: number };
  max: { x: number; y: number };
  center: { x: number; y: number };
} {
  const rect = element.getBoundingClientRect();
  const min = clientToNdc(rect.left, rect.bottom, viewport);
  const max = clientToNdc(rect.right, rect.top, viewport);
  const center = clientToNdc(rect.left + rect.width / 2, rect.top + rect.height / 2, viewport);
  return { min, max, center };
}

// -----------------------------------------------------------------------------
// Raycast Helpers
// -----------------------------------------------------------------------------

// Reusable objects to avoid GC pressure
const _raycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();
const _intersections: THREE.Intersection[] = [];

/**
 * Raycast from NDC coordinates to a plane mesh
 * Returns the UV coordinates at the intersection point
 */
export function raycastToPlaneUv(
  ndc: { x: number; y: number },
  camera: THREE.Camera,
  planeMesh: THREE.Mesh
): { x: number; y: number } | null {
  _ndcVec.set(ndc.x, ndc.y);
  _raycaster.setFromCamera(_ndcVec, camera);

  _intersections.length = 0;
  planeMesh.raycast(_raycaster, _intersections);

  if (_intersections.length > 0 && _intersections[0].uv) {
    return {
      x: _intersections[0].uv.x,
      y: _intersections[0].uv.y,
    };
  }

  return null;
}

/**
 * Raycast from NDC coordinates to a plane mesh
 * Returns the world position at the intersection point
 */
export function raycastToPlaneWorld(
  ndc: { x: number; y: number },
  camera: THREE.Camera,
  planeMesh: THREE.Mesh
): { x: number; y: number; z: number } | null {
  _ndcVec.set(ndc.x, ndc.y);
  _raycaster.setFromCamera(_ndcVec, camera);

  _intersections.length = 0;
  planeMesh.raycast(_raycaster, _intersections);

  if (_intersections.length > 0) {
    const pt = _intersections[0].point;
    return { x: pt.x, y: pt.y, z: pt.z };
  }

  return null;
}

/**
 * Raycast from client coordinates to a plane mesh
 * Combines clientToNdc and raycastToPlaneUv
 */
export function clientToPlaneUv(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  planeMesh: THREE.Mesh,
  viewport?: { width: number; height: number }
): { x: number; y: number } | null {
  const ndc = clientToNdc(clientX, clientY, viewport);
  return raycastToPlaneUv(ndc, camera, planeMesh);
}

// -----------------------------------------------------------------------------
// Field Plane Geometry
// -----------------------------------------------------------------------------

/**
 * Calculate optimal plane size to cover the viewport at a given z depth
 */
export function calculatePlaneSizeForViewport(
  camera: THREE.PerspectiveCamera,
  planeZ: number = 0
): { width: number; height: number } {
  const distance = camera.position.z - planeZ;
  const vFov = (camera.fov * Math.PI) / 180;
  const height = 2 * Math.tan(vFov / 2) * distance;
  const width = height * camera.aspect;
  return { width, height };
}

/**
 * Create a field plane geometry sized to cover the viewport
 */
export function createFieldPlaneGeometry(
  camera: THREE.PerspectiveCamera,
  planeZ: number = 0,
  overscan: number = 1.2
): THREE.PlaneGeometry {
  const { width, height } = calculatePlaneSizeForViewport(camera, planeZ);
  return new THREE.PlaneGeometry(width * overscan, height * overscan, 1, 1);
}
