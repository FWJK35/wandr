/**
 * Coordinate conversion utilities for 3D map
 * Converts lat/lng to 3D world coordinates centered on Providence
 */

// Providence center coordinates (from GameMap.tsx)
const PROVIDENCE_CENTER = {
  lat: 41.8268,
  lng: -71.4025,
};

// Scale factor: 1 degree lat/lng ≈ 111km
// For demo, we'll use a scale where 0.01 degrees ≈ 1 unit in 3D space
const SCALE = 100; // 1 unit = 0.01 degrees ≈ 1.11km

/**
 * Convert lat/lng to 3D world coordinates
 * Returns { x, z } where x is east-west and z is north-south
 */
export function latLngToWorld(lat: number, lng: number): { x: number; z: number } {
  const deltaLat = lat - PROVIDENCE_CENTER.lat;
  const deltaLng = lng - PROVIDENCE_CENTER.lng;
  
  return {
    x: deltaLng * SCALE,
    z: -deltaLat * SCALE, // Negative because in 3D, +Z is typically "forward" (north)
  };
}

/**
 * Convert 3D world coordinates back to lat/lng
 */
export function worldToLatLng(x: number, z: number): { lat: number; lng: number } {
  return {
    lat: PROVIDENCE_CENTER.lat - (z / SCALE),
    lng: PROVIDENCE_CENTER.lng + (x / SCALE),
  };
}

/**
 * Get distance in 3D world units between two lat/lng points
 */
export function getWorldDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const p1 = latLngToWorld(lat1, lng1);
  const p2 = latLngToWorld(lat2, lng2);
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
}

