import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { calculatePoints } from '../services/points.js';

export const checkinsRouter = Router();

const CHECKIN_RADIUS_METERS = 50; // Must be within 50m to check in
const CHECKIN_COOLDOWN_HOURS = 24; // 24 hour cooldown per business
const ZONE_CAPTURE_POINTS = 25; // Points for capturing a zone
const NEIGHBORHOOD_CAPTURE_POINTS = 50; // Bonus points for capturing entire neighborhood

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
      `SELECT id, name, latitude, longitude FROM businesses WHERE id = $1`,
      [businessId]
    );

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Verify user is within radius
    const distance = calculateDistanceMeters(latitude, longitude, business.latitude, business.longitude);

    if (distance > CHECKIN_RADIUS_METERS) {
      return res.status(400).json({
        error: 'Too far from business',
        distance: Math.round(distance),
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
      `INSERT INTO check_ins (id, user_id, business_id, latitude, longitude, points_earned, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [checkinId, userId, businessId, longitude, latitude, pointsBreakdown.total]
    );

    // Update user points
    await query(
      'UPDATE users SET points = points + $1 WHERE id = $2',
      [pointsBreakdown.total, userId]
    );

    // Update streak
    await updateStreak(userId);

    // Check zone capture
    const zoneCapture = await checkAndUpdateZoneCapture(userId, business.latitude, business.longitude);

    // Add zone/neighborhood bonus points
    let bonusPoints = 0;
    if (zoneCapture.newZoneCaptured) {
      bonusPoints += ZONE_CAPTURE_POINTS;
    }
    if (zoneCapture.newNeighborhoodCaptured) {
      bonusPoints += NEIGHBORHOOD_CAPTURE_POINTS;
    }
    if (bonusPoints > 0) {
      await query(
        'UPDATE users SET points = points + $1 WHERE id = $2',
        [bonusPoints, userId]
      );
    }

    // Create feed item
    const feedId = uuidv4();
    await query(
      `INSERT INTO feed_items (id, user_id, type, content, created_at)
       VALUES ($1, $2, 'checkin', $3, NOW())`,
      [feedId, userId, JSON.stringify({
        businessId,
        businessName: business.name,
        points: pointsBreakdown.total,
        isFirstVisit,
        zoneCaptured: zoneCapture.newZoneCaptured ? zoneCapture.zoneName : null,
        neighborhoodCaptured: zoneCapture.newNeighborhoodCaptured ? zoneCapture.neighborhoodName : null
      })]
    );

    res.status(201).json({
      id: checkinId,
      businessId,
      businessName: business.name,
      points: {
        ...pointsBreakdown,
        zoneCaptureBonus: zoneCapture.newZoneCaptured ? ZONE_CAPTURE_POINTS : 0,
        neighborhoodBonus: zoneCapture.newNeighborhoodCaptured ? NEIGHBORHOOD_CAPTURE_POINTS : 0,
        total: pointsBreakdown.total + bonusPoints
      },
      isFirstVisit,
      zoneCapture: zoneCapture.newZoneCaptured ? {
        zoneId: zoneCapture.zoneId,
        zoneName: zoneCapture.zoneName,
        neighborhoodName: zoneCapture.neighborhoodName
      } : null,
      neighborhoodCapture: zoneCapture.newNeighborhoodCaptured ? {
        neighborhoodId: zoneCapture.neighborhoodId,
        neighborhoodName: zoneCapture.neighborhoodName
      } : null
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
        c.latitude, c.longitude, c.points_earned, c.created_at
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

    // Get zone stats
    const [zoneStats] = await query<{
      zones_captured: string;
    }>(
      `SELECT COUNT(*) as zones_captured
       FROM zone_progress
       WHERE user_id = $1 AND captured = true`,
      [userId]
    );

    // Get neighborhood stats
    const [hoodStats] = await query<{
      neighborhoods_captured: string;
    }>(
      `SELECT COUNT(*) as neighborhoods_captured
       FROM neighborhood_progress
       WHERE user_id = $1 AND fully_captured = true`,
      [userId]
    );

    res.json({
      totalCheckins: parseInt(stats?.total_checkins || '0'),
      uniquePlaces: parseInt(stats?.unique_places || '0'),
      totalPoints: parseInt(stats?.total_points || '0'),
      thisWeek: parseInt(stats?.this_week || '0'),
      zonesCaptured: parseInt(zoneStats?.zones_captured || '0'),
      neighborhoodsCaptured: parseInt(hoodStats?.neighborhoods_captured || '0')
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

async function checkAndUpdateZoneCapture(userId: string, businessLat: number, businessLng: number): Promise<{
  newZoneCaptured: boolean;
  zoneId?: string;
  zoneName?: string;
  neighborhoodId?: string;
  neighborhoodName?: string;
  newNeighborhoodCaptured: boolean;
}> {
  // Get all zones
  const zones = await query<{
    id: string;
    name: string;
    neighborhood_id: string | null;
    boundary_coords: string;
  }>(
    'SELECT id, name, neighborhood_id, boundary_coords FROM zones'
  );

  // Find which zone this business is in
  let matchedZone: { id: string; name: string; neighborhood_id: string | null } | null = null;

  for (const zone of zones) {
    const coords = JSON.parse(zone.boundary_coords) as [number, number][];
    if (pointInPolygon(businessLng, businessLat, coords)) {
      matchedZone = zone;
      break;
    }
  }

  if (!matchedZone) {
    return { newZoneCaptured: false, newNeighborhoodCaptured: false };
  }

  // Check if zone already captured
  const existingProgress = await queryOne<{ captured: boolean }>(
    'SELECT captured FROM zone_progress WHERE user_id = $1 AND zone_id = $2',
    [userId, matchedZone.id]
  );

  if (existingProgress?.captured) {
    return { newZoneCaptured: false, newNeighborhoodCaptured: false };
  }

  // Capture the zone!
  await query(
    `INSERT INTO zone_progress (user_id, zone_id, captured, captured_at)
     VALUES ($1, $2, true, NOW())
     ON CONFLICT (user_id, zone_id)
     DO UPDATE SET captured = true, captured_at = NOW()`,
    [userId, matchedZone.id]
  );

  let neighborhoodName: string | undefined;
  let newNeighborhoodCaptured = false;

  // Check if this completes a neighborhood
  if (matchedZone.neighborhood_id) {
    // Get neighborhood info
    const neighborhood = await queryOne<{ id: string; name: string }>(
      'SELECT id, name FROM neighborhoods WHERE id = $1',
      [matchedZone.neighborhood_id]
    );
    neighborhoodName = neighborhood?.name;

    // Count total zones in neighborhood
    const [totalResult] = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM zones WHERE neighborhood_id = $1',
      [matchedZone.neighborhood_id]
    );
    const totalZones = parseInt(totalResult?.count || '0');

    // Count captured zones in neighborhood
    const [capturedResult] = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM zone_progress zp
       JOIN zones z ON z.id = zp.zone_id
       WHERE zp.user_id = $1 AND z.neighborhood_id = $2 AND zp.captured = true`,
      [userId, matchedZone.neighborhood_id]
    );
    const capturedZones = parseInt(capturedResult?.count || '0');

    // Update neighborhood progress
    const alreadyFullyCaptured = await queryOne<{ fully_captured: boolean }>(
      'SELECT fully_captured FROM neighborhood_progress WHERE user_id = $1 AND neighborhood_id = $2',
      [userId, matchedZone.neighborhood_id]
    );

    const isNowFullyCaptured = capturedZones >= totalZones && totalZones > 0;
    newNeighborhoodCaptured = isNowFullyCaptured && !alreadyFullyCaptured?.fully_captured;

    await query(
      `INSERT INTO neighborhood_progress (user_id, neighborhood_id, zones_captured, total_zones, fully_captured, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, neighborhood_id)
       DO UPDATE SET zones_captured = $3, total_zones = $4, fully_captured = $5,
                     captured_at = CASE WHEN $5 AND NOT neighborhood_progress.fully_captured THEN NOW() ELSE neighborhood_progress.captured_at END`,
      [userId, matchedZone.neighborhood_id, capturedZones, totalZones, isNowFullyCaptured, isNowFullyCaptured ? new Date() : null]
    );
  }

  return {
    newZoneCaptured: true,
    zoneId: matchedZone.id,
    zoneName: matchedZone.name,
    neighborhoodId: matchedZone.neighborhood_id || undefined,
    neighborhoodName,
    newNeighborhoodCaptured
  };
}
