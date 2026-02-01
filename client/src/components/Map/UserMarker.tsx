import { Marker } from 'react-map-gl';

interface UserMarkerProps {
  position: { lat: number; lng: number };
}

export default function UserMarker({ position }: UserMarkerProps) {
  return (
    <Marker
      longitude={position.lng}
      latitude={position.lat}
      anchor="center"
    >
      <div className="relative">
        {/* Accuracy circle / pulse */}
        <div className="absolute inset-0 w-16 h-16 -ml-4 -mt-4">
          <div className="absolute inset-0 bg-primary-500/20 rounded-full animate-ping" />
          <div className="absolute inset-2 bg-primary-500/30 rounded-full animate-pulse" />
        </div>

        {/* User dot */}
        <div className="relative w-8 h-8 rounded-full bg-primary-500 border-4 border-white shadow-lg flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>
      </div>
    </Marker>
  );
}
