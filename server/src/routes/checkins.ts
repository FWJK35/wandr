import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
// Points disabled — keep structure but return zeros
import { calculateQuestProgress, checkQuestComplete } from '../services/questProgress.js';
import { fetchLandmarks, landmarkLegacyId, landmarkStableId } from '../quests/decisionEngine.js';

export const checkinsRouter = Router();

const CHECKIN_RADIUS_METERS = 50; // Must be within 50m to check in
const CHECKIN_COOLDOWN_HOURS = 24; // 24 hour cooldown per business
const ZONE_CAPTURE_POINTS = 25; // Points for capturing a zone
const NEIGHBORHOOD_CAPTURE_POINTS = 50; // Bonus points for capturing entire neighborhood
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QuestCompletion = {
  questId: string;
  questTitle: string;
  pointsEarned: number;
  badgeEarned: string | null;
};

type GeneratedQuestMatch = {
  quest_id: string;
  business_id: string;
  title: string;
  short_prompt: string;
  suggested_percent_off: number | null;
  ends_at: Date;
  is_landmark?: boolean;
};

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

// Helper to safely parse boundary_coords (handles both string and object)
function parseBoundaryCoords(coords: any): [number, number][] {
  if (typeof coords === 'string') {
    return JSON.parse(coords);
  }
  return coords;
}

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
    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    return feature.text || feature.place_name || null;
  } catch (error) {
    console.error('Mapbox reverse geocode error:', error);
    return null;
  }
}

async function hydrateZoneNeighborhoodName(zoneId: string, coords: [number, number][], currentName: string | null) {
  if (currentName) return currentName;
  const centroid = getPolygonCentroid(coords);
  if (!centroid) return null;
  const name = await reverseGeocodeNeighborhood(centroid.lng, centroid.lat);
  if (name) {
    await query('UPDATE zones SET neighborhood_name = $1 WHERE id = $2', [name, zoneId]);
  }
  return name;
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

async function resolveBusinessTarget(requestedBusinessId: string): Promise<{
  business: { id: string; name: string; latitude: number; longitude: number };
  normalizedId: string;
  legacyId?: string;
  isLandmark: boolean;
} | null> {
  const existingBusiness = await queryOne<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }>('SELECT id, name, latitude, longitude FROM businesses WHERE id = $1', [requestedBusinessId]);

  if (existingBusiness) {
    return {
      business: existingBusiness,
      normalizedId: existingBusiness.id,
      isLandmark: false,
    };
  }

  const landmarks = await fetchLandmarks();
  for (const landmark of landmarks) {
    const stableId = landmarkStableId(landmark.name, landmark.latitude, landmark.longitude);
    const legacyId = landmarkLegacyId(landmark.name, landmark.latitude, landmark.longitude);
    if (requestedBusinessId !== stableId && requestedBusinessId !== legacyId) continue;

    if (!isUuid(stableId)) {
      return null;
    }

    await execute(
      `INSERT INTO businesses (id, name, description, category, address, latitude, longitude, tags, is_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId,
        landmark.name,
        landmark.description ?? null,
        landmark.category,
        landmark.name,
        landmark.latitude,
        landmark.longitude,
        ['landmark'],
      ]
    );

    return {
      business: {
        id: stableId,
        name: landmark.name,
        latitude: landmark.latitude,
        longitude: landmark.longitude,
      },
      normalizedId: stableId,
      legacyId,
      isLandmark: true,
    };
  }

  return null;
}

async function findZoneForPoint(lat: number, lng: number): Promise<{
  id: string;
  name: string;
  neighborhood_name: string | null;
  coords: [number, number][];
} | null> {
  const zones = await query<{
    id: string;
    name: string;
    neighborhood_name: string | null;
    boundary_coords: any;
  }>('SELECT id, name, neighborhood_name, boundary_coords FROM zones');

  for (const zone of zones) {
    const coords = parseBoundaryCoords(zone.boundary_coords);
    if (pointInPolygon(lng, lat, coords)) {
      const neighborhoodName = await hydrateZoneNeighborhoodName(zone.id, coords, zone.neighborhood_name);
      return {
        id: zone.id,
        name: zone.name,
        neighborhood_name: neighborhoodName,
        coords,
      };
    }
  }
  return null;
}

async function getBusinessIdsInZone(coords: [number, number][]): Promise<string[]> {
  const businesses = await query<{
    id: string;
    latitude: number;
    longitude: number;
  }>('SELECT id, latitude, longitude FROM businesses');

  return businesses
    .filter((b) => pointInPolygon(b.longitude, b.latitude, coords))
    .map((b) => b.id);
}

async function redeemActiveQuests(userId: string): Promise<QuestCompletion[]> {
  const activeQuests = await query<{
    id: string;
    quest_id: string;
    progress: any;
  }>(
    `SELECT id, quest_id, progress
     FROM user_quests
     WHERE user_id = $1 AND completed_at IS NULL`,
    [userId]
  );

  if (activeQuests.length === 0) return [];

  const completions: QuestCompletion[] = [];

  for (const userQuest of activeQuests) {
    const quest = await queryOne<{
      requirements: any;
      points_reward: number;
      badge_reward_id: string | null;
      title: string;
    }>(
      'SELECT requirements, points_reward, badge_reward_id, title FROM quests WHERE id = $1',
      [userQuest.quest_id]
    );

    if (!quest) continue;

    const updatedProgress = await calculateQuestProgress(userId, quest.requirements, userQuest.progress);
    const isComplete = checkQuestComplete(quest.requirements, updatedProgress);

    if (isComplete) {
      await query(
        `UPDATE user_quests SET progress = $1, completed_at = NOW() WHERE id = $2`,
        [JSON.stringify(updatedProgress), userQuest.id]
      );

      await query(
        'UPDATE users SET points = points + $1 WHERE id = $2',
        [quest.points_reward, userId]
      );

      if (quest.badge_reward_id) {
        await query(
          `INSERT INTO user_badges (user_id, badge_id, earned_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING`,
          [userId, quest.badge_reward_id]
        );
      }

      const feedId = uuidv4();
      await query(
        `INSERT INTO feed_items (id, user_id, type, content, created_at)
         VALUES ($1, $2, 'quest_complete', $3, NOW())`,
        [feedId, userId, JSON.stringify({
          questId: userQuest.quest_id,
          pointsEarned: quest.points_reward
        })]
      );

      completions.push({
        questId: userQuest.quest_id,
        questTitle: quest.title,
        pointsEarned: quest.points_reward,
        badgeEarned: quest.badge_reward_id
      });
    } else {
      await query(
        'UPDATE user_quests SET progress = $1 WHERE id = $2',
        [JSON.stringify(updatedProgress), userQuest.id]
      );
    }
  }

  return completions;
}

async function findQuestEligibility(userId: string, businessId: string, legacyBusinessId?: string): Promise<{
  eligible: boolean;
  generatedQuest?: GeneratedQuestMatch;
}> {
  const generatedQuest = await queryOne<GeneratedQuestMatch>(
    `SELECT g.quest_id, g.business_id, g.title, g.short_prompt, g.suggested_percent_off, g.ends_at,
            CASE
              WHEN b.id IS NULL THEN true
              ELSE COALESCE(b.tags @> ARRAY['landmark'], false)
            END AS is_landmark
     FROM generated_quests g
     LEFT JOIN businesses b ON b.id::text = g.business_id
     WHERE g.business_id = $1 AND NOW() BETWEEN g.starts_at AND g.ends_at
     ORDER BY g.starts_at DESC
     LIMIT 1`,
    [businessId]
  );

  if (!generatedQuest && legacyBusinessId && legacyBusinessId !== businessId) {
    const legacyQuest = await queryOne<GeneratedQuestMatch>(
      `SELECT g.quest_id, g.business_id, g.title, g.short_prompt, g.suggested_percent_off, g.ends_at,
              CASE
                WHEN b.id IS NULL THEN true
                ELSE COALESCE(b.tags @> ARRAY['landmark'], false)
              END AS is_landmark
       FROM generated_quests g
       LEFT JOIN businesses b ON b.id::text = g.business_id
       WHERE g.business_id = $1 AND NOW() BETWEEN g.starts_at AND g.ends_at
       ORDER BY g.starts_at DESC
       LIMIT 1`,
      [legacyBusinessId]
    );
    if (legacyQuest) {
      await execute('UPDATE generated_quests SET business_id = $1 WHERE quest_id = $2', [businessId, legacyQuest.quest_id]);
      legacyQuest.business_id = businessId;
      return { eligible: true, generatedQuest: legacyQuest };
    }
  }

  if (generatedQuest) {
    return { eligible: true, generatedQuest };
  }

  const activeQuests = await query<{
    requirements: any;
  }>(
    `SELECT q.requirements
     FROM user_quests uq
     JOIN quests q ON q.id = uq.quest_id
     WHERE uq.user_id = $1 AND uq.completed_at IS NULL`,
    [userId]
  );

  for (const quest of activeQuests) {
    const requirements = quest.requirements || {};
    const specific = Array.isArray(requirements.specificBusinesses)
      ? requirements.specificBusinesses
      : [];
    if (specific.includes(businessId)) {
      return { eligible: true };
    }

    if (requirements.visitCount || requirements.uniqueCategories || requirements.zoneCaptures) {
      return { eligible: true };
    }
  }

  return { eligible: false };
}

// POST /api/checkins - Create a check-in
checkinsRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId: requestedBusinessId, latitude, longitude, friendIds } = req.body;
    const userId = req.user!.id;

    if (!requestedBusinessId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'businessId, latitude, and longitude are required' });
    }

    const resolved = await resolveBusinessTarget(requestedBusinessId);
    if (!resolved) {
      return res.status(404).json({ error: 'Business not found' });
    }
    const business = resolved.business;
    const businessId = resolved.normalizedId;
    const legacyBusinessId = resolved.legacyId;

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

    const questEligibility = await findQuestEligibility(userId, businessId, legacyBusinessId);
    if (!questEligibility.eligible) {
      return res.status(403).json({
        error: 'No active quest available for this location. Start or claim a quest to check in here.'
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
    const pointsBreakdown = {
      base: 0,
      friendBonus: 0,
      promotionBonus: 0,
      streakBonus: 0,
      total: 0
    };

    // Create check-in
    const checkinId = uuidv4();
    await query(
      `INSERT INTO check_ins (id, user_id, business_id, latitude, longitude, points_earned, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [checkinId, userId, businessId, longitude, latitude, pointsBreakdown.total]
    );

    // Update user points
    // Points system disabled — no user points update

    // Update streak
    await updateStreak(userId);

    // Check zone capture
    const zoneCapture = await checkAndUpdateZoneCapture(userId, business.latitude, business.longitude);

    // Add zone/neighborhood bonus points
    const bonusPoints = 0;

    const questCompletions = await redeemActiveQuests(userId);
    const questBonusPoints = questCompletions.reduce((sum, q) => sum + q.pointsEarned, 0);

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
        questBonus: questBonusPoints,
        total: pointsBreakdown.total + bonusPoints + questBonusPoints
      },
      isFirstVisit,
      zoneCapture: zoneCapture.newZoneCaptured ? {
        zoneId: zoneCapture.zoneId,
        zoneName: zoneCapture.zoneName,
        neighborhoodName: zoneCapture.neighborhoodName
      } : null,
      neighborhoodCapture: zoneCapture.newNeighborhoodCaptured ? {
        neighborhoodName: zoneCapture.neighborhoodName
      } : null,
      questCompletions,
      questRedemption: questEligibility.generatedQuest
        ? {
            questId: questEligibility.generatedQuest.quest_id,
            businessId: questEligibility.generatedQuest.business_id,
            title: questEligibility.generatedQuest.title,
            shortPrompt: questEligibility.generatedQuest.short_prompt,
            suggestedPercentOff: questEligibility.generatedQuest.suggested_percent_off,
            endsAt: questEligibility.generatedQuest.ends_at,
            isLandmark: !!questEligibility.generatedQuest.is_landmark,
          }
        : null,
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// POST /api/checkins/undo - Remove the most recent check-in for a business
checkinsRouter.post('/undo', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.body;
    const userId = req.user!.id;

    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required' });
    }

    const checkin = await queryOne<{
      id: string;
      points_earned: number;
    }>(
      `SELECT id, points_earned
       FROM check_ins
       WHERE user_id = $1 AND business_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, businessId]
    );

    if (!checkin) {
      return res.status(404).json({ error: 'No check-in found to undo' });
    }

    const business = await queryOne<{ latitude: number; longitude: number }>(
      'SELECT latitude, longitude FROM businesses WHERE id = $1',
      [businessId]
    );

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const matchedZone = await findZoneForPoint(business.latitude, business.longitude);

    let wasZoneCaptured = false;
    let wasNeighborhoodCaptured = false;

    if (matchedZone) {
      const zoneProgress = await queryOne<{ captured: boolean }>(
        'SELECT captured FROM zone_progress WHERE user_id = $1 AND zone_id = $2',
        [userId, matchedZone.id]
      );
      wasZoneCaptured = !!zoneProgress?.captured;

      if (matchedZone.neighborhood_name) {
        const neighborhoodProgress = await queryOne<{ fully_captured: boolean }>(
          'SELECT fully_captured FROM neighborhood_progress WHERE user_id = $1 AND neighborhood_name = $2',
          [userId, matchedZone.neighborhood_name]
        );
        wasNeighborhoodCaptured = !!neighborhoodProgress?.fully_captured;
      }
    }

    await query('DELETE FROM check_ins WHERE id = $1', [checkin.id]);

    let nowZoneCaptured = false;
    let nowNeighborhoodCaptured = false;

    if (matchedZone) {
      const businessIdsInZone = await getBusinessIdsInZone(matchedZone.coords);
      if (businessIdsInZone.length > 0) {
        const [remaining] = await query<{ count: string }>(
          `SELECT COUNT(*) as count
           FROM check_ins
           WHERE user_id = $1 AND business_id = ANY($2::uuid[])`,
          [userId, businessIdsInZone]
        );
        nowZoneCaptured = parseInt(remaining?.count || '0') > 0;
      }

      if (nowZoneCaptured) {
        await query(
          `INSERT INTO zone_progress (user_id, zone_id, captured, captured_at)
           VALUES ($1, $2, true, NOW())
           ON CONFLICT (user_id, zone_id)
           DO UPDATE SET captured = true, captured_at = COALESCE(zone_progress.captured_at, NOW())`,
          [userId, matchedZone.id]
        );
      } else {
        await query(
          `UPDATE zone_progress
           SET captured = false, captured_at = NULL
           WHERE user_id = $1 AND zone_id = $2`,
          [userId, matchedZone.id]
        );
      }

      if (matchedZone.neighborhood_name) {
        const [totalResult] = await query<{ count: string }>(
          'SELECT COUNT(*) as count FROM zones WHERE neighborhood_name = $1',
          [matchedZone.neighborhood_name]
        );
        const totalZones = parseInt(totalResult?.count || '0');

        const [capturedResult] = await query<{ count: string }>(
          `SELECT COUNT(*) as count
           FROM zone_progress zp
           JOIN zones z ON z.id = zp.zone_id
           WHERE zp.user_id = $1 AND z.neighborhood_name = $2 AND zp.captured = true`,
          [userId, matchedZone.neighborhood_name]
        );
        const capturedZones = parseInt(capturedResult?.count || '0');

        nowNeighborhoodCaptured = totalZones > 0 && capturedZones >= totalZones;

        await query(
          `INSERT INTO neighborhood_progress (user_id, neighborhood_name, zones_captured, total_zones, fully_captured, captured_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, neighborhood_name)
           DO UPDATE SET zones_captured = $3, total_zones = $4, fully_captured = $5,
                         captured_at = CASE WHEN $5 THEN COALESCE(neighborhood_progress.captured_at, NOW()) ELSE NULL END`,
          [
            userId,
            matchedZone.neighborhood_name,
            capturedZones,
            totalZones,
            nowNeighborhoodCaptured,
            nowNeighborhoodCaptured ? new Date() : null,
          ]
        );
      }
    }

    let pointsRemoved = checkin.points_earned;
    if (wasZoneCaptured && !nowZoneCaptured) {
      pointsRemoved += ZONE_CAPTURE_POINTS;
    }
    if (wasNeighborhoodCaptured && !nowNeighborhoodCaptured) {
      pointsRemoved += NEIGHBORHOOD_CAPTURE_POINTS;
    }

    if (pointsRemoved > 0) {
      await query(
        'UPDATE users SET points = GREATEST(points - $1, 0) WHERE id = $2',
        [pointsRemoved, userId]
      );
    }

    res.json({
      removedCheckinId: checkin.id,
      pointsRemoved,
      zoneCaptureRemoved: wasZoneCaptured && !nowZoneCaptured,
      neighborhoodCaptureRemoved: wasNeighborhoodCaptured && !nowNeighborhoodCaptured,
    });
  } catch (error) {
    console.error('Undo check-in error:', error);
    res.status(500).json({ error: 'Undo check-in failed' });
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
  neighborhoodName?: string;
  newNeighborhoodCaptured: boolean;
}> {
  // Get all zones
  const zones = await query<{
    id: string;
    name: string;
    neighborhood_name: string | null;
    boundary_coords: any;
  }>(
    'SELECT id, name, neighborhood_name, boundary_coords FROM zones'
  );

  // Find which zone this business is in
  let matchedZone: { id: string; name: string; neighborhood_name: string | null } | null = null;
  let matchedCoords: [number, number][] | null = null;

  for (const zone of zones) {
    const coords = parseBoundaryCoords(zone.boundary_coords);
    if (pointInPolygon(businessLng, businessLat, coords)) {
      matchedZone = zone;
      matchedCoords = coords;
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
  if (matchedZone.neighborhood_name || matchedCoords) {
    const hydratedName = matchedCoords
      ? await hydrateZoneNeighborhoodName(matchedZone.id, matchedCoords, matchedZone.neighborhood_name)
      : matchedZone.neighborhood_name;
    if (!hydratedName) {
      return {
        newZoneCaptured: true,
        zoneId: matchedZone.id,
        zoneName: matchedZone.name,
        newNeighborhoodCaptured
      };
    }
    neighborhoodName = hydratedName;

    // Count total zones in neighborhood
    const [totalResult] = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM zones WHERE neighborhood_name = $1',
      [hydratedName]
    );
    const totalZones = parseInt(totalResult?.count || '0');

    // Count captured zones in neighborhood
    const [capturedResult] = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM zone_progress zp
       JOIN zones z ON z.id = zp.zone_id
       WHERE zp.user_id = $1 AND z.neighborhood_name = $2 AND zp.captured = true`,
      [userId, hydratedName]
    );
    const capturedZones = parseInt(capturedResult?.count || '0');

    // Update neighborhood progress
    const alreadyFullyCaptured = await queryOne<{ fully_captured: boolean }>(
      'SELECT fully_captured FROM neighborhood_progress WHERE user_id = $1 AND neighborhood_name = $2',
      [userId, hydratedName]
    );

    const isNowFullyCaptured = capturedZones >= totalZones && totalZones > 0;
    newNeighborhoodCaptured = isNowFullyCaptured && !alreadyFullyCaptured?.fully_captured;

    await query(
      `INSERT INTO neighborhood_progress (user_id, neighborhood_name, zones_captured, total_zones, fully_captured, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, neighborhood_name)
       DO UPDATE SET zones_captured = $3, total_zones = $4, fully_captured = $5,
                     captured_at = CASE WHEN $5 AND NOT neighborhood_progress.fully_captured THEN NOW() ELSE neighborhood_progress.captured_at END`,
      [userId, hydratedName, capturedZones, totalZones, isNowFullyCaptured, isNowFullyCaptured ? new Date() : null]
    );
  }

  return {
    newZoneCaptured: true,
    zoneId: matchedZone.id,
    zoneName: matchedZone.name,
    neighborhoodName,
    newNeighborhoodCaptured
  };
}
