import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { latLngToWorld } from '../../utils/coordinates';

// Providence center and bounds
const PROVIDENCE_CENTER = { lat: 41.8268, lng: -71.4025 };
const PROVIDENCE_BOUNDS = {
  north: 41.85,
  south: 41.80,
  east: -71.38,
  west: -71.42,
};

interface GoogleMapsTextureProps {
  apiKey: string;
  mapType?: 'satellite' | 'hybrid' | 'roadmap';
}

export default function GoogleMapsTexture({ apiKey, mapType = 'hybrid' }: GoogleMapsTextureProps) {
  const [mainTexture, setMainTexture] = useState<THREE.Texture | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    async function loadMainMap() {
      if (!apiKey) {
        console.warn('Google Maps API key not provided');
        return;
      }

      try {
        // Use Static Maps API with proper bounds for better quality
        // Higher zoom for more detail (16 is good for city level)
        const zoom = 16;
        // Use 2048x2048 for high resolution (requires billing enabled)
        // Fall back to 640x640 for free tier
        const size = 2048;
        
        const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?` +
          `center=${PROVIDENCE_CENTER.lat},${PROVIDENCE_CENTER.lng}` +
          `&zoom=${zoom}` +
          `&size=${size}x${size}` +
          `&maptype=${mapType}` +
          `&format=png` +
          `&style=feature:poi|visibility:off` + // Hide POI labels for cleaner look
          `&style=feature:road|element:labels|visibility:simplified` + // Simplify road labels
          `&key=${apiKey}`;

        // Load using fetch to handle potential CORS
        const response = await fetch(staticMapUrl);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Google Maps API error:', errorText);
          throw new Error(`Failed to fetch map: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);

        const loader = new THREE.TextureLoader();
        const texture = await new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(
            imageUrl,
            (loadedTexture: THREE.Texture) => {
              loadedTexture.flipY = false;
              loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
              loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
              loadedTexture.generateMipmaps = true;
              loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
              loadedTexture.magFilter = THREE.LinearFilter;
              resolve(loadedTexture);
            },
            undefined,
            (error: unknown) => {
              console.error('Failed to load Google Maps texture:', error);
              reject(error);
            }
          );
        });

        URL.revokeObjectURL(imageUrl);
        setMainTexture(texture);
      } catch (error) {
        console.error('Error loading Google Maps texture:', error);
      }
    }

    loadMainMap();
  }, [apiKey, mapType]);

  const center = latLngToWorld(PROVIDENCE_CENTER.lat, PROVIDENCE_CENTER.lng);
  const northEast = latLngToWorld(PROVIDENCE_BOUNDS.north, PROVIDENCE_BOUNDS.east);
  const southWest = latLngToWorld(PROVIDENCE_BOUNDS.south, PROVIDENCE_BOUNDS.west);
  
  const mapWidth = Math.abs(northEast.x - southWest.x);
  const mapHeight = Math.abs(northEast.z - southWest.z);

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[center.x, 0, center.z]}
      receiveShadow
    >
      <planeGeometry args={[mapWidth, mapHeight]} />
      {mainTexture ? (
        <meshStandardMaterial 
          map={mainTexture}
          roughness={0.8}
          metalness={0.1}
        />
      ) : (
        <meshStandardMaterial color="#4a5568" />
      )}
    </mesh>
  );
}

