import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { calculatePoints, POINTS } from '../services/points.js';

export const checkinsRouter = Router();

const CHECKIN_RADIUS_METERS = 50; // Must be within 50m to check in
const CHECKIN_COOLDOWN_HOURS = 24; // 24 hour cooldown per business

// POST /api/checkins - Create a check-in
checkinsRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, latitude, longitude, friendIds } = req.body;
    const userId = req.user!.id;

    if (!businessId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'businessId, latitude, and longitude are required' });
    }

    // Get business location
    const business = await queryOne<{
      id: string;
      name: string;
      latitude: number;
      longitude: number;
    }>(
      `SELECT id, name,
        ST_Y(location::geometry) as latitude,
        ST_X(location::geometry) as longitude
       FROM businesses WHERE id = $1`,
      [businessId]
    );

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Verify user is within radius using PostGIS
    const [distanceCheck] = await query<{ distance: number }>(
      `SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
      ) as distance`,
      [longitude, latitude, business.longitude, business.latitude]
    );

    if (distanceCheck.distance > CHECKIN_RADIUS_METERS) {
      return res.status(400).json({
        error: 'Too far from business',
        distance: Math.round(distanceCheck.distance),
        maxDistance: CHECKIN_RADIUS_METERS
      });
    }

    // Check cooldown
    const recentCheckin = await queryOne<{ created_at: Date }>(
      `SELECT created_at FROM check_ins
       WHERE user_id = $1 AND business_id = $2
       AND created_at > NOW() - INTERVAL '${CHECKIN_COOLDOWN_HOURS} hours'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, businessId]
    );

    if (recentCheckin) {
      const nextAvailable = new Date(recentCheckin.created_at);
      nextAvailable.setHours(nextAvailable.getHours() + CHECKIN_COOLDOWN_HOURS);
      return res.status(429).json({
        error: 'Check-in cooldown active',
        nextAvailable: nextAvailable.toISOString()
      });
    }

    // Check if this is first visit
    const previousVisit = await queryOne(
      'SELECT id FROM check_ins WHERE user_id = $1 AND business_id = $2 LIMIT 1',
      [userId, businessId]
    );
    const isFirstVisit = !previousVisit;

    // Get active promotions for bonus points
    const [promotion] = await query<{ bonus_points: number }>(
      `SELECT bonus_points FROM promotions
       WHERE business_id = $1 AND NOW() BETWEEN start_time AND end_time
       ORDER BY bonus_points DESC LIMIT 1`,
      [businessId]
    );

    // Calculate points
    const pointsBreakdown = calculatePoints({
      isFirstVisit,
      friendCount: friendIds?.length || 0,
      promotionBonus: promotion?.bonus_points || 0
    });

    // Create check-in
    const checkinId = uuidv4();
    await query(
      `INSERT INTO check_ins (id, user_id, business_id, location, points_earned, created_at)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, NOW())`,
      [checkinId, userId, businessId, longitude, latitude, pointsBreakdown.total]
    );

    // Update user points
    await query(
      'UPDATE users SET points = points + $1 WHERE id = $2',
      [pointsBreakdown.total, userId]
    );

    // Update streak
    await updateStreak(userId);

    // Check zone progress
    const zoneProgress = await updateZoneProgress(userId, businessId);

    // Create feed item
    const feedId = uuidv4();
    await query(
      `INSERT INTO feed_items (id, user_id, type, content, created_at)
       VALUES ($1, $2, 'checkin', $3, NOW())`,
      [feedId, userId, JSON.stringify({
        businessId,
        businessName: business.name,
        points: pointsBreakdown.total,
        isFirstVisit
      })]
    );

    res.status(201).json({
      id: checkinId,
      businessId,
      businessName: business.name,
      points: pointsBreakdown,
      isFirstVisit,
      zoneProgress
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// GET /api/checkins/history - Get user's check-in history
checkinsRouter.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const checkins = await query<{
      id: string;
      business_id: string;
      business_name: string;
      business_category: string;
      latitude: number;
      longitude: number;
      points_earned: number;
      created_at: Date;
    }>(
      `SELECT
        c.id, c.business_id, b.name as business_name, b.category as business_category,
        ST_Y(c.location::geometry) as latitude,
        ST_X(c.location::geometry) as longitude,
        c.points_earned, c.created_at
       FROM check_ins c
       JOIN businesses b ON b.id = c.business_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json(checkins.map(c => ({
      id: c.id,
      businessId: c.business_id,
      businessName: c.business_name,
      businessCategory: c.business_category,
      latitude: c.latitude,
      longitude: c.longitude,
      pointsEarned: c.points_earned,
      createdAt: c.created_at
    })));
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get check-in history' });
  }
});

// GET /api/checkins/stats - Get check-in stats
checkinsRouter.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const [stats] = await query<{
      total_checkins: string;
      unique_places: string;
      total_points: string;
      this_week: string;
    }>(
      `SELECT
        COUNT(*) as total_checkins,
        COUNT(DISTINCT business_id) as unique_places,
        SUM(points_earned) as total_points,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week
       FROM check_ins
       WHERE user_id = $1`,
      [userId]
    );

    res.json({
      totalCheckins: parseInt(stats?.total_checkins || '0'),
      uniquePlaces: parseInt(stats?.unique_places || '0'),
      totalPoints: parseInt(stats?.total_points || '0'),
      thisWeek: parseInt(stats?.this_week || '0')
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

async function updateStreak(userId: string): Promise<void> {
  // Check if user checked in yesterday
  const yesterday = await queryOne(
    `SELECT id FROM check_ins
     WHERE user_id = $1
     AND created_at::date = (CURRENT_DATE - INTERVAL '1 day')::date
     LIMIT 1`,
    [userId]
  );

  if (yesterday) {
    // Continue streak
    await query('UPDATE users SET streak_days = streak_days + 1 WHERE id = $1', [userId]);
  } else {
    // Check if this is first check-in today
    const today = await queryOne(
      `SELECT COUNT(*) as count FROM check_ins
       WHERE user_id = $1 AND created_at::date = CURRENT_DATE`,
      [userId]
    );

    if (parseInt((today as any)?.count || '0') === 1) {
      // Reset streak to 1
      await query('UPDATE users SET streak_days = 1 WHERE id = $1', [userId]);
    }
  }
}

async function updateZoneProgress(userId: string, businessId: string): Promise<any> {
  // Get zone for business
  const zone = await queryOne<{ id: string; name: string; total_locations: number }>(
    `SELECT z.id, z.name,
      (SELECT COUNT(*) FROM businesses WHERE ST_Contains(z.boundary, location::geometry)) as total_locations
     FROM zones z
     JOIN businesses b ON ST_Contains(z.boundary, b.location::geometry)
     WHERE b.id = $1`,
    [businessId]
  );

  if (!zone) return null;

  // Count user's visits in this zone
  const [progress] = await query<{ visited: string }>(
    `SELECT COUNT(DISTINCT c.business_id) as visited
     FROM check_ins c
     JOIN businesses b ON b.id = c.business_id
     JOIN zones z ON ST_Contains(z.boundary, b.location::geometry)
     WHERE c.user_id = $1 AND z.id = $2`,
    [userId, zone.id]
  );

  const visited = parseInt(progress?.visited || '0');
  const captureThreshold = Math.ceil(zone.total_locations * 0.6); // 60% to capture
  const captured = visited >= captureThreshold;

  // Upsert zone progress
  await query(
    `INSERT INTO zone_progress (user_id, zone_id, locations_visited, captured, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, zone_id)
     DO UPDATE SET locations_visited = $3, captured = $4, updated_at = NOW()`,
    [userId, zone.id, visited, captured]
  );

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    visited,
    total: zone.total_locations,
    captureThreshold,
    captured
  };
}
