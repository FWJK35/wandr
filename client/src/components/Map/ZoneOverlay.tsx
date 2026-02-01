import { Source, Layer } from 'react-map-gl';
import type { FillLayer, LineLayer } from 'react-map-gl';
import type { Zone } from '../../types';

interface ZoneOverlayProps {
  zone: Zone;
}

export default function ZoneOverlay({ zone }: ZoneOverlayProps) {
  // Light green for captured/visited zones, gray for locked/uncaptured
  const fillColor = zone.captured ? '#86efac' : '#6b7280'; // green-300 or gray-500
  const strokeColor = zone.captured ? '#22c55e' : '#9ca3af'; // green-500 or gray-400
  const fillOpacity = 0.3; // Translucent

  const fillLayerStyle: FillLayer = {
    id: `zone-fill-${zone.id}`,
    type: 'fill',
    source: `zone-${zone.id}`,
    paint: {
      'fill-color': fillColor,
      'fill-opacity': fillOpacity,
    },
  };

  const lineLayerStyle: LineLayer = {
    id: `zone-line-${zone.id}`,
    type: 'line',
    source: `zone-${zone.id}`,
    paint: {
      'line-color': strokeColor,
      'line-width': 2,
      'line-opacity': 0.8,
    },
  };

  const geoJsonData: GeoJSON.Feature = {
    type: 'Feature',
    properties: {
      name: zone.name,
      captured: zone.captured,
    },
    geometry: zone.boundary,
  };

  return (
    <Source id={`zone-${zone.id}`} type="geojson" data={geoJsonData}>
      <Layer {...fillLayerStyle} />
      <Layer {...lineLayerStyle} />
    </Source>
  );
}
