import { Router, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { optionalAuth, AuthRequest } from '../middleware/auth.js';

export const zonesRouter = Router();

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

// GET /api/zones/neighborhoods - Get all neighborhoods with progress
// NOTE: Must come BEFORE /:id route
zonesRouter.get('/neighborhoods', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Get all neighborhoods
    const neighborhoods = await query<{
      id: string;
      name: string;
      description: string;
      boundary_coords: any;
      bonus_points: number;
    }>(
      'SELECT id, name, description, boundary_coords, bonus_points FROM neighborhoods'
    );

    // Get zone counts per neighborhood
    const zoneCounts = await query<{
      neighborhood_id: string;
      total: string;
    }>(
      `SELECT neighborhood_id, COUNT(*) as total
       FROM zones
       WHERE neighborhood_id IS NOT NULL
       GROUP BY neighborhood_id`
    );
    const zoneCountMap = new Map(zoneCounts.map(z => [z.neighborhood_id, parseInt(z.total)]));

    // Get user's captured zones per neighborhood
    let capturedCounts: Map<string, number> = new Map();
    let fullyCaptured: Set<string> = new Set();

    if (req.user) {
      const captured = await query<{
        neighborhood_id: string;
        captured_count: string;
      }>(
        `SELECT z.neighborhood_id, COUNT(*) as captured_count
         FROM zone_progress zp
         JOIN zones z ON z.id = zp.zone_id
         WHERE zp.user_id = $1 AND zp.captured = true AND z.neighborhood_id IS NOT NULL
         GROUP BY z.neighborhood_id`,
        [req.user.id]
      );
      capturedCounts = new Map(captured.map(c => [c.neighborhood_id, parseInt(c.captured_count)]));

      // Check which neighborhoods are fully captured
      const fullyComplete = await query<{ neighborhood_id: string }>(
        `SELECT neighborhood_id FROM neighborhood_progress
         WHERE user_id = $1 AND fully_captured = true`,
        [req.user.id]
      );
      fullyCaptured = new Set(fullyComplete.map(f => f.neighborhood_id));
    }

    res.json(neighborhoods.map(n => {
      const coords = parseBoundaryCoords(n.boundary_coords);
      const totalZones = zoneCountMap.get(n.id) || 0;
      const capturedZones = capturedCounts.get(n.id) || 0;
      const percentCaptured = totalZones > 0 ? Math.round((capturedZones / totalZones) * 100) : 0;

      return {
        id: n.id,
        name: n.name,
        description: n.description,
        boundary: {
          type: 'Polygon',
          coordinates: [coords]
        },
        bonusPoints: n.bonus_points,
        totalZones,
        capturedZones,
        percentCaptured,
        fullyCaptured: fullyCaptured.has(n.id)
      };
    }));
  } catch (error) {
    console.error('Get neighborhoods error:', error);
    res.status(500).json({ error: 'Failed to get neighborhoods' });
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
        COUNT(DISTINCT np.neighborhood_id) FILTER (WHERE np.fully_captured = true) as neighborhoods_captured
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
      neighborhood_id: string | null;
      neighborhood_name: string | null;
      boundary_coords: any;
    }>(
      `SELECT z.id, z.name, z.description, z.neighborhood_id,
              n.name as neighborhood_name, z.boundary_coords
       FROM zones z
       LEFT JOIN neighborhoods n ON n.id = z.neighborhood_id`
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
        neighborhoodId: z.neighborhood_id,
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
      neighborhood_id: string | null;
      neighborhood_name: string | null;
      boundary_coords: any;
    }>(
      `SELECT z.id, z.name, z.description, z.neighborhood_id,
              n.name as neighborhood_name, z.boundary_coords
       FROM zones z
       LEFT JOIN neighborhoods n ON n.id = z.neighborhood_id
       WHERE z.id = $1`,
      [id]
    );

    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    const coords = parseBoundaryCoords(zone.boundary_coords);

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
      neighborhoodId: zone.neighborhood_id,
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
