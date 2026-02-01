import { Marker } from 'react-map-gl';
import type { Landmark } from '../../types';

interface LandmarkMarkerProps {
  landmark: Landmark;
  onClick: () => void;
  highlight?: boolean;
}

export default function LandmarkMarker({ landmark, onClick, highlight }: LandmarkMarkerProps) {
  const visited = landmark.visited;
  return (
    <Marker
      longitude={landmark.longitude}
      latitude={landmark.latitude}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onClick();
      }}
    >
      <div
        className={`
          relative cursor-pointer group
          transition-transform hover:scale-110
        `}
      >
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center
            border-2 shadow-lg
            ${visited ? 'bg-primary-500 border-primary-400' : 'bg-dark-100 border-white/20'}
            ${highlight ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-black/40' : ''}
          `}
        >
          <span className="text-lg">📍</span>
        </div>

        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          <div className="bg-dark-100 px-2 py-1 rounded text-xs text-white border border-white/10">
            {landmark.name}
          </div>
        </div>
      </div>
    </Marker>
  );
}
