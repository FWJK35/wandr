import type { Zone, Neighborhood } from '../../types';

interface TerritoryPanelProps {
  zones: Zone[];
  neighborhoods: Neighborhood[];
}

export default function TerritoryPanel({ zones, neighborhoods }: TerritoryPanelProps) {
  // Group zones by neighborhood
  const zonesByNeighborhood = new Map<string, Zone[]>();
  zones.forEach(zone => {
    if (zone.neighborhoodName) {
      const existing = zonesByNeighborhood.get(zone.neighborhoodName) || [];
      existing.push(zone);
      zonesByNeighborhood.set(zone.neighborhoodName, existing);
    }
  });

  return (
    <div className="absolute bottom-20 left-0 right-0 z-10">
      <div className="mx-4 glass rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span>🗺️</span> Territory Progress
          </h3>

          <div className="space-y-3">
            {neighborhoods.map(neighborhood => {
              const neighborhoodZones = zonesByNeighborhood.get(neighborhood.name) || [];

              return (
                <div
                  key={neighborhood.id}
                  className={`
                    p-3 rounded-xl border transition-all
                    ${neighborhood.fullyCaptured
                      ? 'bg-green-500/20 border-green-500/40'
                      : neighborhood.percentCaptured > 0
                      ? 'bg-yellow-500/10 border-yellow-500/30'
                      : 'bg-gray-500/10 border-gray-500/30'
                    }
                  `}
                >
                  {/* Neighborhood header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {neighborhood.fullyCaptured ? '🏆' : neighborhood.percentCaptured > 0 ? '🔓' : '🔒'}
                      </span>
                      <span className="font-medium text-white">{neighborhood.name}</span>
                    </div>
                    <span className={`
                      text-sm font-semibold
                      ${neighborhood.fullyCaptured
                        ? 'text-green-400'
                        : neighborhood.percentCaptured > 0
                        ? 'text-yellow-400'
                        : 'text-gray-400'
                      }
                    `}>
                      {neighborhood.percentCaptured}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-700/50 rounded-full h-2 mb-2">
                    <div
                      className={`
                        h-2 rounded-full transition-all duration-500
                        ${neighborhood.fullyCaptured
                          ? 'bg-green-500'
                          : neighborhood.percentCaptured > 0
                          ? 'bg-yellow-500'
                          : 'bg-gray-600'
                        }
                      `}
                      style={{ width: `${neighborhood.percentCaptured}%` }}
                    />
                  </div>

                  {/* Zone chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {neighborhoodZones.map(zone => (
                      <span
                        key={zone.id}
                        className={`
                          px-2 py-0.5 rounded-full text-xs font-medium
                          ${zone.captured
                            ? 'bg-green-500/30 text-green-300'
                            : 'bg-gray-600/30 text-gray-400'
                          }
                        `}
                      >
                        {zone.captured ? '✓ ' : ''}{zone.name.replace(`${neighborhood.name} - `, '')}
                      </span>
                    ))}
                  </div>

                  {/* Bonus points indicator */}
                  {neighborhood.fullyCaptured ? (
                    <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
                      <span>✨</span> +{neighborhood.bonusPoints} bonus points earned!
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500">
                      Capture all zones for +{neighborhood.bonusPoints} bonus points
                    </div>
                  )}
                </div>
              );
            })}

            {neighborhoods.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                No neighborhoods found in this area
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
