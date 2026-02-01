import type { Zone } from '../../types';

interface TerritoryPanelProps {
  zones: Zone[];
}

const NEIGHBORHOOD_BONUS_POINTS = 50;

export default function TerritoryPanel({ zones }: TerritoryPanelProps) {
  const zonesByNeighborhood = new Map<string, Zone[]>();
  zones.forEach(zone => {
    const name = zone.neighborhoodName || 'Unassigned';
    const existing = zonesByNeighborhood.get(name) || [];
    existing.push(zone);
    zonesByNeighborhood.set(name, existing);
  });
  const neighborhoodEntries = Array.from(zonesByNeighborhood.entries()).map(([name, group]) => {
    const total = group.length;
    const captured = group.filter(z => z.captured).length;
    const percentCaptured = total > 0 ? Math.round((captured / total) * 100) : 0;
    return {
      name,
      zones: group,
      total,
      captured,
      percentCaptured,
      fullyCaptured: total > 0 && captured >= total,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="absolute bottom-20 left-0 right-0 z-10">
      <div className="mx-4 glass rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span>🗺️</span> Territory Progress
          </h3>

          <div className="space-y-3">
            {neighborhoodEntries.map(neighborhood => {

              return (
                <div
                  key={neighborhood.name}
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
                    {neighborhood.zones.map(zone => (
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
                      <span>✨</span> +{NEIGHBORHOOD_BONUS_POINTS} bonus points earned!
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500">
                      Capture all zones for +{NEIGHBORHOOD_BONUS_POINTS} bonus points
                    </div>
                  )}
                </div>
              );
            })}

            {neighborhoodEntries.length === 0 && (
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
