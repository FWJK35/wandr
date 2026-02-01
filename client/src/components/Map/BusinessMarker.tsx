import { Marker } from 'react-map-gl';
import type { Business } from '../../types';

interface BusinessMarkerProps {
  business: Business;
  onClick: () => void;
  highlight?: boolean;
}

// Category to emoji mapping
const categoryIcons: Record<string, string> = {
  Cafe: '☕',
  Restaurant: '🍽️',
  Bar: '🍺',
  Shop: '🛍️',
  Museum: '🏛️',
  Gym: '💪',
  Entertainment: '🎮',
  Park: '🌳',
  default: '🏢',
};

export default function BusinessMarker({ business, onClick, highlight }: BusinessMarkerProps) {
  const icon = categoryIcons[business.category] || categoryIcons.default;

  return (
    <Marker
      longitude={business.longitude}
      latitude={business.latitude}
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
          ${business.isBoosted ? 'animate-pulse-slow' : ''}
        `}
      >
        {/* Outer glow for boosted businesses */}
        {business.isBoosted && (
          <div
            className="absolute inset-0 rounded-full bg-yellow-400/30 animate-ping"
            style={{ width: '48px', height: '48px', marginLeft: '-4px', marginTop: '-4px' }}
          />
        )}

        {/* Main marker */}
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center
            border-2 shadow-lg
            ${business.visited
              ? 'bg-primary-500 border-primary-400'
              : 'bg-dark-100 border-white/20'
            }
            ${business.isBoosted ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-dark-300' : ''}
            ${highlight ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-black/40' : ''}
          `}
        >
          <span className="text-lg">{icon}</span>
        </div>

        {/* Visited checkmark */}
        {business.visited && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary-400 rounded-full flex items-center justify-center">
            <span className="text-xs">✓</span>
          </div>
        )}

        {/* Name tooltip */}
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          <div className="bg-dark-100 px-2 py-1 rounded text-xs text-white border border-white/10">
            {business.name}
          </div>
        </div>
      </div>
    </Marker>
  );
}
