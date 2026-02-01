import { useMemo } from 'react';
import { Shape } from 'three';
import { latLngToWorld } from '../../utils/coordinates';
import type { Zone } from '../../types';

interface ZoneOverlay3DProps {
  zone: Zone;
}

export default function ZoneOverlay3D({ zone }: ZoneOverlay3DProps) {
  const { shape, vertices } = useMemo(() => {
    // Convert GeoJSON coordinates to Three.js Shape
    const shape = new Shape();
    const vertices: number[] = [];
    const coords = zone.boundary.coordinates[0];
    
    coords.forEach(([lng, lat]: [number, number], index: number) => {
      const worldPos = latLngToWorld(lat, lng);
      if (index === 0) {
        shape.moveTo(worldPos.x, worldPos.z);
      } else {
        shape.lineTo(worldPos.x, worldPos.z);
      }
      vertices.push(worldPos.x, 0.1, worldPos.z);
    });
    // Close the shape
    if (coords.length > 0) {
      const firstPos = latLngToWorld(coords[0][1], coords[0][0]);
      shape.lineTo(firstPos.x, firstPos.z);
      vertices.push(firstPos.x, 0.1, firstPos.z);
    }

    return { shape, vertices };
  }, [zone.boundary]);

  const progress = zone.totalLocations > 0
    ? zone.visited / zone.totalLocations
    : 0;

  // Color based on progress
  const fillColor = zone.captured
    ? '#06b6d4' // Cyan for captured
    : progress > 0.3
    ? '#f59e0b' // Orange for in-progress
    : '#6b7280'; // Gray for uncaptured

  const opacity = zone.captured ? 0.3 : 0.15;

  return (
    <group>
      {/* Zone boundary plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <shapeGeometry args={[[shape]]} />
        <meshStandardMaterial
          color={fillColor}
          transparent
          opacity={opacity}
          side={2} // DoubleSide
        />
      </mesh>

      {/* Zone border line */}
      <line position={[0, 0.11, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={vertices.length / 3}
            array={new Float32Array(vertices)}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={zone.captured ? '#06b6d4' : '#9ca3af'}
          linewidth={2}
        />
      </line>
    </group>
  );
}

