import { useMemo } from 'react';
import { latLngToWorld } from '../../utils/coordinates';

/**
 * Simplified 3D city model for Providence
 * Creates procedural buildings in a grid pattern around the center
 */
export default function CityModel() {
  const buildings = useMemo(() => {
    const buildingData: Array<{
      position: [number, number, number];
      size: [number, number, number];
      color: string;
    }> = [];

    // Create a grid of buildings around Providence center
    // Providence roughly spans from 41.80 to 41.85 lat and -71.42 to -71.38 lng
    const center = latLngToWorld(41.8268, -71.4025);
    const gridSize = 8;
    const spacing = 3;

    for (let i = -gridSize; i <= gridSize; i++) {
      for (let j = -gridSize; j <= gridSize; j++) {
        // Skip center area (where player spawns)
        if (Math.abs(i) < 2 && Math.abs(j) < 2) continue;

        const x = center.x + i * spacing;
        const z = center.z + j * spacing;

        // Random building height (2-8 units)
        const height = 2 + Math.random() * 6;
        const width = 1.5 + Math.random() * 1;
        const depth = 1.5 + Math.random() * 1;

        // Brighter colors for better visibility
        const lightness = 0.6 + Math.random() * 0.3;
        const color = `hsl(200, 20%, ${lightness * 100}%)`;

        buildingData.push({
          position: [x, height / 2, z],
          size: [width, height, depth],
          color,
        });
      }
    }

    return buildingData;
  }, []);

  return (
    <>
      {buildings.map((building, index) => (
        <mesh
          key={index}
          position={building.position}
          castShadow
          receiveShadow
        >
          <boxGeometry args={building.size} />
          <meshStandardMaterial
            color={building.color}
            metalness={0.1}
            roughness={0.8}
          />
        </mesh>
      ))}

      {/* Add some roads */}
      {[-6, -3, 0, 3, 6].map((offset) => {
        const center = latLngToWorld(41.8268, -71.4025);
        return (
          <mesh
            key={`road-x-${offset}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[center.x + offset, 0.01, center.z]}
            receiveShadow
          >
            <planeGeometry args={[0.5, 20]} />
            <meshStandardMaterial color="#4a5568" />
          </mesh>
        );
      })}

      {[-6, -3, 0, 3, 6].map((offset) => {
        const center = latLngToWorld(41.8268, -71.4025);
        return (
          <mesh
            key={`road-z-${offset}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[center.x, 0.01, center.z + offset]}
            receiveShadow
          >
            <planeGeometry args={[20, 0.5]} />
            <meshStandardMaterial color="#4a5568" />
          </mesh>
        );
      })}
    </>
  );
}
