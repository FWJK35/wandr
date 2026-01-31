import { useCallback, useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { useLocation } from '../../hooks/useLocation';
import { businessesApi, zonesApi } from '../../services/api';
import type { Business, Zone } from '../../types';
import BusinessMarker from './BusinessMarker';
import UserMarker from './UserMarker';
import ZoneOverlay from './ZoneOverlay';
import BusinessPanel from './BusinessPanel';
import LoadingSpinner from '../shared/LoadingSpinner';

const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

// Dark game-style map styling
const mapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  {
    featureType: 'administrative.country',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#4b6878' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64779e' }],
  },
  {
    featureType: 'administrative.province',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#4b6878' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#334e87' }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#023e58' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#283d6a' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6f9ba5' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry.fill',
    stylers: [{ color: '#023e58' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3C7680' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#304a7d' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#98a5be' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2c6675' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#255763' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#b0d5ce' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#023e58' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#98a5be' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    featureType: 'transit.line',
    elementType: 'geometry.fill',
    stylers: [{ color: '#283d6a' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'geometry',
    stylers: [{ color: '#3a4762' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1626' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4e6d70' }],
  },
];

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: 41.8268,
  lng: -71.4025,
};

export default function GameMap() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const { location, error: locationError } = useLocation(true);
  const [, setMap] = useState<google.maps.Map | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<{ lat: number; lng: number } | null>(null);

  const center = location
    ? { lat: location.latitude, lng: location.longitude }
    : defaultCenter;

  const fetchData = useCallback(async (lat: number, lng: number) => {
    // Don't fetch if location hasn't changed significantly
    if (lastFetchRef.current) {
      const dist = Math.sqrt(
        Math.pow(lat - lastFetchRef.current.lat, 2) +
        Math.pow(lng - lastFetchRef.current.lng, 2)
      );
      if (dist < 0.001) return; // ~100m
    }

    lastFetchRef.current = { lat, lng };
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

  // Fetch data when location changes
  useEffect(() => {
    if (location) {
      fetchData(location.latitude, location.longitude);
    }
  }, [location, fetchData]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const handleMarkerClick = (business: Business) => {
    setSelectedBusiness(business);
  };

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center bg-dark-300">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load Google Maps</p>
          <p className="text-gray-500 text-sm">Please check your API key configuration</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-dark-300">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={16}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={{
          styles: mapStyles,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          },
          clickableIcons: false,
          gestureHandling: 'greedy',
        }}
      >
        {/* Zone overlays */}
        {zones.map((zone) => (
          <ZoneOverlay key={zone.id} zone={zone} />
        ))}

        {/* Business markers */}
        {businesses.map((business) => (
          <BusinessMarker
            key={business.id}
            business={business}
            onClick={() => handleMarkerClick(business)}
          />
        ))}

        {/* User marker */}
        {location && (
          <UserMarker
            position={{ lat: location.latitude, lng: location.longitude }}
          />
        )}
      </GoogleMap>

      {/* Top bar with stats */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
        <div className="glass rounded-xl px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-400">Nearby:</span>
              <span className="ml-1 text-white font-semibold">{businesses.length}</span>
            </div>
            <div>
              <span className="text-gray-400">Zones:</span>
              <span className="ml-1 text-white font-semibold">{zones.length}</span>
            </div>
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
