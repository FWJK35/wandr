import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useLocation } from '../../hooks/useLocation';
import { businessesApi, zonesApi } from '../../services/api';
import type { Business, Zone } from '../../types';
import { latLngToWorld } from '../../utils/coordinates';
import CityModel from './CityModel';
import GoogleMapsTexture from './GoogleMapsTexture';
import BusinessMarker3D from './BusinessMarker3D';
import ZoneOverlay3D from './ZoneOverlay3D';
import Player3D from './Player3D';
import BusinessPanel from './BusinessPanel';
import LoadingSpinner from '../shared/LoadingSpinner';

// Providence center
const PROVIDENCE_CENTER = { lat: 41.8268, lng: -71.4025 };
const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

// Camera controls component that behaves like a third-person "chase" cam
function CameraControls({
  targetPosition,
  controlsRef
}: {
  targetPosition: [number, number, number];
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const previousTarget = useRef<THREE.Vector3 | null>(null);

  // Follow the player while preserving the current orbit offset so dragging feels natural.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const nextTarget = new THREE.Vector3(targetPosition[0], targetPosition[1] + 2, targetPosition[2]);

    // Keep whatever offset the player currently sees (over-the-shoulder) when the target moves.
    const currentOffset = previousTarget.current
      ? controls.object.position.clone().sub(previousTarget.current)
      : new THREE.Vector3(-12, 10, -14);

    controls.target.copy(nextTarget);
    controls.object.position.copy(nextTarget.clone().add(currentOffset));
    controls.update();

    previousTarget.current = nextTarget;
  }, [targetPosition, controlsRef]);

  // Initialize the camera once so it starts behind and above the avatar.
  useEffect(() => {
    camera.position.set(
      targetPosition[0] - 12,
      targetPosition[1] + 10,
      targetPosition[2] - 14
    );
    camera.lookAt(targetPosition[0], targetPosition[1] + 2, targetPosition[2]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PerspectiveCamera makeDefault fov={65} near={0.1} far={1000} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={50}
        minPolarAngle={0.25 * Math.PI / 1} // ~45° down toward the ground
        maxPolarAngle={1.35}
        autoRotate={false}
        rotateSpeed={0.7}
        zoomSpeed={0.9}
        target={[targetPosition[0], targetPosition[1] + 2, targetPosition[2]]}
      />
    </>
  );
}

export default function GameMap3D() {
  const { location, error: locationError } = useLocation(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(false);
  const [playerPosition, setPlayerPosition] = useState<[number, number, number]>([0, 0, 0]);
  const controlsRef = useRef<any>(null);

  // Convert location to 3D world position
  useEffect(() => {
    if (location) {
      const worldPos = latLngToWorld(location.latitude, location.longitude);
      setPlayerPosition([worldPos.x, 0, worldPos.z]);
    } else {
      // Default to Providence center
      const worldPos = latLngToWorld(PROVIDENCE_CENTER.lat, PROVIDENCE_CENTER.lng);
      setPlayerPosition([worldPos.x, 0, worldPos.z]);
    }
  }, [location]);

  // Fetch businesses and zones
  const fetchData = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const [businessData, zoneData] = await Promise.all([
        businessesApi.getNearby(lat, lng, 2000),
        zonesApi.getInViewport({
          minLat: lat - 0.02,
          maxLat: lat + 0.02,
          minLng: lng - 0.02,
          maxLng: lng + 0.02,
        }),
      ]);
      setBusinesses(businessData);
      setZones(zoneData);
    } catch (err) {
      console.error('Failed to fetch map data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location) {
      fetchData(location.latitude, location.longitude);
    } else {
      fetchData(PROVIDENCE_CENTER.lat, PROVIDENCE_CENTER.lng);
    }
  }, [location, fetchData]);

  const handleMarkerClick = (business: Business) => {
    setSelectedBusiness(business);
  };

  const resetCamera = () => {
    if (controlsRef.current) {
      const worldPos = latLngToWorld(
        location?.latitude || PROVIDENCE_CENTER.lat,
        location?.longitude || PROVIDENCE_CENTER.lng
      );
      controlsRef.current.target.set(worldPos.x, 2, worldPos.z);
      controlsRef.current.object.position.set(
        worldPos.x - 20,
        15,
        worldPos.z - 20
      );
      controlsRef.current.update();
    }
  };

  return (
    <div className="relative h-full w-full bg-slate-900">
      <Canvas shadows>
        <Suspense fallback={null}>
          {/* Lighting - Much brighter */}
          <ambientLight intensity={1.2} />
          <directionalLight
            position={[50, 100, 50]}
            intensity={2.5}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0001}
          />
          <directionalLight
            position={[-50, 50, -50]}
            intensity={1.0}
          />
          <pointLight position={[0, 50, 0]} intensity={1.5} />
          <pointLight position={[-50, 30, -50]} intensity={0.8} />

          {/* Interactive camera controls */}
          <CameraControls targetPosition={playerPosition} controlsRef={controlsRef} />

          {/* Google Maps realistic map texture */}
          {GOOGLE_MAPS_API_KEY && (
            <GoogleMapsTexture apiKey={GOOGLE_MAPS_API_KEY} mapType="hybrid" />
          )}

          {/* Fallback ground plane if no API key */}
          {!GOOGLE_MAPS_API_KEY && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
              <planeGeometry args={[200, 200]} />
              <meshStandardMaterial color="#4a5568" />
            </mesh>
          )}

          {/* Simplified city model (only shown if no Google Maps) */}
          {!GOOGLE_MAPS_API_KEY && <CityModel />}

          {/* Zones */}
          {zones.map((zone) => (
            <ZoneOverlay3D key={zone.id} zone={zone} />
          ))}

          {/* Business markers */}
          {businesses.map((business) => (
            <BusinessMarker3D
              key={business.id}
              business={business}
              onClick={() => handleMarkerClick(business)}
            />
          ))}

          {/* Player */}
          <Player3D position={playerPosition} />
        </Suspense>
      </Canvas>

      {/* UI Overlay - Top Stats */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
        <div className="glass rounded-2xl px-5 py-3 pointer-events-auto shadow-2xl backdrop-blur-xl bg-gradient-to-br from-dark-100/95 to-dark-200/95 border border-primary-500/20">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-500/30 flex items-center justify-center border border-primary-500/40">
                <span className="text-primary-300 text-lg">🏬</span>
              </div>
              <div>
                <div className="text-xs text-primary-300/70 uppercase tracking-wide font-medium">Nearby</div>
                <div className="text-lg font-bold text-white">{businesses.length}</div>
              </div>
            </div>
            <div className="h-8 w-px bg-primary-500/20" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-500/30 flex items-center justify-center border border-accent-500/40">
                <span className="text-accent-300 text-lg">🏆</span>
              </div>
              <div>
                <div className="text-xs text-accent-300/70 uppercase tracking-wide font-medium">Zones</div>
                <div className="text-lg font-bold text-white">{zones.length}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          {loading && (
            <div className="glass rounded-2xl px-4 py-3 shadow-2xl backdrop-blur-xl bg-gradient-to-br from-dark-100/95 to-dark-200/95 border border-white/20">
              <LoadingSpinner size="sm" />
            </div>
          )}
          <button
            onClick={resetCamera}
            className="glass rounded-2xl px-4 py-3 text-sm font-medium text-white hover:bg-primary-500/10 transition-all duration-200 shadow-2xl backdrop-blur-xl bg-gradient-to-br from-dark-100/95 to-dark-200/95 border border-primary-500/20 hover:border-primary-500/40 hover:scale-105 active:scale-95"
            title="Reset camera view"
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">🎥</span>
              <span>Reset</span>
            </span>
          </button>
        </div>
      </div>

      {/* Camera controls hint */}
      <div className="absolute bottom-4 left-4 pointer-events-none z-10">
        <div className="glass rounded-2xl px-4 py-3 pointer-events-auto shadow-2xl backdrop-blur-xl bg-gradient-to-br from-dark-100/95 to-dark-200/95 border border-primary-500/20">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-white">
              <span className="text-lg">🖱️</span>
              <span className="font-medium">Click & drag to orbit 360°</span>
              <span className="text-gray-500">•</span>
              <span className="font-medium">Scroll to zoom</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>📱</span>
              <span>Pinch to zoom • Drag with one finger to orbit</span>
            </div>
          </div>
        </div>
      </div>

      {/* Location error */}
      {locationError && (
        <div className="absolute bottom-24 left-4 right-4 pointer-events-none z-10">
          <div className="glass rounded-2xl px-5 py-4 text-sm text-red-300 pointer-events-auto shadow-2xl backdrop-blur-xl bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/40">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <span className="font-medium">{locationError}</span>
            </div>
          </div>
        </div>
      )}

      {/* Business detail panel */}
      {selectedBusiness && (
        <BusinessPanel
          business={selectedBusiness}
          userLocation={location}
          onClose={() => setSelectedBusiness(null)}
        />
      )}
    </div>
  );
}
