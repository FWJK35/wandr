// Geolocation utilities for distance calculations

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Calculate distance between two points using Haversine formula (in meters)
export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  const R = 6371000; // Earth's radius in meters
  const lat1 = toRadians(point1.latitude);
  const lat2 = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLng = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Check if point is within radius of center
export function isWithinRadius(point: Coordinates, center: Coordinates, radiusMeters: number): boolean {
  return calculateDistance(point, center) <= radiusMeters;
}

// Calculate bounding box for efficient database queries
export function getBoundingBox(center: Coordinates, radiusMeters: number): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  const latDelta = radiusMeters / 111320; // approx meters per degree latitude
  const lngDelta = radiusMeters / (111320 * Math.cos(toRadians(center.latitude)));

  return {
    minLat: center.latitude - latDelta,
    maxLat: center.latitude + latDelta,
    minLng: center.longitude - lngDelta,
    maxLng: center.longitude + lngDelta
  };
}

// Format coordinates for display
export function formatCoordinates(coords: Coordinates): string {
  const latDir = coords.latitude >= 0 ? 'N' : 'S';
  const lngDir = coords.longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(coords.latitude).toFixed(6)}°${latDir}, ${Math.abs(coords.longitude).toFixed(6)}°${lngDir}`;
}
