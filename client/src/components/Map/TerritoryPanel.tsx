import { useState } from 'react';
import type { Zone } from '../../types';

interface TerritoryPanelProps {
  zones: Zone[];
}

export default function TerritoryPanel({ zones }: TerritoryPanelProps) {
  const [expanded, setExpanded] = useState(false);
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
  const totalZones = zones.length;
  const capturedZones = zones.filter(z => z.captured).length;
  const totalNeighborhoods = neighborhoodEntries.length;
  const capturedNeighborhoods = neighborhoodEntries.filter(n => n.fullyCaptured).length;

  return (
    <div className="absolute bottom-20 left-0 right-0 z-10">
      <div className="mx-4 glass rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span>🗺️</span>
            <div>
              <div className="font-semibold text-white">Territory Progress</div>
              <div className="text-xs text-gray-400">
                Zones {capturedZones}/{totalZones} • Neighborhoods {capturedNeighborhoods}/{totalNeighborhoods}
              </div>
            </div>
          </div>
          <span className="text-gray-300 text-lg">
            {expanded ? '▾' : '▴'}
          </span>
        </button>

        <div
          className={`transition-[max-height,opacity] duration-300 ease-out ${
            expanded ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="px-4 pb-4 space-y-3 overflow-y-auto max-h-[55vh]">
            {neighborhoodEntries.map(neighborhood => (
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

              </div>
            ))}

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
