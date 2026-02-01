import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl';
import type { FillLayer, LineLayer, MapRef } from 'react-map-gl';
import { useLocation } from '../../hooks/useLocation';
import { businessesApi, zonesApi } from '../../services/api';
import type { Business, Neighborhood, Zone } from '../../types';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || '';

const defaultCenter = {
  lat: 41.8268,
  lng: -71.4025,
};

type EditorMode = 'business' | 'zone' | 'neighborhood';

type EditableZone = {
  id: string;
  name: string;
  neighborhoodId?: string;
  neighborhoodName?: string;
  coords: [number, number][];
  captured: boolean;
};

type EditableNeighborhood = {
  id: string;
  name: string;
  coords: [number, number][];
  fullyCaptured: boolean;
  percentCaptured: number;
};

const isSamePoint = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;

const uniqueCoords = (coords: [number, number][]) => {
  if (coords.length > 1 && isSamePoint(coords[0], coords[coords.length - 1])) {
    return coords.slice(0, -1);
  }
  return coords;
};

const closePolygon = (coords: [number, number][]) => {
  if (coords.length === 0) return coords;
  const unique = uniqueCoords(coords);
  return [...unique, unique[0]];
};

const updateVertex = (coords: [number, number][], index: number, lng: number, lat: number) => {
  const unique = uniqueCoords(coords);
  const next = unique.map((point, i) => (i === index ? [lng, lat] : point)) as [number, number][];
  return closePolygon(next);
};

const translatePolygon = (coords: [number, number][], deltaLng: number, deltaLat: number) => {
  const unique = uniqueCoords(coords);
  const next = unique.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat]) as [number, number][];
  return closePolygon(next);
};

const getCentroid = (coords: [number, number][]) => {
  const unique = uniqueCoords(coords);
  if (unique.length === 0) {
    return { lng: defaultCenter.lng, lat: defaultCenter.lat };
  }
  const sum = unique.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return { lng: sum.lng / unique.length, lat: sum.lat / unique.length };
};

const formatCoord = (value: number) => value.toFixed(6);

export default function GeometryEditor() {
  const mapRef = useRef<MapRef>(null);
  const { location } = useLocation(true);
  const [viewState, setViewState] = useState({
    latitude: defaultCenter.lat,
    longitude: defaultCenter.lng,
    zoom: 15,
    pitch: 0,
    bearing: 0,
  });
  const viewStateRef = useRef(viewState);

  const [mode, setMode] = useState<EditorMode>('business');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [zones, setZones] = useState<EditableZone[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<EditableNeighborhood[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dirtyBusinesses, setDirtyBusinesses] = useState<Set<string>>(new Set());
  const [dirtyZones, setDirtyZones] = useState<Set<string>>(new Set());
  const [dirtyNeighborhoods, setDirtyNeighborhoods] = useState<Set<string>>(new Set());
  const didLoadForLocation = useRef(false);

  useEffect(() => {
    if (location) {
      setViewState(prev => ({
        ...prev,
        latitude: location.latitude,
        longitude: location.longitude,
      }));
    }
  }, [location]);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const loadData = useCallback(async () => {
    const map = mapRef.current?.getMap();
    const center = map?.getCenter();
    const bounds = map?.getBounds();
    const fallback = viewStateRef.current;
    const lat = center?.lat ?? fallback.latitude;
    const lng = center?.lng ?? fallback.longitude;
    const minLat = bounds?.getSouth() ?? lat - 0.02;
    const maxLat = bounds?.getNorth() ?? lat + 0.02;
    const minLng = bounds?.getWest() ?? lng - 0.02;
    const maxLng = bounds?.getEast() ?? lng + 0.02;

    setLoading(true);
    setStatus(null);
    try {
      const [businessData, zoneData, neighborhoodData] = await Promise.all([
        businessesApi.getNearby(lat, lng, 5000),
        zonesApi.getInViewport({ minLat, maxLat, minLng, maxLng }),
        zonesApi.getNeighborhoods(),
      ]);

      setBusinesses(businessData);
      setZones(
        zoneData.map((z: Zone) => ({
          id: z.id,
          name: z.name,
          neighborhoodId: z.neighborhoodId,
          neighborhoodName: z.neighborhoodName,
          coords: closePolygon(z.boundary.coordinates[0] as [number, number][]),
          captured: z.captured,
        }))
      );
      setNeighborhoods(
        neighborhoodData.map((n: Neighborhood) => ({
          id: n.id,
          name: n.name,
          coords: closePolygon(n.boundary.coordinates[0] as [number, number][]),
          fullyCaptured: n.fullyCaptured,
          percentCaptured: n.percentCaptured,
        }))
      );

      setDirtyBusinesses(new Set());
      setDirtyZones(new Set());
      setDirtyNeighborhoods(new Set());
    } catch (err) {
      console.error('Failed to load geometry data:', err);
      setStatus({ type: 'error', message: 'Failed to load geometry data' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location && !didLoadForLocation.current) {
      didLoadForLocation.current = true;
      loadData();
    }
  }, [location, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (mode === 'business' && businesses.length > 0) {
      if (!selectedId || !businesses.find(b => b.id === selectedId)) {
        setSelectedId(businesses[0].id);
      }
    }
    if (mode === 'zone' && zones.length > 0) {
      if (!selectedId || !zones.find(z => z.id === selectedId)) {
        setSelectedId(zones[0].id);
      }
    }
    if (mode === 'neighborhood' && neighborhoods.length > 0) {
      if (!selectedId || !neighborhoods.find(n => n.id === selectedId)) {
        setSelectedId(neighborhoods[0].id);
      }
    }
  }, [mode, businesses, zones, neighborhoods, selectedId]);

  const filteredBusinesses = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return businesses;
    return businesses.filter(b => b.name.toLowerCase().includes(term));
  }, [businesses, filter]);

  const filteredZones = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return zones;
    return zones.filter(z => z.name.toLowerCase().includes(term));
  }, [zones, filter]);

  const filteredNeighborhoods = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return neighborhoods;
    return neighborhoods.filter(n => n.name.toLowerCase().includes(term));
  }, [neighborhoods, filter]);

  const selectedBusiness = mode === 'business'
    ? businesses.find(b => b.id === selectedId) || null
    : null;
  const selectedZone = mode === 'zone'
    ? zones.find(z => z.id === selectedId) || null
    : null;
  const selectedNeighborhood = mode === 'neighborhood'
    ? neighborhoods.find(n => n.id === selectedId) || null
    : null;

  const updateBusinessPosition = (id: string, latitude: number, longitude: number) => {
    setBusinesses(prev => prev.map(b => (b.id === id ? { ...b, latitude, longitude } : b)));
    setDirtyBusinesses(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const updateZoneCoords = (id: string, coords: [number, number][]) => {
    setZones(prev => prev.map(z => (z.id === id ? { ...z, coords } : z)));
    setDirtyZones(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const updateNeighborhoodCoords = (id: string, coords: [number, number][]) => {
    setNeighborhoods(prev => prev.map(n => (n.id === id ? { ...n, coords } : n)));
    setDirtyNeighborhoods(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const focusMap = useCallback((lng: number, lat: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const targetZoom = Math.max(map.getZoom(), 15);
    map.flyTo({ center: [lng, lat], zoom: targetZoom, speed: 0.8 });
  }, []);

  const handleSelectBusiness = (id: string) => {
    setSelectedId(id);
    const biz = businesses.find(b => b.id === id);
    if (biz) {
      focusMap(biz.longitude, biz.latitude);
    }
  };

  const handleSelectZone = (id: string) => {
    setSelectedId(id);
    const zone = zones.find(z => z.id === id);
    if (zone) {
      const centroid = getCentroid(zone.coords);
      focusMap(centroid.lng, centroid.lat);
    }
  };

  const handleSelectNeighborhood = (id: string) => {
    setSelectedId(id);
    const hood = neighborhoods.find(n => n.id === id);
    if (hood) {
      const centroid = getCentroid(hood.coords);
      focusMap(centroid.lng, centroid.lat);
    }
  };

  const saveSelected = async () => {
    if (!selectedId) return;
    setSaving(true);
    setStatus(null);
    try {
      if (mode === 'business' && selectedBusiness) {
        await businessesApi.updatePosition(selectedBusiness.id, selectedBusiness.latitude, selectedBusiness.longitude);
        setDirtyBusinesses(prev => {
          const next = new Set(prev);
          next.delete(selectedBusiness.id);
          return next;
        });
      }
      if (mode === 'zone' && selectedZone) {
        await zonesApi.updateBoundary(selectedZone.id, selectedZone.coords);
        setDirtyZones(prev => {
          const next = new Set(prev);
          next.delete(selectedZone.id);
          return next;
        });
      }
      if (mode === 'neighborhood' && selectedNeighborhood) {
        await zonesApi.updateNeighborhoodBoundary(selectedNeighborhood.id, selectedNeighborhood.coords);
        setDirtyNeighborhoods(prev => {
          const next = new Set(prev);
          next.delete(selectedNeighborhood.id);
          return next;
        });
      }
      setStatus({ type: 'success', message: 'Saved changes' });
    } catch (err) {
      console.error('Failed to save geometry:', err);
      setStatus({ type: 'error', message: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    setStatus(null);
    try {
      if (mode === 'business') {
        for (const id of dirtyBusinesses) {
          const biz = businesses.find(b => b.id === id);
          if (biz) {
            await businessesApi.updatePosition(biz.id, biz.latitude, biz.longitude);
          }
        }
        setDirtyBusinesses(new Set());
      }
      if (mode === 'zone') {
        for (const id of dirtyZones) {
          const zone = zones.find(z => z.id === id);
          if (zone) {
            await zonesApi.updateBoundary(zone.id, zone.coords);
          }
        }
        setDirtyZones(new Set());
      }
      if (mode === 'neighborhood') {
        for (const id of dirtyNeighborhoods) {
          const hood = neighborhoods.find(n => n.id === id);
          if (hood) {
            await zonesApi.updateNeighborhoodBoundary(hood.id, hood.coords);
          }
        }
        setDirtyNeighborhoods(new Set());
      }
      setStatus({ type: 'success', message: 'Saved all changes' });
    } catch (err) {
      console.error('Failed to save all geometry:', err);
      setStatus({ type: 'error', message: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const selectedPolygon = selectedZone ? { id: selectedZone.id, coords: selectedZone.coords, type: 'zone' as const }
    : selectedNeighborhood ? { id: selectedNeighborhood.id, coords: selectedNeighborhood.coords, type: 'neighborhood' as const }
    : null;

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
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />

        {zones.map((zone) => {
          const isSelected = mode === 'zone' && selectedId === zone.id;
          const fillLayer: FillLayer = {
            id: `zone-fill-${zone.id}`,
            type: 'fill',
            source: `zone-source-${zone.id}`,
            paint: {
              'fill-color': isSelected ? '#34d399' : '#1f2937',
              'fill-opacity': isSelected ? 0.35 : 0.2,
            },
          };
          const lineLayer: LineLayer = {
            id: `zone-line-${zone.id}`,
            type: 'line',
            source: `zone-source-${zone.id}`,
            paint: {
              'line-color': isSelected ? '#10b981' : '#475569',
              'line-width': isSelected ? 3 : 2,
              'line-opacity': 0.9,
            },
          };
          const geoJsonData: GeoJSON.Feature = {
            type: 'Feature',
            properties: { id: zone.id, name: zone.name },
            geometry: { type: 'Polygon', coordinates: [zone.coords] },
          };
          return (
            <Source key={zone.id} id={`zone-source-${zone.id}`} type="geojson" data={geoJsonData}>
              <Layer {...fillLayer} />
              <Layer {...lineLayer} />
            </Source>
          );
        })}

        {neighborhoods.map((neighborhood) => {
          const isSelected = mode === 'neighborhood' && selectedId === neighborhood.id;
          const lineLayer: LineLayer = {
            id: `hood-line-${neighborhood.id}`,
            type: 'line',
            source: `hood-source-${neighborhood.id}`,
            paint: {
              'line-color': isSelected ? '#38bdf8' : '#64748b',
              'line-width': isSelected ? 3 : 2,
              'line-opacity': 0.9,
              'line-dasharray': [3, 2],
            },
          };
          const geoJsonData: GeoJSON.Feature = {
            type: 'Feature',
            properties: { id: neighborhood.id, name: neighborhood.name },
            geometry: { type: 'Polygon', coordinates: [neighborhood.coords] },
          };
          return (
            <Source key={neighborhood.id} id={`hood-source-${neighborhood.id}`} type="geojson" data={geoJsonData}>
              <Layer {...lineLayer} />
            </Source>
          );
        })}

        {businesses.map((business) => (
          <Marker
            key={business.id}
            longitude={business.longitude}
            latitude={business.latitude}
            anchor="center"
            draggable={mode === 'business'}
            onDragEnd={(e) => {
              if (mode !== 'business') return;
              updateBusinessPosition(business.id, e.lngLat.lat, e.lngLat.lng);
            }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              handleSelectBusiness(business.id);
            }}
          >
            <div
              className={`w-3 h-3 rounded-full border ${
                selectedId === business.id && mode === 'business'
                  ? 'bg-primary-400 border-white'
                  : 'bg-white/60 border-white/40'
              }`}
            />
          </Marker>
        ))}

        {selectedPolygon && (
          <>
            {uniqueCoords(selectedPolygon.coords).map((point, index) => (
              <Marker
                key={`${selectedPolygon.id}-vertex-${index}`}
                longitude={point[0]}
                latitude={point[1]}
                anchor="center"
                draggable
                onDragEnd={(e) => {
                  const nextCoords = updateVertex(
                    selectedPolygon.coords,
                    index,
                    e.lngLat.lng,
                    e.lngLat.lat
                  );
                  if (selectedPolygon.type === 'zone') {
                    updateZoneCoords(selectedPolygon.id, nextCoords);
                  } else {
                    updateNeighborhoodCoords(selectedPolygon.id, nextCoords);
                  }
                }}
              >
                <div className="w-3 h-3 rounded-full bg-amber-400 border border-white/80 shadow" />
              </Marker>
            ))}

            {(() => {
              const centroid = getCentroid(selectedPolygon.coords);
              return (
                <Marker
                  longitude={centroid.lng}
                  latitude={centroid.lat}
                  anchor="center"
                  draggable
                  onDragEnd={(e) => {
                    const deltaLng = e.lngLat.lng - centroid.lng;
                    const deltaLat = e.lngLat.lat - centroid.lat;
                    const nextCoords = translatePolygon(selectedPolygon.coords, deltaLng, deltaLat);
                    if (selectedPolygon.type === 'zone') {
                      updateZoneCoords(selectedPolygon.id, nextCoords);
                    } else {
                      updateNeighborhoodCoords(selectedPolygon.id, nextCoords);
                    }
                  }}
                >
                  <div className="w-3 h-3 rounded-full bg-emerald-400 border border-white/80 shadow" />
                </Marker>
              );
            })()}
          </>
        )}
      </Map>

      <div className="absolute top-4 left-4 w-80 glass rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white text-lg">Geometry Editor</h2>
            <p className="text-xs text-gray-400">Drag points to reposition. Green handle moves entire polygon.</p>
          </div>
          <button
            onClick={loadData}
            className="text-xs px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-gray-200"
          >
            Refresh
          </button>
        </div>

        <div className="flex gap-2">
          {(['business', 'zone', 'neighborhood'] as EditorMode[]).map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                mode === item ? 'bg-primary-500 text-white' : 'bg-white/10 text-gray-300'
              }`}
            >
              {item === 'business' ? 'Businesses' : item === 'zone' ? 'Zones' : 'Neighborhoods'}
            </button>
          ))}
        </div>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name..."
          className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
        />

        <div className="max-h-48 overflow-auto space-y-1 pr-1">
          {mode === 'business' &&
            (filteredBusinesses.length === 0 ? (
              <div className="text-xs text-gray-500">No businesses loaded.</div>
            ) : (
              filteredBusinesses.map((business) => (
                <button
                  key={business.id}
                  onClick={() => handleSelectBusiness(business.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs ${
                    selectedId === business.id ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{business.name}</span>
                    {dirtyBusinesses.has(business.id) && (
                      <span className="text-amber-400">Edited</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {formatCoord(business.latitude)}, {formatCoord(business.longitude)}
                  </div>
                </button>
              ))
            ))}

          {mode === 'zone' &&
            (filteredZones.length === 0 ? (
              <div className="text-xs text-gray-500">No zones loaded.</div>
            ) : (
              filteredZones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => handleSelectZone(zone.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs ${
                    selectedId === zone.id ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{zone.name}</span>
                    {dirtyZones.has(zone.id) && (
                      <span className="text-amber-400">Edited</span>
                    )}
                  </div>
                  {zone.neighborhoodName && (
                    <div className="text-[11px] text-gray-500">{zone.neighborhoodName}</div>
                  )}
                </button>
              ))
            ))}

          {mode === 'neighborhood' &&
            (filteredNeighborhoods.length === 0 ? (
              <div className="text-xs text-gray-500">No neighborhoods loaded.</div>
            ) : (
              filteredNeighborhoods.map((neighborhood) => (
                <button
                  key={neighborhood.id}
                  onClick={() => handleSelectNeighborhood(neighborhood.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs ${
                    selectedId === neighborhood.id ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{neighborhood.name}</span>
                    {dirtyNeighborhoods.has(neighborhood.id) && (
                      <span className="text-amber-400">Edited</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {neighborhood.percentCaptured}% captured
                  </div>
                </button>
              ))
            ))}
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={saveSelected}
              disabled={!selectedId || saving}
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
            >
              Save Selected
            </button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 text-sm disabled:opacity-50"
            >
              Save All
            </button>
          </div>
          {status && (
            <div className={`text-xs ${status.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {status.message}
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <LoadingSpinner size="sm" />
              Loading geometry...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
