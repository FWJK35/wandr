import { Polygon } from '@react-google-maps/api';
import type { Zone } from '../../types';

interface ZoneOverlayProps {
  zone: Zone;
}

export default function ZoneOverlay({ zone }: ZoneOverlayProps) {
  // Convert GeoJSON coordinates to Google Maps LatLng format
  const paths = zone.boundary.coordinates[0].map(([lng, lat]: [number, number]) => ({
    lat,
    lng,
  }));

  const progress = zone.totalLocations > 0
    ? zone.visited / zone.totalLocations
    : 0;

  // Gradient color based on progress
  const fillColor = zone.captured
    ? '#22c55e' // Green for captured
    : progress > 0.3
    ? '#eab308' // Yellow for in-progress
    : '#6b7280'; // Gray for uncaptured

  const fillOpacity = zone.captured ? 0.25 : 0.15;
  const strokeColor = zone.captured ? '#22c55e' : '#9ca3af';

  return (
    <Polygon
      paths={paths}
      options={{
        fillColor,
        fillOpacity,
        strokeColor,
        strokeOpacity: 0.6,
        strokeWeight: 2,
        clickable: true,
      }}
    />
  );
}
