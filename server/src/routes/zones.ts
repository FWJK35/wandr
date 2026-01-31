import { Router, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { optionalAuth, AuthRequest } from '../middleware/auth.js';

export const zonesRouter = Router();

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

    // Get zones that intersect with viewport
    const zones = await query<{
      id: string;
      name: string;
      boundary: string;
      total_locations: number;
    }>(
      `SELECT
        z.id, z.name,
        ST_AsGeoJSON(z.boundary) as boundary,
        (SELECT COUNT(*) FROM businesses WHERE ST_Contains(z.boundary, location::geometry)) as total_locations
       FROM zones z
       WHERE ST_Intersects(
         z.boundary,
         ST_MakeEnvelope($1, $2, $3, $4, 4326)
       )`,
      [minLng, minLat, maxLng, maxLat]
    );

    // Get user's progress for each zone
    let userProgress: Map<string, { visited: number; captured: boolean }> = new Map();
    if (req.user) {
      const progress = await query<{
        zone_id: string;
        locations_visited: number;
        captured: boolean;
      }>(
        'SELECT zone_id, locations_visited, captured FROM zone_progress WHERE user_id = $1',
        [req.user.id]
      );
      userProgress = new Map(progress.map(p => [p.zone_id, {
        visited: p.locations_visited,
        captured: p.captured
      }]));
    }

    res.json(zones.map(z => {
      const progress = userProgress.get(z.id) || { visited: 0, captured: false };
      return {
        id: z.id,
        name: z.name,
        boundary: JSON.parse(z.boundary),
        totalLocations: z.total_locations,
        visited: progress.visited,
        captured: progress.captured,
        captureThreshold: Math.ceil(z.total_locations * 0.6)
      };
    }));
  } catch (error) {
    console.error('Get zones error:', error);
    res.status(500).json({ error: 'Failed to get zones' });
  }
});

// GET /api/zones/:id - Get zone details
zonesRouter.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const zone = await queryOne<{
      id: string;
      name: string;
      description: string;
      boundary: string;
    }>(
      `SELECT id, name, description, ST_AsGeoJSON(boundary) as boundary
       FROM zones WHERE id = $1`,
      [id]
    );

    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    // Get businesses in zone
    const businesses = await query<{
      id: string;
      name: string;
      category: string;
      latitude: number;
      longitude: number;
    }>(
      `SELECT
        b.id, b.name, b.category,
        ST_Y(b.location::geometry) as latitude,
        ST_X(b.location::geometry) as longitude
       FROM businesses b
       JOIN zones z ON ST_Contains(z.boundary, b.location::geometry)
       WHERE z.id = $1`,
      [id]
    );

    // Get user's visited businesses in zone
    let visitedIds: Set<string> = new Set();
    if (req.user) {
      const visited = await query<{ business_id: string }>(
        `SELECT DISTINCT c.business_id
         FROM check_ins c
         JOIN businesses b ON b.id = c.business_id
         JOIN zones z ON ST_Contains(z.boundary, b.location::geometry)
         WHERE c.user_id = $1 AND z.id = $2`,
        [req.user.id, id]
      );
      visitedIds = new Set(visited.map(v => v.business_id));
    }

    // Get leaderboard for zone
    const leaderboard = await query<{
      user_id: string;
      username: string;
      display_name: string;
      locations_visited: number;
      captured: boolean;
    }>(
      `SELECT
        u.id as user_id, u.username, u.display_name,
        zp.locations_visited, zp.captured
       FROM zone_progress zp
       JOIN users u ON u.id = zp.user_id
       WHERE zp.zone_id = $1
       ORDER BY zp.locations_visited DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      boundary: JSON.parse(zone.boundary),
      businesses: businesses.map(b => ({
        id: b.id,
        name: b.name,
        category: b.category,
        latitude: b.latitude,
        longitude: b.longitude,
        visited: visitedIds.has(b.id)
      })),
      totalLocations: businesses.length,
      visited: visitedIds.size,
      captureThreshold: Math.ceil(businesses.length * 0.6),
      captured: req.user ? visitedIds.size >= Math.ceil(businesses.length * 0.6) : false,
      leaderboard: leaderboard.map((l, i) => ({
        rank: i + 1,
        userId: l.user_id,
        username: l.username,
        displayName: l.display_name,
        locationsVisited: l.locations_visited,
        captured: l.captured
      }))
    });
  } catch (error) {
    console.error('Get zone error:', error);
    res.status(500).json({ error: 'Failed to get zone' });
  }
});

// GET /api/zones/leaderboard - Get zone capture leaderboard
zonesRouter.get('/stats/leaderboard', async (req, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const leaderboard = await query<{
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      zones_captured: string;
    }>(
      `SELECT
        u.id as user_id, u.username, u.display_name, u.avatar_url,
        COUNT(*) FILTER (WHERE zp.captured = true) as zones_captured
       FROM users u
       JOIN zone_progress zp ON zp.user_id = u.id
       GROUP BY u.id
       ORDER BY zones_captured DESC
       LIMIT $1`,
      [limit]
    );

    res.json(leaderboard.map((l, i) => ({
      rank: i + 1,
      userId: l.user_id,
      username: l.username,
      displayName: l.display_name,
      avatarUrl: l.avatar_url,
      zonesCaptured: parseInt(l.zones_captured)
    })));
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});
