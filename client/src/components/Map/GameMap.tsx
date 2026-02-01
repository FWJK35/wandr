import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import MapGL, { NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl';
import type { MapRef, FillLayer, LineLayer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useLocation } from '../../hooks/useLocation';
import { businessesApi, zonesApi, questsApi, landmarksApi } from '../../services/api';
import type { Business, Zone, GeneratedQuest, Landmark } from '../../types';
import BusinessMarker from './BusinessMarker';
import UserMarker from './UserMarker';
import ZoneOverlay from './ZoneOverlay';
import BusinessPanel from './BusinessPanel';
import LandmarkMarker from './LandmarkMarker';
import LandmarkPanel from './LandmarkPanel';
import LoadingSpinner from '../shared/LoadingSpinner';

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN || '';
const NEIGHBORHOODS_GEOJSON_URL = '/neighborhoods-providence.geojson';

const defaultCenter = {
  lat: 41.8268,
  lng: -71.4025,
};

const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  // Mapbox neighborhood names -> GeoJSON LNAMEs
  'downtown providence': 'downtown',
  'downtown providence ri': 'downtown',
  'downtown providence rhode island': 'downtown',
  'downtown providence providence rhode island': 'downtown',
  'mt hope': 'mount hope',
};

const normalizeNeighborhoodName = (value: string) => (
  value
    .toLowerCase()
    .replace(/neighborhood/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
);

const canonicalizeNeighborhoodName = (value: string) => {
  const normalized = normalizeNeighborhoodName(value);
  return NEIGHBORHOOD_ALIASES[normalized] || normalized;
};

export default function GameMap() {
  const mapRef = useRef<MapRef>(null);
  const {
    location,
    error: locationError,
    spoofed,
    setSpoofLocation,
    clearSpoofLocation,
    refresh,
  } = useLocation(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const lastFetchRef = useRef<{ lat: number; lng: number } | null>(null);
  const [neighborhoodGeojson, setNeighborhoodGeojson] = useState<{ type: 'FeatureCollection'; features: any[] } | null>(null);
  const [neighborhoodsLoading, setNeighborhoodsLoading] = useState(false);
  const [neighborhoodsError, setNeighborhoodsError] = useState<string | null>(null);
  const [questBusinessIds, setQuestBusinessIds] = useState<Set<string>>(new Set());
  const [activeQuestByBusiness, setActiveQuestByBusiness] = useState<Map<string, GeneratedQuest>>(new Map());

  const neighborhoodSummary = useMemo(() => {
    const zonesByNeighborhood = new Map<string, Zone[]>();
    zones.forEach(zone => {
      const name = zone.neighborhoodName || 'Unassigned';
      const arr = zonesByNeighborhood.get(name) || [];
      arr.push(zone);
      zonesByNeighborhood.set(name, arr);
    });
    const neighborhoods = Array.from(zonesByNeighborhood.entries()).map(([name, list]) => {
      const total = list.length;
      const captured = list.filter(z => z.captured).length;
      const percentCaptured = total > 0 ? Math.round((captured / total) * 100) : 0;
      return { name, total, captured, percentCaptured, zones: list, fullyCaptured: total > 0 && captured >= total };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const totalZones = zones.length;
    const capturedZones = zones.filter(z => z.captured).length;
    const capturedNeighborhoods = neighborhoods.filter(n => n.fullyCaptured).length;
    return { neighborhoods, totalZones, capturedZones, capturedNeighborhoods, totalNeighborhoods: neighborhoods.length };
  }, [zones]);

  // Keep fill subtle; emphasize boundary color
  const neighborhoodFillLayer: FillLayer = {
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhoods-geo',
    paint: {
      'fill-color': '#111827',
      'fill-opacity': 0.04,
    }
  };

  const neighborhoodLineLayer: LineLayer = {
    id: 'neighborhood-line',
    type: 'line',
    source: 'neighborhoods-geo',
    paint: {
      'line-color': [
        'case',
        ['boolean', ['get', 'captured'], false],
        '#c084fc', // purple for captured
        '#c084fc'  // purple for not captured
      ],
      'line-width': 2.2,
      'line-opacity': 0.9,
      'line-blur': 0.15
    }
  };

  const [spoofOpen, setSpoofOpen] = useState(false);
  const [spoofLat, setSpoofLat] = useState('');
  const [spoofLng, setSpoofLng] = useState('');
  const [spoofError, setSpoofError] = useState<string | null>(null);
  const [pickSpoofMode, setPickSpoofMode] = useState(false);

  const [viewState, setViewState] = useState({
    latitude: defaultCenter.lat,
    longitude: defaultCenter.lng,
    zoom: 18.3,
    pitch: 60,
    bearing: 0,
  });

  const loadNeighborhoodBoundaries = useCallback(async () => {
    if (neighborhoodGeojson || neighborhoodsLoading) return;
    setNeighborhoodsLoading(true);
    setNeighborhoodsError(null);
    try {
      const response = await fetch(NEIGHBORHOODS_GEOJSON_URL, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load neighborhoods: ${response.status}`);
      }
      const data = await response.json();
      setNeighborhoodGeojson(data);
    } catch (err) {
      console.error('Failed to load neighborhood boundaries:', err);
      setNeighborhoodsError('Failed to load neighborhood boundaries.');
    } finally {
      setNeighborhoodsLoading(false);
    }
  }, [neighborhoodGeojson, neighborhoodsLoading]);

  const neighborhoodRenderGeojson = useMemo(() => {
    if (!neighborhoodGeojson) return null;

    const zoneGroups = new Map<string, { total: number; captured: number }>();
    zones.forEach((zone) => {
      if (!zone.neighborhoodName) return;
      const key = canonicalizeNeighborhoodName(zone.neighborhoodName);
      if (!key) return;
      const entry = zoneGroups.get(key) || { total: 0, captured: 0 };
      entry.total += 1;
      if (zone.captured) entry.captured += 1;
      zoneGroups.set(key, entry);
    });

    if (zoneGroups.size === 0) {
      return { ...neighborhoodGeojson, features: [] };
    }

    const features = neighborhoodGeojson.features
      .map((feature: any) => {
        const rawName = feature?.properties?.LNAME || feature?.properties?.name;
        if (!rawName) return null;
        const key = canonicalizeNeighborhoodName(String(rawName));
        const group = key ? zoneGroups.get(key) : null;
        if (!group || group.total === 0) return null;
        const captured = group.captured >= group.total;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            captured,
            hasZones: true,
          },
        };
      })
      .filter((feature: any) => feature);

    return { ...neighborhoodGeojson, features };
  }, [neighborhoodGeojson, zones]);

  // Update view when user location changes (always center on player)
  useEffect(() => {
    if (location) {
      setViewState(prev => ({
        ...prev,
        latitude: location.latitude,
        longitude: location.longitude,
        // keep bearing/pitch/zoom untouched so user camera stays consistent
      }));
    }
  }, [location]);

  useEffect(() => {
    if (location && !spoofLat && !spoofLng) {
      setSpoofLat(location.latitude.toFixed(6));
      setSpoofLng(location.longitude.toFixed(6));
    }
  }, [location, spoofLat, spoofLng]);

  useEffect(() => {
    if (!spoofOpen) {
      setPickSpoofMode(false);
    }
  }, [spoofOpen]);

  const fetchData = useCallback(async (lat: number, lng: number, force = false) => {
    if (!force && lastFetchRef.current) {
      const dist = Math.sqrt(
        Math.pow(lat - lastFetchRef.current.lat, 2) +
        Math.pow(lng - lastFetchRef.current.lng, 2)
      );
      if (dist < 0.001) return;
    }

    lastFetchRef.current = { lat, lng };
    setLoading(true);

    try {
      const bounds = mapRef.current?.getMap()?.getBounds();
      const minLat = bounds?.getSouth() ?? lat - 0.02;
      const maxLat = bounds?.getNorth() ?? lat + 0.02;
      const minLng = bounds?.getWest() ?? lng - 0.02;
      const maxLng = bounds?.getEast() ?? lng + 0.02;
      const padding = 0.005;
      const [businessData, zoneData, landmarkData] = await Promise.all([
        businessesApi.getNearby(lat, lng, 2000),
        zonesApi.getInViewport({
          minLat: minLat - padding,
          maxLat: maxLat + padding,
          minLng: minLng - padding,
          maxLng: maxLng + padding,
        }),
        landmarksApi.getAll({
          minLat: minLat - padding,
          maxLat: maxLat + padding,
          minLng: minLng - padding,
          maxLng: maxLng + padding,
        }).catch(() => []),
      ]);

      setBusinesses(businessData);
      setZones(zoneData);
      setLandmarks(landmarkData);
    } catch (err) {
      console.error('Failed to fetch map data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location) {
      fetchData(location.latitude, location.longitude);
    }
  }, [location, fetchData]);

  // Fetch active generated quests to highlight businesses
  const fetchQuestHighlights = useCallback(async () => {
    try {
      const quests = await questsApi.getGeneratedActive();
      const ids = new Set<string>(quests.map((q: GeneratedQuest) => q.business_id));
      setQuestBusinessIds(ids);
      const claimedIds = (() => {
        try {
          const raw = localStorage.getItem('claimed_generated_quests');
          if (!raw) return new Set<string>();
          const parsed = JSON.parse(raw);
          return new Set<string>(Array.isArray(parsed) ? parsed : []);
        } catch {
          return new Set<string>();
        }
      })();
      const claimedByBusiness = new Map<string, GeneratedQuest>();
      quests.forEach((q: GeneratedQuest) => {
        if (q.quest_id && claimedIds.has(q.quest_id) && q.business_id && !claimedByBusiness.has(q.business_id)) {
          claimedByBusiness.set(q.business_id, q);
        }
      });
      setActiveQuestByBusiness(claimedByBusiness);
    } catch (err) {
      console.warn('Failed to fetch generated quests for highlights', err);
    }
  }, []);

  useEffect(() => {
    fetchQuestHighlights();
    const interval = setInterval(fetchQuestHighlights, 60_000);
    return () => clearInterval(interval);
  }, [fetchQuestHighlights]);

  useEffect(() => {
    const handleQuestClaim = () => fetchQuestHighlights();
    window.addEventListener('wandr:quest-claim', handleQuestClaim);
    return () => window.removeEventListener('wandr:quest-claim', handleQuestClaim);
  }, [fetchQuestHighlights]);

  useEffect(() => {
    if (mapLoaded && location) {
      fetchData(location.latitude, location.longitude, true);
    }
  }, [mapLoaded, location, fetchData]);

  useEffect(() => {
    if (!mapLoaded) return;
    loadNeighborhoodBoundaries();
  }, [mapLoaded, loadNeighborhoodBoundaries]);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    const map = mapRef.current?.getMap();
    if (map) {
      const layers = map.getStyle()?.layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#1a1f2e',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.5,
              ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14,
              0,
              14.5,
              ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': 0.8,
          },
        },
        labelLayerId
      );
    }
  }, []);

  // No custom 3D player layer; use DOM marker so it renders above map tiles/buildings

  const handleMarkerClick = (business: Business) => {
    setSelectedLandmark(null);
    setSelectedBusiness(business);
  };

  const handleLandmarkClick = (landmark: Landmark) => {
    setSelectedBusiness(null);
    setSelectedLandmark(landmark);
  };

  const applySpoof = useCallback((lat: number, lng: number) => {
    setSpoofLocation({ latitude: lat, longitude: lng, accuracy: 5 });
    lastFetchRef.current = null;
    setViewState(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
    }));
    fetchData(lat, lng, true);
  }, [fetchData, setSpoofLocation]);

  const handleApplySpoof = () => {
    const lat = parseFloat(spoofLat);
    const lng = parseFloat(spoofLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setSpoofError('Enter valid latitude/longitude values');
      return;
    }
    setSpoofError(null);
    applySpoof(lat, lng);
  };

  const handleClearSpoof = () => {
    clearSpoofLocation();
    setSpoofError(null);
    lastFetchRef.current = null;
    refresh();
  };

  const handleMapClick = (evt: any) => {
    if (!pickSpoofMode) return;
    const { lngLat } = evt;
    const lat = Number(lngLat.lat.toFixed(6));
    const lng = Number(lngLat.lng.toFixed(6));
    setSpoofLat(lat.toFixed(6));
    setSpoofLng(lng.toFixed(6));
    setSpoofError(null);
    applySpoof(lat, lng);
    setPickSpoofMode(false);
  };

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
      <MapGL
        ref={mapRef}
        {...viewState}
        dragPan={false} // disable left-click panning; keep right-drag rotation
        dragRotate
        pitchWithRotate
        maxPitch={85}
        onClick={handleMapClick}
        onMove={(evt) => {
          const lat = location?.latitude ?? defaultCenter.lat;
          const lng = location?.longitude ?? defaultCenter.lng;
          setViewState(prev => ({
            ...prev,
            bearing: evt.viewState.bearing,
            pitch: evt.viewState.pitch,
            zoom: evt.viewState.zoom,
            latitude: lat,
            longitude: lng,
          }));
        }}
        onLoad={handleMapLoad}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
        antialias={true}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl
          position="top-right"
          trackUserLocation
          showUserHeading
        />

        {/* Zones + neighborhoods */}
        {mapLoaded && (
          <>
            {zones.map((zone) => (
              <ZoneOverlay key={zone.id} zone={zone} />
            ))}
            {neighborhoodRenderGeojson && neighborhoodRenderGeojson.features.length > 0 && (
              <Source id="neighborhoods-geo" type="geojson" data={neighborhoodRenderGeojson}>
                <Layer {...neighborhoodFillLayer} />
                <Layer {...neighborhoodLineLayer} />
              </Source>
            )}
          </>
        )}

        {/* Business markers */}
        {businesses.map((business) => (
          <BusinessMarker
            key={business.id}
            business={business}
            highlight={questBusinessIds.has(business.id)}
            onClick={() => handleMarkerClick(business)}
          />
        ))}
        {landmarks.map((landmark) => (
          <LandmarkMarker
            key={landmark.id}
            landmark={landmark}
            highlight={questBusinessIds.has(landmark.id)}
            onClick={() => handleLandmarkClick(landmark)}
          />
        ))}

        {/* User marker always visible; DOM overlay keeps it above tiles/buildings */}
        {location && (
          <UserMarker
            position={{ lat: location.latitude, lng: location.longitude }}
          />
        )}

      </MapGL>

            {/* Mode toggle + testing tools */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setSpoofOpen(prev => !prev)}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all shadow-lg hover:scale-105 ${
            spoofed ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-200'
          }`}
        >
          {spoofed ? 'Spoofing Location' : 'Test Location'}
        </button>

        {spoofOpen && (
          <div className="glass rounded-xl p-3 w-64 text-xs text-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-400">Manual Location</span>
              {spoofed && <span className="text-emerald-400 text-[11px]">Active</span>}
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-gray-400 mb-1">Latitude</label>
                <input
                  value={spoofLat}
                  onChange={(e) => setSpoofLat(e.target.value)}
                  className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm text-white"
                  placeholder="41.826800"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Longitude</label>
                <input
                  value={spoofLng}
                  onChange={(e) => setSpoofLng(e.target.value)}
                  className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm text-white"
                  placeholder="-71.402500"
                />
              </div>
              {spoofError && (
                <div className="text-red-400 text-[11px]">{spoofError}</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setPickSpoofMode(true)}
                  className="flex-1 rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-[11px]"
                >
                  Pick on Map
                </button>
                <button
                  onClick={handleApplySpoof}
                  className="flex-1 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 px-2 py-1 text-[11px] text-white"
                >
                  Apply
                </button>
              </div>
              {pickSpoofMode && (
                <div className="text-[11px] text-amber-300">
                  Tap a spot on the map to set the spoofed location.
                </div>
              )}
              <button
                onClick={handleClearSpoof}
                className="w-full rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-[11px]"
              >
                Clear Spoof
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Territory stats dropdown (top right) with full detail */}
      <div className="absolute top-4 right-4 z-10 pointer-events-auto">
        <details className="glass rounded-xl px-3 py-2 text-sm text-white shadow-lg max-w-sm">
          <summary className="cursor-pointer select-none">
            Territory stats
          </summary>
          <div className="mt-2 space-y-2 text-xs text-gray-200 max-h-72 overflow-auto pr-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Zones captured</span>
              <span className="font-semibold">{neighborhoodSummary.capturedZones}/{neighborhoodSummary.totalZones}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Neighborhoods</span>
              <span className="font-semibold">
                {neighborhoodSummary.capturedNeighborhoods}/{neighborhoodSummary.totalNeighborhoods}
              </span>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-gray-400">
                <LoadingSpinner size="sm" />
                <span>Updating…</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-2 space-y-2">
              {neighborhoodSummary.neighborhoods.map((hood) => (
                <div
                  key={hood.name}
                  className={`p-2 rounded-lg border
                    ${hood.fullyCaptured ? 'bg-green-500/15 border-green-500/30' :
                      hood.percentCaptured > 0 ? 'bg-amber-500/10 border-amber-500/30' :
                        'bg-gray-700/30 border-gray-600/40'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{hood.fullyCaptured ? '🏆' : hood.percentCaptured > 0 ? '🔓' : '🔒'}</span>
                      <span className="font-medium text-white">{hood.name}</span>
                    </div>
                    <span className={`text-xs font-semibold ${hood.fullyCaptured ? 'text-green-400' : 'text-amber-300'}`}>
                      {hood.percentCaptured}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-700/50 rounded-full h-2 mb-2">
                    <div
                      className={`${hood.fullyCaptured ? 'bg-green-400' : 'bg-amber-400'} h-2 rounded-full`}
                      style={{ width: `${hood.percentCaptured}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {hood.zones.map(z => (
                      <span
                        key={z.id}
                        className={`px-2 py-0.5 rounded-full text-[11px] ${
                          z.captured ? 'bg-green-500/30 text-green-200' : 'bg-gray-600/40 text-gray-300'
                        }`}
                      >
                        {z.captured ? '✓ ' : ''}{z.name.replace(`${hood.name} - `, '')}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {neighborhoodSummary.neighborhoods.length === 0 && (
                <div className="text-gray-400 text-center py-2">No neighborhoods in view</div>
              )}
            </div>
          </div>
        </details>
      </div>

      {/* Camera control hint */}
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="glass rounded-xl px-3 py-2 text-xs text-gray-300 pointer-events-auto">
          <div className="flex items-center gap-2">
            <span>🖱️</span>
            <span>Rotate with right-drag/Ctrl+drag • Scroll to zoom • Center locked on you</span>
          </div>
        </div>
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
          activeQuest={activeQuestByBusiness.get(selectedBusiness.id) || null}
          onCheckInComplete={() => {
            if (location) {
              fetchData(location.latitude, location.longitude, true);
            }
          }}
          onClose={() => setSelectedBusiness(null)}
        />
      )}
      {selectedLandmark && (
        <LandmarkPanel
          landmark={selectedLandmark}
          userLocation={location}
          onClose={() => setSelectedLandmark(null)}
        />
      )}

      {/* Territory panel removed (was bottom progress bar) */}
      {neighborhoodsError && (
        <div className="absolute top-24 left-4 right-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200">
            {neighborhoodsError}
          </div>
        </div>
      )}
      {neighborhoodsLoading && (
        <div className="absolute top-24 right-4">
          <div className="glass rounded-xl px-3 py-2 text-xs text-gray-300">
            Loading neighborhood boundaries...
          </div>
        </div>
      )}
    </div>
  );
}
