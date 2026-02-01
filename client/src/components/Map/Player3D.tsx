import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Player3DProps {
  position: [number, number, number];
}

export default function Player3D({ position }: Player3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Subtle idle animation
  useFrame((state) => {
    if (groupRef.current) {
      // Slight bobbing motion
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Player character - simple avatar */}
      <mesh castShadow>
      {/* Body */}
      <cylinderGeometry args={[0.4, 0.4, 1.2, 8]} />
        <meshStandardMaterial
          color="#06b6d4"
          emissive="#06b6d4"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial
          color="#fcd34d"
          emissive="#fcd34d"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Glow effect */}
      <mesh position={[0, 0, 0]}>
        <ringGeometry args={[0.6, 1, 32]} />
        <meshStandardMaterial
          color="#06b6d4"
          emissive="#06b6d4"
          emissiveIntensity={0.8}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Direction indicator (arrow) */}
      <mesh position={[0, 0.5, 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.2, 0.4, 8]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#22d3ee"
          emissiveIntensity={0.6}
        />
      </mesh>
    </group>
  );
}

