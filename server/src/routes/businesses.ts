import { Router, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { optionalAuth, AuthRequest } from '../middleware/auth.js';

export const businessesRouter = Router();

// Helper function to calculate distance in meters using Haversine formula
function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// GET /api/businesses - Get nearby businesses
businessesRouter.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseFloat(req.query.radius as string) || 1000; // meters
    const category = req.query.category as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    // Calculate bounding box for efficient query
    const latDelta = radius / 111320;
    const lngDelta = radius / (111320 * Math.cos(lat * Math.PI / 180));

    let categoryFilter = '';
    const params: any[] = [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta, limit];

    if (category) {
      categoryFilter = 'AND category = $6';
      params.push(category);
    }

    const businesses = await query<{
      id: string;
      name: string;
      description: string;
      category: string;
      address: string;
      latitude: number;
      longitude: number;
      image_url: string | null;
      is_boosted: boolean;
    }>(
      `SELECT id, name, description, category, address, latitude, longitude, image_url, is_boosted
       FROM businesses
       WHERE latitude BETWEEN $1 AND $2
       AND longitude BETWEEN $3 AND $4
       ${categoryFilter}
       ORDER BY is_boosted DESC
       LIMIT $5`,
      params
    );

    // Calculate distance and filter by radius
    const businessesWithDistance = businesses
      .map(b => ({
        ...b,
        distance: calculateDistanceMeters(lat, lng, b.latitude, b.longitude)
      }))
      .filter(b => b.distance <= radius)
      .sort((a, b) => {
        if (a.is_boosted !== b.is_boosted) return b.is_boosted ? 1 : -1;
        return a.distance - b.distance;
      });

    // If user is logged in, check which businesses they've visited
    let visitedIds: Set<string> = new Set();
    if (req.user) {
      const visited = await query<{ business_id: string }>(
        'SELECT DISTINCT business_id FROM check_ins WHERE user_id = $1',
        [req.user.id]
      );
      visitedIds = new Set(visited.map(v => v.business_id));
    }

    res.json(businessesWithDistance.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      category: b.category,
      address: b.address,
      latitude: b.latitude,
      longitude: b.longitude,
      imageUrl: b.image_url,
      isBoosted: b.is_boosted,
      distance: Math.round(b.distance),
      visited: visitedIds.has(b.id)
    })));
  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({ error: 'Failed to get businesses' });
  }
});

// GET /api/businesses/:id - Get business details
businessesRouter.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const business = await queryOne<{
      id: string;
      name: string;
      description: string;
      category: string;
      address: string;
      latitude: number;
      longitude: number;
      image_url: string | null;
      phone: string | null;
      website: string | null;
      hours: any;
      is_boosted: boolean;
      owner_id: string | null;
    }>(
      `SELECT id, name, description, category, address, latitude, longitude,
              image_url, phone, website, hours, is_boosted, owner_id
       FROM businesses
       WHERE id = $1`,
      [id]
    );

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get check-in stats
    const [stats] = await query<{ total_checkins: string; unique_visitors: string }>(
      `SELECT
        COUNT(*) as total_checkins,
        COUNT(DISTINCT user_id) as unique_visitors
       FROM check_ins
       WHERE business_id = $1`,
      [id]
    );

    // Get active promotions
    const promotions = await query<{
      id: string;
      title: string;
      description: string;
      bonus_points: number;
      discount_percent: number | null;
      start_time: Date;
      end_time: Date;
    }>(
      `SELECT id, title, description, bonus_points, discount_percent, start_time, end_time
       FROM promotions
       WHERE business_id = $1 AND NOW() BETWEEN start_time AND end_time`,
      [id]
    );

    // Get active challenges
    const challenges = await query<{
      id: string;
      title: string;
      description: string;
      points_reward: number;
      challenge_type: string;
    }>(
      `SELECT id, title, description, points_reward, challenge_type
       FROM challenges
       WHERE business_id = $1 AND is_active = true`,
      [id]
    );

    // Check if user has visited
    let visited = false;
    let lastVisit = null;
    if (req.user) {
      const checkin = await queryOne<{ created_at: Date }>(
        'SELECT created_at FROM check_ins WHERE user_id = $1 AND business_id = $2 ORDER BY created_at DESC LIMIT 1',
        [req.user.id, id]
      );
      visited = !!checkin;
      lastVisit = checkin?.created_at || null;
    }

    res.json({
      id: business.id,
      name: business.name,
      description: business.description,
      category: business.category,
      address: business.address,
      latitude: business.latitude,
      longitude: business.longitude,
      imageUrl: business.image_url,
      phone: business.phone,
      website: business.website,
      hours: business.hours,
      isBoosted: business.is_boosted,
      stats: {
        totalCheckins: parseInt(stats?.total_checkins || '0'),
        uniqueVisitors: parseInt(stats?.unique_visitors || '0')
      },
      promotions: promotions.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        bonusPoints: p.bonus_points,
        discountPercent: p.discount_percent,
        startTime: p.start_time,
        endTime: p.end_time
      })),
      challenges: challenges.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        pointsReward: c.points_reward,
        challengeType: c.challenge_type
      })),
      visited,
      lastVisit
    });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Failed to get business' });
  }
});

// GET /api/businesses/categories - Get all categories
businessesRouter.get('/meta/categories', async (req, res: Response) => {
  try {
    const categories = await query<{ category: string; count: string }>(
      `SELECT category, COUNT(*) as count
       FROM businesses
       GROUP BY category
       ORDER BY count DESC`
    );

    res.json(categories.map(c => ({
      name: c.category,
      count: parseInt(c.count)
    })));
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});
