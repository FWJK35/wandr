import { useCallback, useState, useEffect, useRef } from 'react';
import Map, { NavigationControl, GeolocateControl } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLocation } from '../../hooks/useLocation';
import { businessesApi, zonesApi } from '../../services/api';
import type { Business, Zone, Neighborhood } from '../../types';
import BusinessMarker from './BusinessMarker';
import UserMarker from './UserMarker';
import { Marker } from 'react-map-gl';
import ZoneOverlay from './ZoneOverlay';
import NeighborhoodOverlay from './NeighborhoodOverlay';
import BusinessPanel from './BusinessPanel';
import TerritoryPanel from './TerritoryPanel';
import LoadingSpinner from '../shared/LoadingSpinner';

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || '';

const defaultCenter = {
  lat: 41.8268,
  lng: -71.4025,
};

type MapMode = 'explore' | 'territory';

export default function GameMap() {
  const mapRef = useRef<MapRef>(null);
  const {
    location,
    error: locationError,
    spoofed,
    setSpoofLocation,
    clearSpoofLocation,
    refresh,
  } = useLocation(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('explore');
  const lastFetchRef = useRef<{ lat: number; lng: number } | null>(null);

  // Local static "pokestop" style businesses
  const staticBusinesses = [
    { id: 'sb-1', name: 'Bolt Coffee', icon: '☕', lat: 41.8240, lng: -71.4120, hasQuest: true },
    { id: 'sb-2', name: 'Plant City', icon: '🥗', lat: 41.8233, lng: -71.4016, hasQuest: false },
    { id: 'sb-3', name: 'PVDonuts', icon: '🍩', lat: 41.8186, lng: -71.4128, hasQuest: true },
    { id: 'sb-4', name: 'Tallulah’s Taqueria', icon: '🌮', lat: 41.8099, lng: -71.4089, hasQuest: false },
    { id: 'sb-5', name: 'New Harvest Coffee', icon: '🫘', lat: 41.8092, lng: -71.4054, hasQuest: false },
    // Thayer Street
    { id: 'sb-6', name: 'East Side Pockets', icon: '🥙', lat: 41.8290, lng: -71.4013, hasQuest: true },
    { id: 'sb-7', name: 'Antonio’s Pizza', icon: '🍕', lat: 41.8292, lng: -71.4016, hasQuest: false },
    { id: 'sb-8', name: 'Kabob and Curry', icon: '🍛', lat: 41.8285, lng: -71.4015, hasQuest: true },
    { id: 'sb-9', name: 'Spectrum India', icon: '🛍️', lat: 41.8293, lng: -71.4019, hasQuest: false },
    // Wickenden Street
    { id: 'sb-10', name: 'Coffee Exchange', icon: '☕', lat: 41.8186, lng: -71.3984, hasQuest: false },
    { id: 'sb-11', name: 'Fellini Pizzeria', icon: '🍕', lat: 41.8192, lng: -71.3979, hasQuest: true },
    { id: 'sb-12', name: 'Shoppe Pioneer', icon: '🛒', lat: 41.8189, lng: -71.3989, hasQuest: false },
    { id: 'sb-13', name: 'The Duck & Bunny', icon: '🧁', lat: 41.8181, lng: -71.3996, hasQuest: false },
    { id: 'sb-14', name: 'Café Zog', icon: '☕', lat: 41.8184, lng: -71.3991, hasQuest: false },
    { id: 'sb-15', name: 'The Shop', icon: '🧋', lat: 41.8188, lng: -71.3999, hasQuest: false },
    { id: 'sb-16', name: 'The Point Tavern', icon: '🍺', lat: 41.8194, lng: -71.3994, hasQuest: false },
    { id: 'sb-17', name: 'Pleasantry', icon: '🛍️', lat: 41.8182, lng: -71.3987, hasQuest: false },
  ];
  const [spoofOpen, setSpoofOpen] = useState(false);
  const [spoofLat, setSpoofLat] = useState('');
  const [spoofLng, setSpoofLng] = useState('');
  const [spoofError, setSpoofError] = useState<string | null>(null);

  const [viewState, setViewState] = useState({
    latitude: defaultCenter.lat,
    longitude: defaultCenter.lng,
    zoom: 18.3,
    pitch: 60,
    bearing: 0,
  });

  // Update view when user location changes (always center on player)
  useEffect(() => {
    if (location) {
      setViewState(prev => ({
        ...prev,
        latitude: location.latitude,
        longitude: location.longitude,
        // keep bearing/pitch/zoom untouched so user camera stays consistent
      }));
    }
  }, [location]);

  useEffect(() => {
    if (location && !spoofLat && !spoofLng) {
      setSpoofLat(location.latitude.toFixed(6));
      setSpoofLng(location.longitude.toFixed(6));
    }
  }, [location, spoofLat, spoofLng]);

  const fetchData = useCallback(async (lat: number, lng: number, force = false) => {
    if (!force && lastFetchRef.current) {
      const dist = Math.sqrt(
        Math.pow(lat - lastFetchRef.current.lat, 2) +
        Math.pow(lng - lastFetchRef.current.lng, 2)
      );
      if (dist < 0.001) return;
    }

    lastFetchRef.current = { lat, lng };
    setLoading(true);

    try {
      const [businessData, zoneData, neighborhoodData] = await Promise.all([
        businessesApi.getNearby(lat, lng, 2000),
        zonesApi.getInViewport({
          minLat: lat - 0.02,
          maxLat: lat + 0.02,
          minLng: lng - 0.02,
          maxLng: lng + 0.02,
        }),
        zonesApi.getNeighborhoods(),
      ]);

      setBusinesses(businessData);
      setZones(zoneData);
      setNeighborhoods(neighborhoodData);
    } catch (err) {
      console.error('Failed to fetch map data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location) {
      fetchData(location.latitude, location.longitude);
    }
  }, [location, fetchData]);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current?.getMap();
    if (map) {
      const layers = map.getStyle()?.layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#1a1f2e',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.5,
              ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.5,
              ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': 0.8,
          },
        },
        labelLayerId
      );
    }
  }, []);

  // No custom 3D player layer; use DOM marker so it renders above map tiles/buildings

  const handleMarkerClick = (business: Business) => {
    setSelectedBusiness(business);
  };

  const toggleMode = () => {
    setMapMode(prev => prev === 'explore' ? 'territory' : 'explore');
    setSelectedBusiness(null);
  };

  const applySpoof = useCallback((lat: number, lng: number) => {
    setSpoofLocation({ latitude: lat, longitude: lng, accuracy: 5 });
    lastFetchRef.current = null;
    setViewState(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
    }));
    fetchData(lat, lng, true);
  }, [fetchData, setSpoofLocation]);

  const handleApplySpoof = () => {
    const lat = parseFloat(spoofLat);
    const lng = parseFloat(spoofLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setSpoofError('Enter valid latitude/longitude values');
      return;
    }
    setSpoofError(null);
    applySpoof(lat, lng);
  };

  const handleUseMapCenter = () => {
    const center = mapRef.current?.getMap()?.getCenter();
    if (!center) return;
    const lat = Number(center.lat.toFixed(6));
    const lng = Number(center.lng.toFixed(6));
    setSpoofLat(lat.toFixed(6));
    setSpoofLng(lng.toFixed(6));
    setSpoofError(null);
  };

  const handleClearSpoof = () => {
    clearSpoofLocation();
    setSpoofError(null);
    lastFetchRef.current = null;
    refresh();
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full flex items-center justify-center bg-dark-300">
        <div className="text-center">
          <p className="text-red-400 mb-2">Mapbox token not configured</p>
          <p className="text-gray-500 text-sm">Please add VITE_MAPBOX_TOKEN to your .env file</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <Map
        ref={mapRef}
        {...viewState}
        dragPan={false} // disable left-click panning; keep right-drag rotation
        dragRotate
        pitchWithRotate
        maxPitch={85}
        onMove={(evt) => {
          const lat = location?.latitude ?? defaultCenter.lat;
          const lng = location?.longitude ?? defaultCenter.lng;
          setViewState(prev => ({
            ...prev,
            bearing: evt.viewState.bearing,
            pitch: evt.viewState.pitch,
            zoom: evt.viewState.zoom,
            latitude: lat,
            longitude: lng,
          }));
        }}
        onLoad={handleMapLoad}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
        antialias={true}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl
          position="top-right"
          trackUserLocation
          showUserHeading
        />

        {/* Territory mode: Show neighborhoods and zones */}
        {mapLoaded && mapMode === 'territory' && (
          <>
            {neighborhoods.map((neighborhood) => (
              <NeighborhoodOverlay key={neighborhood.id} neighborhood={neighborhood} />
            ))}
            {zones.map((zone) => (
              <ZoneOverlay key={zone.id} zone={zone} />
            ))}
          </>
        )}

        {/* Explore mode: Show business markers */}
        {mapMode === 'explore' && businesses.map((business) => (
          <BusinessMarker
            key={business.id}
            business={business}
            onClick={() => handleMarkerClick(business)}
          />
        ))}

        {/* Static local small businesses (Pokéstop-style) */}
        {mapMode === 'explore' && staticBusinesses.map((spot) => (
          <Marker
            key={spot.id}
            longitude={spot.lng}
            latitude={spot.lat}
            anchor="center"
          >
            <div className="group relative -mt-4 flex flex-col items-center">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-lg border
                  ${spot.hasQuest
                    ? 'bg-gradient-to-br from-amber-300 via-amber-200 to-amber-100 border-amber-400 ring-2 ring-amber-300/70'
                    : 'bg-white border-gray-200'}
                `}
              >
                {spot.icon}
              </div>
              <div className="pointer-events-none absolute top-12 z-10 hidden group-hover:flex">
                <div className="px-2 py-1 rounded-full text-xs font-semibold bg-black/80 text-white shadow-lg whitespace-nowrap">
                  {spot.name}
                </div>
              </div>
            </div>
          </Marker>
        ))}

        {/* User marker always visible; DOM overlay keeps it above tiles/buildings */}
        {location && (
          <UserMarker
            position={{ lat: location.latitude, lng: location.longitude }}
          />
        )}

      </Map>

            {/* Mode toggle + testing tools */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={toggleMode}
          className={`
            px-4 py-2 rounded-xl font-medium text-sm transition-all
            ${mapMode === 'explore'
              ? 'bg-primary-500 text-white'
              : 'bg-emerald-500 text-white'
            }
            shadow-lg hover:scale-105
          `}
        >
          {mapMode === 'explore' ? (
            <span className="flex items-center gap-2">
              <span>🧭</span> Explore Mode
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span>🗺️</span> Territory Mode
            </span>
          )}
        </button>

        <button
          onClick={() => setSpoofOpen(prev => !prev)}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all shadow-lg hover:scale-105 ${
            spoofed ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-200'
          }`}
        >
          {spoofed ? 'Spoofing Location' : 'Test Location'}
        </button>

        {spoofOpen && (
          <div className="glass rounded-xl p-3 w-64 text-xs text-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-400">Manual Location</span>
              {spoofed && <span className="text-emerald-400 text-[11px]">Active</span>}
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-gray-400 mb-1">Latitude</label>
                <input
                  value={spoofLat}
                  onChange={(e) => setSpoofLat(e.target.value)}
                  className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm text-white"
                  placeholder="41.826800"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Longitude</label>
                <input
                  value={spoofLng}
                  onChange={(e) => setSpoofLng(e.target.value)}
                  className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm text-white"
                  placeholder="-71.402500"
                />
              </div>
              {spoofError && (
                <div className="text-red-400 text-[11px]">{spoofError}</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleUseMapCenter}
                  className="flex-1 rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-[11px]"
                >
                  Use Map Center
                </button>
                <button
                  onClick={handleApplySpoof}
                  className="flex-1 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 px-2 py-1 text-[11px] text-white"
                >
                  Apply
                </button>
              </div>
              <button
                onClick={handleClearSpoof}
                className="w-full rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-[11px]"
              >
                Clear Spoof
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats bar + controls hint */}
      <div className="absolute top-4 left-44 right-16 flex justify-between items-start pointer-events-none">
        <div className="glass rounded-xl px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-4 text-sm">
            {mapMode === 'explore' ? (
              <>
                <div>
                  <span className="text-gray-400">Nearby:</span>
                  <span className="ml-1 text-white font-semibold">{businesses.length}</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-gray-400">Zones:</span>
                  <span className="ml-1 text-white font-semibold">
                    {zones.filter(z => z.captured).length}/{zones.length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Neighborhoods:</span>
                  <span className="ml-1 text-white font-semibold">
                    {neighborhoods.filter(n => n.fullyCaptured).length}/{neighborhoods.length}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {loading && (
          <div className="glass rounded-xl px-3 py-2 pointer-events-auto">
            <LoadingSpinner size="sm" />
          </div>
        )}
      </div>

      {/* Camera control hint */}
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="glass rounded-xl px-3 py-2 text-xs text-gray-300 pointer-events-auto">
          <div className="flex items-center gap-2">
            <span>🖱️</span>
            <span>Rotate with right-drag/Ctrl+drag • Scroll to zoom • Center locked on you</span>
          </div>
        </div>
      </div>

      {/* Location error */}
      {locationError && (
        <div className="absolute bottom-24 left-4 right-4">
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {locationError}
          </div>
        </div>
      )}

      {/* Business detail panel (explore mode) */}
      {mapMode === 'explore' && selectedBusiness && (
        <BusinessPanel
          business={selectedBusiness}
          userLocation={location}
          onCheckInComplete={() => {
            if (location) {
              fetchData(location.latitude, location.longitude, true);
            }
          }}
          onClose={() => setSelectedBusiness(null)}
        />
      )}

      {/* Territory panel (territory mode) */}
      {mapMode === 'territory' && (
        <TerritoryPanel
          zones={zones}
          neighborhoods={neighborhoods}
        />
      )}
    </div>
  );
}
