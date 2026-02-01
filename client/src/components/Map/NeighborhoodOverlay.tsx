import { Source, Layer } from 'react-map-gl';
import type { LineLayer } from 'react-map-gl';
import type { Neighborhood } from '../../types';

interface NeighborhoodOverlayProps {
  neighborhood: Neighborhood;
}

export default function NeighborhoodOverlay({ neighborhood }: NeighborhoodOverlayProps) {
  // Neighborhood boundaries are shown as dashed lines
  // Color based on capture status
  const strokeColor = neighborhood.fullyCaptured
    ? '#22c55e' // Green when fully captured
    : neighborhood.percentCaptured > 0
    ? '#facc15' // Yellow when partially captured
    : '#6b7280'; // Gray when not started

  const lineLayerStyle: LineLayer = {
    id: `neighborhood-line-${neighborhood.id}`,
    type: 'line',
    source: `neighborhood-${neighborhood.id}`,
    paint: {
      'line-color': strokeColor,
      'line-width': 3,
      'line-opacity': 0.9,
      'line-dasharray': [3, 2], // Dashed line
    },
  };

  const geoJsonData: GeoJSON.Feature = {
    type: 'Feature',
    properties: {
      name: neighborhood.name,
      percentCaptured: neighborhood.percentCaptured,
      fullyCaptured: neighborhood.fullyCaptured,
    },
    geometry: neighborhood.boundary,
  };

  return (
    <Source id={`neighborhood-${neighborhood.id}`} type="geojson" data={geoJsonData}>
      <Layer {...lineLayerStyle} />
    </Source>
  );
}
