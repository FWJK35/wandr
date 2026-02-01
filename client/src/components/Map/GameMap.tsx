import { useCallback, useState, useEffect, useRef } from 'react';
import Map, { NavigationControl, GeolocateControl } from 'react-map-gl';
import type { MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLocation } from '../../hooks/useLocation';
import { businessesApi, zonesApi } from '../../services/api';
import type { Business, Zone, Neighborhood } from '../../types';
import BusinessMarker from './BusinessMarker';
import UserMarker from './UserMarker';
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
  const { location, error: locationError } = useLocation(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('explore');
  const lastFetchRef = useRef<{ lat: number; lng: number } | null>(null);

  const [viewState, setViewState] = useState({
    latitude: defaultCenter.lat,
    longitude: defaultCenter.lng,
    zoom: 16,
    pitch: 45,
    bearing: 0,
  });

  // Update view when user location changes
  useEffect(() => {
    if (location && !lastFetchRef.current) {
      setViewState(prev => ({
        ...prev,
        latitude: location.latitude,
        longitude: location.longitude,
      }));
    }
  }, [location]);

  const fetchData = useCallback(async (lat: number, lng: number) => {
    if (lastFetchRef.current) {
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

  const handleMarkerClick = (business: Business) => {
    setSelectedBusiness(business);
  };

  const toggleMode = () => {
    setMapMode(prev => prev === 'explore' ? 'territory' : 'explore');
    setSelectedBusiness(null);
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
        onMove={(evt) => setViewState(evt.viewState)}
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

        {/* User marker always visible */}
        {location && (
          <UserMarker
            position={{ lat: location.latitude, lng: location.longitude }}
          />
        )}
      </Map>

      {/* Mode toggle button */}
      <div className="absolute top-4 left-4 z-10">
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
      </div>

      {/* Stats bar */}
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
