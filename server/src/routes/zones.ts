import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/index.js';
import { optionalAuth, authenticate, AuthRequest } from '../middleware/auth.js';

export const zonesRouter = Router();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN;

const getPolygonCentroid = (coords: [number, number][]) => {
  if (coords.length === 0) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const unique = (coords.length > 1 && first[0] === last[0] && first[1] === last[1])
    ? coords.slice(0, -1)
    : coords;
  if (unique.length === 0) return null;
  const sum = unique.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return { lng: sum.lng / unique.length, lat: sum.lat / unique.length };
};

async function reverseGeocodeNeighborhood(lng: number, lat: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=neighborhood&limit=1&access_token=${MAPBOX_TOKEN}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: Array<{ text?: string; place_name?: string }> };
    const feature = data?.features?.[0];
    if (!feature) return null;
    return feature.text || feature.place_name || null;
  } catch (error) {
    console.error('Mapbox reverse geocode error:', error);
    return null;
  }
}

async function hydrateNeighborhoodName(zone: {
  id: string;
  neighborhood_name: string | null;
  boundary_coords: any;
}): Promise<string | null> {
  if (zone.neighborhood_name) return zone.neighborhood_name;
  const coords = parseBoundaryCoords(zone.boundary_coords);
  const centroid = getPolygonCentroid(coords);
  if (!centroid) return null;
  const name = await reverseGeocodeNeighborhood(centroid.lng, centroid.lat);
  if (name) {
    await execute('UPDATE zones SET neighborhood_name = $1 WHERE id = $2', [name, zone.id]);
  }
  return name;
}

// Helper to check if a point is inside a polygon
function pointInPolygon(lng: number, lat: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Helper to safely parse boundary_coords (handles both string and object)
function parseBoundaryCoords(coords: any): [number, number][] {
  if (typeof coords === 'string') {
    return JSON.parse(coords);
  }
  return coords;
}

function normalizeBoundaryCoords(coords: any): [number, number][] | null {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const normalized: [number, number][] = [];
  for (const point of coords) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    normalized.push([lng, lat]);
  }
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    normalized.push([first[0], first[1]]);
  }
  return normalized;
}

// POST /api/zones - Create zone
zonesRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, coordinates } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const normalized = normalizeBoundaryCoords(coordinates);
    if (!normalized) {
      return res.status(400).json({ error: 'coordinates must be an array of [lng, lat] values' });
    }
    const centroid = getPolygonCentroid(normalized);
    const neighborhoodName = centroid
      ? await reverseGeocodeNeighborhood(centroid.lng, centroid.lat)
      : null;

    const id = uuidv4();
    await execute(
      `INSERT INTO zones (id, name, description, neighborhood_name, boundary_coords, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        id,
        name,
        typeof description === 'string' ? description : null,
        neighborhoodName,
        JSON.stringify(normalized),
      ]
    );

    res.status(201).json({ id, neighborhoodName });
  } catch (error) {
    console.error('Create zone error:', error);
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

// PATCH /api/zones/:id - Update zone metadata
zonesRouter.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (name !== undefined) {
      updates.push(`name = $${index++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${index++}`);
      values.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const updated = await execute(
      `UPDATE zones SET ${updates.join(', ')} WHERE id = $${index}`,
      values
    );

    if (updated === 0) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    res.json({ id });
  } catch (error) {
    console.error('Update zone error:', error);
    res.status(500).json({ error: 'Failed to update zone' });
  }
});

// DELETE /api/zones/:id - Delete zone
zonesRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await execute('DELETE FROM zones WHERE id = $1', [id]);
    if (deleted === 0) {
      return res.status(404).json({ error: 'Zone not found' });
    }
    res.json({ id });
  } catch (error) {
    console.error('Delete zone error:', error);
    res.status(500).json({ error: 'Failed to delete zone' });
  }
});

// PATCH /api/zones/:id/boundary - Update zone boundary
zonesRouter.patch('/:id/boundary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { coordinates } = req.body;
    const normalized = normalizeBoundaryCoords(coordinates);

    if (!normalized) {
      return res.status(400).json({ error: 'coordinates must be an array of [lng, lat] values' });
    }

    let neighborhoodName = null;
    const centroid = getPolygonCentroid(normalized);
    if (centroid) {
      neighborhoodName = await reverseGeocodeNeighborhood(centroid.lng, centroid.lat);
    }
    if (!neighborhoodName) {
      const existing = await queryOne<{ neighborhood_name: string | null }>(
        'SELECT neighborhood_name FROM zones WHERE id = $1',
        [id]
      );
      neighborhoodName = existing?.neighborhood_name ?? null;
    }

    const updated = await execute(
      'UPDATE zones SET boundary_coords = $1, neighborhood_name = $2 WHERE id = $3',
      [JSON.stringify(normalized), neighborhoodName, id]
    );

    if (updated === 0) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    res.json({ id });
  } catch (error) {
    console.error('Update zone boundary error:', error);
    res.status(500).json({ error: 'Failed to update zone boundary' });
  }
});

// GET /api/zones/stats/leaderboard - Get zone capture leaderboard
// NOTE: Must come BEFORE /:id route
zonesRouter.get('/stats/leaderboard', async (req, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const leaderboard = await query<{
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      zones_captured: string;
      neighborhoods_captured: string;
    }>(
      `SELECT
        u.id as user_id, u.username, u.display_name, u.avatar_url,
        COUNT(DISTINCT zp.zone_id) FILTER (WHERE zp.captured = true) as zones_captured,
        COUNT(DISTINCT np.neighborhood_name) FILTER (WHERE np.fully_captured = true) as neighborhoods_captured
       FROM users u
       LEFT JOIN zone_progress zp ON zp.user_id = u.id
       LEFT JOIN neighborhood_progress np ON np.user_id = u.id
       GROUP BY u.id
       HAVING COUNT(DISTINCT zp.zone_id) FILTER (WHERE zp.captured = true) > 0
       ORDER BY zones_captured DESC, neighborhoods_captured DESC
       LIMIT $1`,
      [limit]
    );

    res.json(leaderboard.map((l, i) => ({
      rank: i + 1,
      userId: l.user_id,
      username: l.username,
      displayName: l.display_name,
      avatarUrl: l.avatar_url,
      zonesCaptured: parseInt(l.zones_captured),
      neighborhoodsCaptured: parseInt(l.neighborhoods_captured)
    })));
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/zones - Get zones in viewport
zonesRouter.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const minLat = parseFloat(req.query.minLat as string);
    const maxLat = parseFloat(req.query.maxLat as string);
    const minLng = parseFloat(req.query.minLng as string);
    const maxLng = parseFloat(req.query.maxLng as string);

    if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
      return res.status(400).json({ error: 'Viewport bounds required (minLat, maxLat, minLng, maxLng)' });
    }

    // Get all zones with their neighborhood info
    const zones = await query<{
      id: string;
      name: string;
      description: string;
      neighborhood_name: string | null;
      boundary_coords: any;
    }>(
      `SELECT id, name, description, neighborhood_name, boundary_coords
       FROM zones`
    );

    // Filter zones that overlap with viewport
    const visibleZones = zones.filter(z => {
      const coords = parseBoundaryCoords(z.boundary_coords);
      const zoneLngs = coords.map(c => c[0]);
      const zoneLats = coords.map(c => c[1]);
      const zoneMinLng = Math.min(...zoneLngs);
      const zoneMaxLng = Math.max(...zoneLngs);
      const zoneMinLat = Math.min(...zoneLats);
      const zoneMaxLat = Math.max(...zoneLats);

      // Check for overlap
      return !(zoneMaxLat < minLat || zoneMinLat > maxLat || zoneMaxLng < minLng || zoneMinLng > maxLng);
    });

    await Promise.all(
      visibleZones.map(async (zone) => {
        if (!zone.neighborhood_name) {
          const name = await hydrateNeighborhoodName(zone);
          zone.neighborhood_name = name;
        }
      })
    );

    // Get user's captured zones
    let capturedZoneIds: Set<string> = new Set();
    if (req.user) {
      const captured = await query<{ zone_id: string }>(
        'SELECT zone_id FROM zone_progress WHERE user_id = $1 AND captured = true',
        [req.user.id]
      );
      capturedZoneIds = new Set(captured.map(c => c.zone_id));
    }

    res.json(visibleZones.map(z => {
      const coords = parseBoundaryCoords(z.boundary_coords);
      return {
        id: z.id,
        name: z.name,
        description: z.description,
        neighborhoodName: z.neighborhood_name,
        boundary: {
          type: 'Polygon',
          coordinates: [coords]
        },
        captured: capturedZoneIds.has(z.id)
      };
    }));
  } catch (error) {
    console.error('Get zones error:', error);
    res.status(500).json({ error: 'Failed to get zones' });
  }
});

// GET /api/zones/:id - Get zone details
// NOTE: Must come AFTER all specific routes
zonesRouter.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const zone = await queryOne<{
      id: string;
      name: string;
      description: string;
      neighborhood_name: string | null;
      boundary_coords: any;
    }>(
      `SELECT id, name, description, neighborhood_name, boundary_coords
       FROM zones
       WHERE id = $1`,
      [id]
    );

    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    const coords = parseBoundaryCoords(zone.boundary_coords);
    if (!zone.neighborhood_name) {
      const name = await hydrateNeighborhoodName(zone);
      zone.neighborhood_name = name;
    }

    // Get businesses in zone (check if point in polygon)
    const allBusinesses = await query<{
      id: string;
      name: string;
      category: string;
      latitude: number;
      longitude: number;
    }>(
      'SELECT id, name, category, latitude, longitude FROM businesses'
    );

    const businessesInZone = allBusinesses.filter(b =>
      pointInPolygon(b.longitude, b.latitude, coords)
    );

    // Check if user has captured this zone
    let captured = false;
    if (req.user) {
      const progress = await queryOne<{ captured: boolean }>(
        'SELECT captured FROM zone_progress WHERE user_id = $1 AND zone_id = $2',
        [req.user.id, id]
      );
      captured = progress?.captured || false;
    }

    res.json({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      neighborhoodName: zone.neighborhood_name,
      boundary: {
        type: 'Polygon',
        coordinates: [coords]
      },
      businesses: businessesInZone.map(b => ({
        id: b.id,
        name: b.name,
        category: b.category,
        latitude: b.latitude,
        longitude: b.longitude
      })),
      captured
    });
  } catch (error) {
    console.error('Get zone error:', error);
    res.status(500).json({ error: 'Failed to get zone' });
  }
});
