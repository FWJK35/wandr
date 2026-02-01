import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const rewardsRouter = Router();

// GET /api/rewards - Get available rewards
rewardsRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseFloat(req.query.radius as string) || 5000;

    let locationFilter = '';
    const params: any[] = [];

    if (!isNaN(lat) && !isNaN(lng)) {
      locationFilter = `
        AND b.id IN (
          SELECT id FROM businesses
          WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        )
      `;
      params.push(lng, lat, radius);
    }

    const rewards = await query<{
      id: string;
      title: string;
      description: string;
      points_cost: number;
      reward_type: string;
      value: any;
      business_id: string;
      business_name: string;
      image_url: string | null;
      quantity_remaining: number | null;
      expires_at: Date | null;
    }>(
      `SELECT
        r.id, r.title, r.description, r.points_cost, r.reward_type,
        r.value, r.business_id, b.name as business_name, r.image_url,
        r.quantity_remaining, r.expires_at
       FROM rewards r
       JOIN businesses b ON b.id = r.business_id
       WHERE r.is_active = true
       AND (r.quantity_remaining IS NULL OR r.quantity_remaining > 0)
       AND (r.expires_at IS NULL OR r.expires_at > NOW())
       ${locationFilter}
       ORDER BY r.points_cost ASC`,
      params
    );

    res.json(rewards.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      pointsCost: r.points_cost,
      rewardType: r.reward_type,
      value: r.value,
      business: {
        id: r.business_id,
        name: r.business_name
      },
      imageUrl: r.image_url,
      quantityRemaining: r.quantity_remaining,
      expiresAt: r.expires_at
    })));
  } catch (error) {
    console.error('Get rewards error:', error);
    res.status(500).json({ error: 'Failed to get rewards' });
  }
});

// GET /api/rewards/:id - Get reward details
rewardsRouter.get('/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;

    const reward = await queryOne<{
      id: string;
      title: string;
      description: string;
      points_cost: number;
      reward_type: string;
      value: any;
      business_id: string;
      business_name: string;
      business_address: string;
      image_url: string | null;
      quantity_remaining: number | null;
      expires_at: Date | null;
      terms: string | null;
    }>(
      `SELECT
        r.id, r.title, r.description, r.points_cost, r.reward_type,
        r.value, r.business_id, b.name as business_name, b.address as business_address,
        r.image_url, r.quantity_remaining, r.expires_at, r.terms
       FROM rewards r
       JOIN businesses b ON b.id = r.business_id
       WHERE r.id = $1`,
      [id]
    );

    if (!reward) {
      return res.status(404).json({ error: 'Reward not found' });
    }

    res.json({
      id: reward.id,
      title: reward.title,
      description: reward.description,
      pointsCost: reward.points_cost,
      rewardType: reward.reward_type,
      value: reward.value,
      business: {
        id: reward.business_id,
        name: reward.business_name,
        address: reward.business_address
      },
      imageUrl: reward.image_url,
      quantityRemaining: reward.quantity_remaining,
      expiresAt: reward.expires_at,
      terms: reward.terms
    });
  } catch (error) {
    console.error('Get reward error:', error);
    res.status(500).json({ error: 'Failed to get reward' });
  }
});

// POST /api/rewards/:id/redeem - Redeem a reward
rewardsRouter.post('/:id/redeem', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get reward
    const reward = await queryOne<{
      id: string;
      title: string;
      points_cost: number;
      quantity_remaining: number | null;
      expires_at: Date | null;
      business_id: string;
    }>(
      `SELECT id, title, points_cost, quantity_remaining, expires_at, business_id
       FROM rewards WHERE id = $1 AND is_active = true`,
      [id]
    );

    if (!reward) {
      return res.status(404).json({ error: 'Reward not found' });
    }

    // Check if expired
    if (reward.expires_at && new Date(reward.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reward has expired' });
    }

    // Check quantity
    if (reward.quantity_remaining !== null && reward.quantity_remaining <= 0) {
      return res.status(400).json({ error: 'Reward out of stock' });
    }

    // Points system disabled: allow free redemption

    // Generate redemption code
    const redemptionCode = generateRedemptionCode();
    const redemptionId = uuidv4();

    // Create redemption
    await query(
      `INSERT INTO redemptions (id, user_id, reward_id, redemption_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [redemptionId, userId, id, redemptionCode]
    );

    // Points system disabled: no deduction

    // Decrease quantity if limited
    if (reward.quantity_remaining !== null) {
      await query(
        'UPDATE rewards SET quantity_remaining = quantity_remaining - 1 WHERE id = $1',
        [id]
      );
    }

    res.status(201).json({
      redemptionId,
      redemptionCode,
      reward: {
        id: reward.id,
        title: reward.title
      },
      pointsSpent: reward.points_cost
    });
  } catch (error) {
    console.error('Redeem error:', error);
    res.status(500).json({ error: 'Failed to redeem reward' });
  }
});

// GET /api/rewards/redemptions - Get user's redemptions
rewardsRouter.get('/user/redemptions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = req.query.status as string; // 'pending', 'used', 'expired'

    let statusFilter = '';
    if (status) {
      statusFilter = 'AND red.status = $2';
    }

    const redemptions = await query<{
      id: string;
      redemption_code: string;
      status: string;
      created_at: Date;
      used_at: Date | null;
      reward_id: string;
      reward_title: string;
      business_name: string;
    }>(
      `SELECT
        red.id, red.redemption_code, red.status, red.created_at, red.used_at,
        r.id as reward_id, r.title as reward_title, b.name as business_name
       FROM redemptions red
       JOIN rewards r ON r.id = red.reward_id
       JOIN businesses b ON b.id = r.business_id
       WHERE red.user_id = $1 ${statusFilter}
       ORDER BY red.created_at DESC`,
      status ? [userId, status] : [userId]
    );

    res.json(redemptions.map(r => ({
      id: r.id,
      redemptionCode: r.redemption_code,
      status: r.status,
      createdAt: r.created_at,
      usedAt: r.used_at,
      reward: {
        id: r.reward_id,
        title: r.reward_title
      },
      businessName: r.business_name
    })));
  } catch (error) {
    console.error('Get redemptions error:', error);
    res.status(500).json({ error: 'Failed to get redemptions' });
  }
});

function generateRedemptionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
