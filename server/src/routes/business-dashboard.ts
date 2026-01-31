import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const businessDashboardRouter = Router();

// Middleware to verify business owner
async function verifyBusinessOwner(req: AuthRequest, res: Response, next: Function) {
  const businessId = req.params.businessId || req.body.businessId;
  const userId = req.user!.id;

  const business = await queryOne<{ owner_id: string }>(
    'SELECT owner_id FROM businesses WHERE id = $1',
    [businessId]
  );

  if (!business || business.owner_id !== userId) {
    return res.status(403).json({ error: 'Not authorized for this business' });
  }

  next();
}

// GET /api/business-dashboard/my-businesses - Get businesses owned by user
businessDashboardRouter.get('/my-businesses', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const businesses = await query<{
      id: string;
      name: string;
      category: string;
      is_verified: boolean;
      is_boosted: boolean;
      created_at: Date;
    }>(
      `SELECT id, name, category, is_verified, is_boosted, created_at
       FROM businesses WHERE owner_id = $1`,
      [userId]
    );

    res.json(businesses.map(b => ({
      id: b.id,
      name: b.name,
      category: b.category,
      isVerified: b.is_verified,
      isBoosted: b.is_boosted,
      createdAt: b.created_at
    })));
  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({ error: 'Failed to get businesses' });
  }
});

// GET /api/business-dashboard/:businessId/analytics - Get business analytics
businessDashboardRouter.get('/:businessId/analytics', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const period = req.query.period as string || '30d';

    let interval = '30 days';
    if (period === '7d') interval = '7 days';
    else if (period === '90d') interval = '90 days';

    // Total stats
    const [totalStats] = await query<{
      total_checkins: string;
      unique_visitors: string;
      repeat_visitors: string;
    }>(
      `SELECT
        COUNT(*) as total_checkins,
        COUNT(DISTINCT user_id) as unique_visitors,
        COUNT(*) - COUNT(DISTINCT user_id) as repeat_visitors
       FROM check_ins
       WHERE business_id = $1 AND created_at > NOW() - INTERVAL '${interval}'`,
      [businessId]
    );

    // Daily check-ins
    const dailyCheckins = await query<{
      date: Date;
      count: string;
    }>(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM check_ins
       WHERE business_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [businessId]
    );

    // Check-ins by hour
    const hourlyCheckins = await query<{
      hour: number;
      count: string;
    }>(
      `SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
       FROM check_ins
       WHERE business_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [businessId]
    );

    // Promotion performance
    const promotionStats = await query<{
      promotion_id: string;
      title: string;
      checkins_during: string;
    }>(
      `SELECT
        p.id as promotion_id, p.title,
        COUNT(c.id) as checkins_during
       FROM promotions p
       LEFT JOIN check_ins c ON c.business_id = p.business_id
         AND c.created_at BETWEEN p.start_time AND p.end_time
       WHERE p.business_id = $1
       GROUP BY p.id, p.title`,
      [businessId]
    );

    res.json({
      period,
      totalCheckins: parseInt(totalStats?.total_checkins || '0'),
      uniqueVisitors: parseInt(totalStats?.unique_visitors || '0'),
      repeatVisitors: parseInt(totalStats?.repeat_visitors || '0'),
      dailyCheckins: dailyCheckins.map(d => ({
        date: d.date,
        count: parseInt(d.count)
      })),
      hourlyDistribution: hourlyCheckins.map(h => ({
        hour: h.hour,
        count: parseInt(h.count)
      })),
      promotionPerformance: promotionStats.map(p => ({
        promotionId: p.promotion_id,
        title: p.title,
        checkinsDuring: parseInt(p.checkins_during)
      }))
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// POST /api/business-dashboard/:businessId/promotions - Create promotion
businessDashboardRouter.post('/:businessId/promotions', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const { title, description, bonusPoints, discountPercent, startTime, endTime } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({ error: 'Title, startTime, and endTime are required' });
    }

    const promotionId = uuidv4();
    await query(
      `INSERT INTO promotions (id, business_id, title, description, bonus_points, discount_percent, start_time, end_time, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [promotionId, businessId, title, description, bonusPoints || 0, discountPercent, startTime, endTime]
    );

    res.status(201).json({
      id: promotionId,
      title,
      description,
      bonusPoints: bonusPoints || 0,
      discountPercent,
      startTime,
      endTime
    });
  } catch (error) {
    console.error('Create promotion error:', error);
    res.status(500).json({ error: 'Failed to create promotion' });
  }
});

// GET /api/business-dashboard/:businessId/promotions - Get promotions
businessDashboardRouter.get('/:businessId/promotions', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;

    const promotions = await query<{
      id: string;
      title: string;
      description: string;
      bonus_points: number;
      discount_percent: number | null;
      start_time: Date;
      end_time: Date;
      created_at: Date;
    }>(
      `SELECT id, title, description, bonus_points, discount_percent, start_time, end_time, created_at
       FROM promotions WHERE business_id = $1 ORDER BY start_time DESC`,
      [businessId]
    );

    res.json(promotions.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      bonusPoints: p.bonus_points,
      discountPercent: p.discount_percent,
      startTime: p.start_time,
      endTime: p.end_time,
      createdAt: p.created_at,
      isActive: new Date() >= new Date(p.start_time) && new Date() <= new Date(p.end_time)
    })));
  } catch (error) {
    console.error('Get promotions error:', error);
    res.status(500).json({ error: 'Failed to get promotions' });
  }
});

// DELETE /api/business-dashboard/:businessId/promotions/:promotionId - Delete promotion
businessDashboardRouter.delete('/:businessId/promotions/:promotionId', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, promotionId } = req.params;

    const result = await execute(
      'DELETE FROM promotions WHERE id = $1 AND business_id = $2',
      [promotionId, businessId]
    );

    if (result === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    res.json({ message: 'Promotion deleted' });
  } catch (error) {
    console.error('Delete promotion error:', error);
    res.status(500).json({ error: 'Failed to delete promotion' });
  }
});

// POST /api/business-dashboard/:businessId/challenges - Create challenge
businessDashboardRouter.post('/:businessId/challenges', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const { title, description, challengeType, pointsReward, verificationMethod } = req.body;

    if (!title || !challengeType || !pointsReward) {
      return res.status(400).json({ error: 'Title, challengeType, and pointsReward are required' });
    }

    const challengeId = uuidv4();
    await query(
      `INSERT INTO challenges (id, business_id, title, description, challenge_type, points_reward, verification_method, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())`,
      [challengeId, businessId, title, description, challengeType, pointsReward, verificationMethod || 'checkin']
    );

    res.status(201).json({
      id: challengeId,
      title,
      description,
      challengeType,
      pointsReward,
      verificationMethod: verificationMethod || 'checkin',
      isActive: true
    });
  } catch (error) {
    console.error('Create challenge error:', error);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// GET /api/business-dashboard/:businessId/challenges - Get challenges
businessDashboardRouter.get('/:businessId/challenges', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;

    const challenges = await query<{
      id: string;
      title: string;
      description: string;
      challenge_type: string;
      points_reward: number;
      verification_method: string;
      is_active: boolean;
      completions: string;
    }>(
      `SELECT
        c.id, c.title, c.description, c.challenge_type, c.points_reward,
        c.verification_method, c.is_active,
        (SELECT COUNT(*) FROM challenge_completions WHERE challenge_id = c.id) as completions
       FROM challenges c
       WHERE c.business_id = $1
       ORDER BY c.created_at DESC`,
      [businessId]
    );

    res.json(challenges.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      challengeType: c.challenge_type,
      pointsReward: c.points_reward,
      verificationMethod: c.verification_method,
      isActive: c.is_active,
      completions: parseInt(c.completions)
    })));
  } catch (error) {
    console.error('Get challenges error:', error);
    res.status(500).json({ error: 'Failed to get challenges' });
  }
});

// PUT /api/business-dashboard/:businessId/challenges/:challengeId - Update challenge
businessDashboardRouter.put('/:businessId/challenges/:challengeId', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, challengeId } = req.params;
    const { isActive } = req.body;

    const result = await execute(
      'UPDATE challenges SET is_active = $1 WHERE id = $2 AND business_id = $3',
      [isActive, challengeId, businessId]
    );

    if (result === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    res.json({ isActive });
  } catch (error) {
    console.error('Update challenge error:', error);
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

// POST /api/business-dashboard/:businessId/rewards - Create reward
businessDashboardRouter.post('/:businessId/rewards', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const { title, description, pointsCost, rewardType, value, imageUrl, quantity, expiresAt, terms } = req.body;

    if (!title || !pointsCost || !rewardType) {
      return res.status(400).json({ error: 'Title, pointsCost, and rewardType are required' });
    }

    const rewardId = uuidv4();
    await query(
      `INSERT INTO rewards (id, business_id, title, description, points_cost, reward_type, value, image_url, quantity_remaining, expires_at, terms, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW())`,
      [rewardId, businessId, title, description, pointsCost, rewardType, JSON.stringify(value), imageUrl, quantity, expiresAt, terms]
    );

    res.status(201).json({
      id: rewardId,
      title,
      description,
      pointsCost,
      rewardType,
      value,
      imageUrl,
      quantityRemaining: quantity,
      expiresAt,
      terms
    });
  } catch (error) {
    console.error('Create reward error:', error);
    res.status(500).json({ error: 'Failed to create reward' });
  }
});

// POST /api/business-dashboard/:businessId/verify-redemption - Verify redemption code
businessDashboardRouter.post('/:businessId/verify-redemption', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const { redemptionCode } = req.body;

    const redemption = await queryOne<{
      id: string;
      status: string;
      user_id: string;
      username: string;
      reward_title: string;
      created_at: Date;
    }>(
      `SELECT
        red.id, red.status, red.user_id, u.username,
        r.title as reward_title, red.created_at
       FROM redemptions red
       JOIN rewards r ON r.id = red.reward_id
       JOIN users u ON u.id = red.user_id
       WHERE red.redemption_code = $1 AND r.business_id = $2`,
      [redemptionCode.toUpperCase(), businessId]
    );

    if (!redemption) {
      return res.status(404).json({ error: 'Redemption not found' });
    }

    if (redemption.status === 'used') {
      return res.status(400).json({ error: 'Redemption already used' });
    }

    // Mark as used
    await execute(
      `UPDATE redemptions SET status = 'used', used_at = NOW() WHERE id = $1`,
      [redemption.id]
    );

    res.json({
      valid: true,
      redemptionId: redemption.id,
      user: {
        id: redemption.user_id,
        username: redemption.username
      },
      rewardTitle: redemption.reward_title,
      createdAt: redemption.created_at
    });
  } catch (error) {
    console.error('Verify redemption error:', error);
    res.status(500).json({ error: 'Failed to verify redemption' });
  }
});

// PUT /api/business-dashboard/:businessId/boost - Toggle business boost
businessDashboardRouter.put('/:businessId/boost', authenticate, verifyBusinessOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId } = req.params;
    const { boost } = req.body;

    // In production, this would integrate with Stripe for payment
    await execute(
      'UPDATE businesses SET is_boosted = $1 WHERE id = $2',
      [boost, businessId]
    );

    res.json({ isBoosted: boost });
  } catch (error) {
    console.error('Boost error:', error);
    res.status(500).json({ error: 'Failed to update boost' });
  }
});
