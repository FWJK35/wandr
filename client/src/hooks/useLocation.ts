import { useState, useEffect, useCallback } from 'react';

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseLocationResult {
  location: Location | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export function useLocation(watchPosition = false): UseLocationResult {
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleSuccess = useCallback((position: GeolocationPosition) => {
    setLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    });
    setError(null);
    setLoading(false);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    let message = 'Unable to get location';
    switch (err.code) {
      case err.PERMISSION_DENIED:
        message = 'Location permission denied. Please enable location access.';
        break;
      case err.POSITION_UNAVAILABLE:
        message = 'Location information unavailable.';
        break;
      case err.TIMEOUT:
        message = 'Location request timed out.';
        break;
    }
    setError(message);
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  }, [handleSuccess, handleError]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000, // Cache for 1 minute
    });

    // Watch position if requested
    let watchId: number | null = null;
    if (watchPosition) {
      watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchPosition, handleSuccess, handleError]);

  return { location, error, loading, refresh };
}

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
