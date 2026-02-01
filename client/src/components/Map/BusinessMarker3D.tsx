import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Business } from '../../types';
import { latLngToWorld } from '../../utils/coordinates';
import * as THREE from 'three';

interface BusinessMarker3DProps {
  business: Business;
  onClick: () => void;
}

export default function BusinessMarker3D({ business, onClick }: BusinessMarker3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const worldPos = latLngToWorld(business.latitude, business.longitude);

  // Floating animation
  useFrame((state: RootState) => {
    if (meshRef.current) {
      meshRef.current.position.y = 2 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  const color = business.visited
    ? '#22c55e' // Green for visited
    : business.isBoosted
    ? '#f59e0b' // Orange for boosted
    : '#06b6d4'; // Cyan for unvisited

  return (
    <group position={[worldPos.x, 0, worldPos.z]}>
      {/* Glow effect for boosted */}
      {business.isBoosted && (
        <mesh position={[0, 2, 0]}>
          <ringGeometry args={[0.8, 1.2, 32]} />
          <meshStandardMaterial
            color="#f59e0b"
            emissive="#f59e0b"
            emissiveIntensity={0.5}
            transparent
            opacity={0.3}
          />
        </mesh>
      )}

      {/* Main marker */}
      <mesh
        ref={meshRef}
        position={[0, 2, 0]}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.2 : 1}
      >
        <cylinderGeometry args={[0.3, 0.3, 0.5, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* Icon sphere */}
      <mesh position={[0, 2.4, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color="#4a5568"
          emissive="#4a5568"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Business name label */}
      {(hovered || business.isBoosted) && (
        <Text
          position={[0, 3.5, 0]}
          fontSize={0.3}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {business.name}
        </Text>
      )}

      {/* Visited checkmark */}
      {business.visited && (
        <mesh position={[0.5, 2.8, 0]}>
          <ringGeometry args={[0.15, 0.25, 16]} />
          <meshStandardMaterial
            color="#22c55e"
            emissive="#22c55e"
            emissiveIntensity={0.8}
          />
        </mesh>
      )}
    </group>
  );
}

