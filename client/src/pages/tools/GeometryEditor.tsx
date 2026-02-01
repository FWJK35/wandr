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

const distanceToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    const cx = px - ax;
    const cy = py - ay;
    return Math.hypot(cx, cy);
  }
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = ax + clamped * dx;
  const projY = ay + clamped * dy;
  return Math.hypot(px - projX, py - projY);
};

const insertPoint = (coords: [number, number][], lng: number, lat: number) => {
  const unique = uniqueCoords(coords);
  if (unique.length < 2) {
    return closePolygon([...unique, [lng, lat]]);
  }
  let bestIndex = unique.length;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    const b = unique[(i + 1) % unique.length];
    const dist = distanceToSegment(lng, lat, a[0], a[1], b[0], b[1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i + 1;
    }
  }
  const next = [
    ...unique.slice(0, bestIndex),
    [lng, lat],
    ...unique.slice(bestIndex),
  ] as [number, number][];
  return closePolygon(next);
};

const removeVertex = (coords: [number, number][], index: number) => {
  const unique = uniqueCoords(coords);
  if (unique.length <= 3) return coords;
  const next = unique.filter((_, i) => i !== index) as [number, number][];
  return closePolygon(next);
};

const buildSquare = (lng: number, lat: number, size: number) => closePolygon([
  [lng - size, lat - size],
  [lng + size, lat - size],
  [lng + size, lat + size],
  [lng - size, lat + size],
]);

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

const businessCategories = [
  'Cafe',
  'Restaurant',
  'Bar',
  'Shop',
  'Museum',
  'Gym',
  'Entertainment',
  'Park',
  'Other',
];

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
  const [addPointMode, setAddPointMode] = useState(false);
  const [removePointMode, setRemovePointMode] = useState(false);
  const [createMode, setCreateMode] = useState<EditorMode | null>(null);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState('Shop');
  const [createAddress, setCreateAddress] = useState('');
  const [createNeighborhoodId, setCreateNeighborhoodId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingNeighborhoodId, setPendingNeighborhoodId] = useState<string>('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editBusinessCategory, setEditBusinessCategory] = useState('Shop');
  const [editBusinessAddress, setEditBusinessAddress] = useState('');
  const [editZoneName, setEditZoneName] = useState('');
  const [editNeighborhoodName, setEditNeighborhoodName] = useState('');

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

  useEffect(() => {
    if (selectedZone) {
      setPendingNeighborhoodId(selectedZone.neighborhoodId || '');
    }
  }, [selectedZone?.id]);

  useEffect(() => {
    setAddPointMode(false);
    setRemovePointMode(false);
  }, [mode, selectedId]);

  useEffect(() => {
    if (!createMode) {
      setCreateName('');
      setCreateCategory('Shop');
      setCreateAddress('');
      setCreateNeighborhoodId('');
      setCreateError(null);
    }
  }, [createMode]);

  useEffect(() => {
    if (selectedBusiness) {
      setEditBusinessName(selectedBusiness.name);
      setEditBusinessCategory(selectedBusiness.category || 'Shop');
      setEditBusinessAddress(selectedBusiness.address || '');
    }
  }, [selectedBusiness?.id]);

  useEffect(() => {
    if (selectedZone) {
      setEditZoneName(selectedZone.name);
    }
  }, [selectedZone?.id]);

  useEffect(() => {
    if (selectedNeighborhood) {
      setEditNeighborhoodName(selectedNeighborhood.name);
    }
  }, [selectedNeighborhood?.id]);

  const persistBusinessPosition = useCallback(async (id: string, latitude: number, longitude: number) => {
    try {
      await businessesApi.updatePosition(id, latitude, longitude);
      setDirtyBusinesses(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error('Failed to save business position:', err);
      setStatus({ type: 'error', message: 'Failed to save business position' });
    }
  }, []);

  const persistZoneCoords = useCallback(async (id: string, coords: [number, number][]) => {
    try {
      await zonesApi.updateBoundary(id, coords);
      setDirtyZones(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error('Failed to save zone boundary:', err);
      setStatus({ type: 'error', message: 'Failed to save zone boundary' });
    }
  }, []);

  const persistNeighborhoodCoords = useCallback(async (id: string, coords: [number, number][]) => {
    try {
      await zonesApi.updateNeighborhoodBoundary(id, coords);
      setDirtyNeighborhoods(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error('Failed to save neighborhood boundary:', err);
      setStatus({ type: 'error', message: 'Failed to save neighborhood boundary' });
    }
  }, []);

  const updateBusinessPosition = useCallback((id: string, latitude: number, longitude: number) => {
    setBusinesses(prev => prev.map(b => (b.id === id ? { ...b, latitude, longitude } : b)));
    setDirtyBusinesses(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void persistBusinessPosition(id, latitude, longitude);
  }, [persistBusinessPosition]);

  const updateZoneCoords = useCallback((id: string, coords: [number, number][]) => {
    setZones(prev => prev.map(z => (z.id === id ? { ...z, coords } : z)));
    setDirtyZones(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void persistZoneCoords(id, coords);
  }, [persistZoneCoords]);

  const updateNeighborhoodCoords = useCallback((id: string, coords: [number, number][]) => {
    setNeighborhoods(prev => prev.map(n => (n.id === id ? { ...n, coords } : n)));
    setDirtyNeighborhoods(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void persistNeighborhoodCoords(id, coords);
  }, [persistNeighborhoodCoords]);

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

  const getMapCenter = () => {
    const map = mapRef.current?.getMap();
    const center = map?.getCenter();
    if (center) {
      return { lng: center.lng, lat: center.lat };
    }
    const fallback = viewStateRef.current;
    return { lng: fallback.longitude, lat: fallback.latitude };
  };

  const handleCreate = async () => {
    if (!createMode) return;
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError('Name is required');
      return;
    }
    setCreateError(null);
    setSaving(true);
    setStatus(null);
    try {
      const { lng, lat } = getMapCenter();
      if (createMode === 'business') {
        const result = await businessesApi.create({
          name: trimmed,
          category: createCategory || 'Other',
          address: createAddress || '',
          latitude: lat,
          longitude: lng,
        });
        const newBusiness: Business = {
          id: result.id,
          name: trimmed,
          category: createCategory || 'Other',
          address: createAddress || '',
          latitude: lat,
          longitude: lng,
          isBoosted: false,
          visited: false,
        };
        setBusinesses(prev => [newBusiness, ...prev]);
        setMode('business');
        setSelectedId(result.id);
      } else {
        const size = createMode === 'zone' ? 0.0015 : 0.003;
        const coords = buildSquare(lng, lat, size);

        if (createMode === 'zone') {
        const result = await zonesApi.createZone({
          name: trimmed,
          neighborhoodId: createNeighborhoodId || null,
          coordinates: coords,
        });
        const neighborhoodName = neighborhoods.find(n => n.id === createNeighborhoodId)?.name;
        const newZone: EditableZone = {
          id: result.id,
          name: trimmed,
          neighborhoodId: createNeighborhoodId || undefined,
          neighborhoodName,
          coords,
          captured: false,
        };
        setZones(prev => [newZone, ...prev]);
        setMode('zone');
        setSelectedId(result.id);
        } else {
        const result = await zonesApi.createNeighborhood({
          name: trimmed,
          coordinates: coords,
        });
        const newNeighborhood: EditableNeighborhood = {
          id: result.id,
          name: trimmed,
          coords,
          fullyCaptured: false,
          percentCaptured: 0,
        };
        setNeighborhoods(prev => [newNeighborhood, ...prev]);
        setMode('neighborhood');
        setSelectedId(result.id);
        }
      }

      setCreateMode(null);
      setStatus({ type: 'success', message: 'Created successfully' });
    } catch (err) {
      console.error('Failed to create geometry:', err);
      setStatus({ type: 'error', message: 'Failed to create' });
    } finally {
      setSaving(false);
    }
  };

  const handleAssignNeighborhood = async () => {
    if (!selectedZone) return;
    setSaving(true);
    setStatus(null);
    try {
      await zonesApi.updateZoneMeta(selectedZone.id, {
        neighborhoodId: pendingNeighborhoodId || null,
      });
      const neighborhoodName = neighborhoods.find(n => n.id === pendingNeighborhoodId)?.name;
      setZones(prev => prev.map(z => (
        z.id === selectedZone.id
          ? { ...z, neighborhoodId: pendingNeighborhoodId || undefined, neighborhoodName }
          : z
      )));
      setStatus({ type: 'success', message: 'Updated neighborhood' });
    } catch (err) {
      console.error('Failed to update zone neighborhood:', err);
      setStatus({ type: 'error', message: 'Failed to update neighborhood' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateBusiness = async () => {
    if (!selectedBusiness) return;
    const name = editBusinessName.trim();
    if (!name) {
      setStatus({ type: 'error', message: 'Business name is required' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await businessesApi.update(selectedBusiness.id, {
        name,
        category: editBusinessCategory || 'Other',
        address: editBusinessAddress || '',
      });
      setBusinesses(prev => prev.map(b => (
        b.id === selectedBusiness.id
          ? { ...b, name, category: editBusinessCategory || 'Other', address: editBusinessAddress || '' }
          : b
      )));
      setStatus({ type: 'success', message: 'Business updated' });
    } catch (err) {
      console.error('Failed to update business:', err);
      setStatus({ type: 'error', message: 'Failed to update business' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateZoneName = async () => {
    if (!selectedZone) return;
    const name = editZoneName.trim();
    if (!name) {
      setStatus({ type: 'error', message: 'Zone name is required' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await zonesApi.updateZoneMeta(selectedZone.id, { name });
      setZones(prev => prev.map(z => (z.id === selectedZone.id ? { ...z, name } : z)));
      setStatus({ type: 'success', message: 'Zone renamed' });
    } catch (err) {
      console.error('Failed to rename zone:', err);
      setStatus({ type: 'error', message: 'Failed to rename zone' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateNeighborhoodName = async () => {
    if (!selectedNeighborhood) return;
    const name = editNeighborhoodName.trim();
    if (!name) {
      setStatus({ type: 'error', message: 'Neighborhood name is required' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await zonesApi.updateNeighborhoodMeta(selectedNeighborhood.id, { name });
      setNeighborhoods(prev => prev.map(n => (n.id === selectedNeighborhood.id ? { ...n, name } : n)));
      setZones(prev => prev.map(z => (
        z.neighborhoodId === selectedNeighborhood.id ? { ...z, neighborhoodName: name } : z
      )));
      setStatus({ type: 'success', message: 'Neighborhood renamed' });
    } catch (err) {
      console.error('Failed to rename neighborhood:', err);
      setStatus({ type: 'error', message: 'Failed to rename neighborhood' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedId) return;
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    setSaving(true);
    setStatus(null);
    try {
      if (mode === 'business') {
        await businessesApi.delete(selectedId);
        setBusinesses(prev => prev.filter(b => b.id !== selectedId));
        setDirtyBusinesses(prev => {
          const next = new Set(prev);
          next.delete(selectedId);
          return next;
        });
      } else if (mode === 'zone') {
        await zonesApi.deleteZone(selectedId);
        setZones(prev => prev.filter(z => z.id !== selectedId));
        setDirtyZones(prev => {
          const next = new Set(prev);
          next.delete(selectedId);
          return next;
        });
      } else if (mode === 'neighborhood') {
        await zonesApi.deleteNeighborhood(selectedId);
        setNeighborhoods(prev => prev.filter(n => n.id !== selectedId));
        setZones(prev => prev.map(z => (
          z.neighborhoodId === selectedId ? { ...z, neighborhoodId: undefined, neighborhoodName: undefined } : z
        )));
        setDirtyNeighborhoods(prev => {
          const next = new Set(prev);
          next.delete(selectedId);
          return next;
        });
      }
      setSelectedId(null);
      setStatus({ type: 'success', message: 'Deleted successfully' });
    } catch (err) {
      console.error('Failed to delete geometry:', err);
      setStatus({ type: 'error', message: 'Failed to delete' });
    } finally {
      setSaving(false);
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

  const handleMapClick = useCallback((evt: any) => {
    if (!addPointMode || !selectedPolygon) return;
    const { lngLat } = evt;
    const nextCoords = insertPoint(selectedPolygon.coords, lngLat.lng, lngLat.lat);
    if (selectedPolygon.type === 'zone') {
      updateZoneCoords(selectedPolygon.id, nextCoords);
    } else {
      updateNeighborhoodCoords(selectedPolygon.id, nextCoords);
    }
  }, [addPointMode, selectedPolygon, updateZoneCoords, updateNeighborhoodCoords]);

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
        onClick={handleMapClick}
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
                draggable={!removePointMode}
                onDragEnd={(e) => {
                  if (removePointMode) return;
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
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  if (!removePointMode) return;
                  const nextCoords = removeVertex(selectedPolygon.coords, index);
                  if (nextCoords.length === selectedPolygon.coords.length) {
                    setStatus({ type: 'error', message: 'Polygon needs at least 3 points' });
                    return;
                  }
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

      <div className="absolute top-4 left-4 w-80 glass rounded-2xl p-4 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
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

        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setCreateMode('zone')}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 text-sm"
            >
              New Zone
            </button>
            <button
              onClick={() => setCreateMode('neighborhood')}
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 text-sm"
            >
              New Neighborhood
            </button>
          </div>
          <button
            onClick={() => setCreateMode('business')}
            className="w-full px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 text-sm"
          >
            New Business
          </button>

          {createMode && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">
                  Create {createMode === 'zone' ? 'zone' : 'neighborhood'}
                </span>
                <button
                  onClick={() => setCreateMode(null)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  Close
                </button>
              </div>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
              />
              {createMode === 'business' && (
                <>
                  <div>
                    <label className="block text-gray-400 mb-1">Category</label>
                    <select
                      value={createCategory}
                      onChange={(e) => setCreateCategory(e.target.value)}
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm text-white"
                    >
                      {businessCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Address</label>
                    <input
                      value={createAddress}
                      onChange={(e) => setCreateAddress(e.target.value)}
                      placeholder="Address"
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </>
              )}
              {createMode === 'zone' && (
                <div>
                  <label className="block text-gray-400 mb-1">Neighborhood</label>
                  <select
                    value={createNeighborhoodId}
                    onChange={(e) => setCreateNeighborhoodId(e.target.value)}
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm text-white"
                  >
                    <option value="">Unassigned</option>
                    {neighborhoods.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {createError && (
                <div className="text-red-400">{createError}</div>
              )}
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full px-3 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
              >
                Create at Map Center
              </button>
              <div className="text-[11px] text-gray-500">
                {createMode === 'business'
                  ? 'Creates the business at the current map center.'
                  : 'Creates a default square around the current map center.'}
              </div>
            </div>
          )}
        </div>

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

        {(mode === 'zone' || mode === 'neighborhood') && selectedId && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Edit Geometry</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAddPointMode((prev) => !prev);
                    setRemovePointMode(false);
                  }}
                  className={`px-2 py-1 rounded-full text-[11px] ${
                    addPointMode ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-200'
                  }`}
                >
                  {addPointMode ? 'Click map to add' : 'Add Point'}
                </button>
                <button
                  onClick={() => {
                    setRemovePointMode((prev) => !prev);
                    setAddPointMode(false);
                  }}
                  className={`px-2 py-1 rounded-full text-[11px] ${
                    removePointMode ? 'bg-red-500 text-white' : 'bg-white/10 text-gray-200'
                  }`}
                >
                  {removePointMode ? 'Click vertex to remove' : 'Remove Point'}
                </button>
              </div>
            </div>
            {addPointMode && (
              <div className="text-[11px] text-amber-300">
                Click on the map to insert a new vertex along the closest edge.
              </div>
            )}
            {removePointMode && (
              <div className="text-[11px] text-red-300">
                Click a vertex to remove it (minimum 3 points).
              </div>
            )}
          </div>
        )}

        {mode === 'business' && selectedBusiness && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
            <div className="text-gray-300">Business Details</div>
            <input
              value={editBusinessName}
              onChange={(e) => setEditBusinessName(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
              placeholder="Name"
            />
            <select
              value={editBusinessCategory}
              onChange={(e) => setEditBusinessCategory(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm text-white"
            >
              {businessCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              value={editBusinessAddress}
              onChange={(e) => setEditBusinessAddress(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
              placeholder="Address"
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpdateBusiness}
                disabled={saving}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
              >
                Save Details
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {mode === 'zone' && selectedZone && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
            <div className="text-gray-300">Zone Details</div>
            <input
              value={editZoneName}
              onChange={(e) => setEditZoneName(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
              placeholder="Zone name"
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpdateZoneName}
                disabled={saving}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
              >
                Rename Zone
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {mode === 'neighborhood' && selectedNeighborhood && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
            <div className="text-gray-300">Neighborhood Details</div>
            <input
              value={editNeighborhoodName}
              onChange={(e) => setEditNeighborhoodName(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
              placeholder="Neighborhood name"
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpdateNeighborhoodName}
                disabled={saving}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
              >
                Rename Neighborhood
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {mode === 'zone' && selectedZone && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
            <div className="text-gray-300">Neighborhood Assignment</div>
            <select
              value={pendingNeighborhoodId}
              onChange={(e) => setPendingNeighborhoodId(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-2 text-sm text-white"
            >
              <option value="">Unassigned</option>
              {neighborhoods.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <button
              onClick={handleAssignNeighborhood}
              disabled={saving}
              className="w-full px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 text-sm disabled:opacity-50"
            >
              Update Neighborhood
            </button>
          </div>
        )}

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
