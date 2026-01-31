import { OverlayView } from '@react-google-maps/api';
import type { Business } from '../../types';

interface BusinessMarkerProps {
  business: Business;
  onClick: () => void;
}

// Category to emoji mapping
const categoryIcons: Record<string, string> = {
  'Cafe': '☕',
  'Restaurant': '🍽️',
  'Bar': '🍺',
  'Shop': '🛍️',
  'Museum': '🏛️',
  'Gym': '💪',
  'Entertainment': '🎮',
  'Park': '🌳',
  'default': '📍',
};

export default function BusinessMarker({ business, onClick }: BusinessMarkerProps) {
  const icon = categoryIcons[business.category] || categoryIcons.default;

  return (
    <OverlayView
      position={{ lat: business.latitude, lng: business.longitude }}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        className={`
          relative cursor-pointer transform -translate-x-1/2 -translate-y-1/2
          transition-transform hover:scale-110
          ${business.isBoosted ? 'animate-pulse-slow' : ''}
        `}
        onClick={onClick}
      >
        {/* Outer glow for boosted businesses */}
        {business.isBoosted && (
          <div className="absolute inset-0 rounded-full bg-yellow-400/30 animate-ping" style={{ width: '48px', height: '48px', marginLeft: '-8px', marginTop: '-8px' }} />
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

        {/* Name tooltip on hover */}
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-dark-100 px-2 py-1 rounded text-xs text-white border border-white/10">
            {business.name}
          </div>
        </div>
      </div>
    </OverlayView>
  );
}
