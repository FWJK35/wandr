import { Router, Response } from 'express';
import { query, queryOne } from '../db/index.js';
import { authenticate, AuthRequest, optionalAuth } from '../middleware/auth.js';

export const usersRouter = Router();

// GET /api/users/:id - Get user profile
usersRouter.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await queryOne<{
      id: string;
      username: string;
      display_name: string;
      points: number;
      level: number;
      avatar_url: string | null;
      streak_days: number;
      created_at: Date;
    }>(
      `SELECT id, username, display_name, points, level, avatar_url, streak_days, created_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get check-in count
    const [stats] = await query<{ checkin_count: string; zones_captured: string; badges_earned: string }>(
      `SELECT
        (SELECT COUNT(*) FROM check_ins WHERE user_id = $1) as checkin_count,
        (SELECT COUNT(*) FROM zone_progress WHERE user_id = $1 AND captured = true) as zones_captured,
        (SELECT COUNT(*) FROM user_badges WHERE user_id = $1) as badges_earned`,
      [id]
    );

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      points: user.points,
      level: user.level,
      avatarUrl: user.avatar_url,
      streakDays: user.streak_days,
      createdAt: user.created_at,
      stats: {
        checkins: parseInt(stats?.checkin_count || '0'),
        zonesCaptured: parseInt(stats?.zones_captured || '0'),
        badgesEarned: parseInt(stats?.badges_earned || '0')
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// GET /api/users/:id/badges - Get user badges
usersRouter.get('/:id/badges', async (req, res: Response) => {
  try {
    const { id } = req.params;

    const badges = await query<{
      id: string;
      name: string;
      description: string;
      icon_url: string;
      earned_at: Date;
    }>(
      `SELECT b.id, b.name, b.description, b.icon_url, ub.earned_at
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.earned_at DESC`,
      [id]
    );

    res.json(badges.map(b => ({
      id: b.id,
      name: b.name,
      description: b.description,
      iconUrl: b.icon_url,
      earnedAt: b.earned_at
    })));
  } catch (error) {
    console.error('Get badges error:', error);
    res.status(500).json({ error: 'Failed to get badges' });
  }
});

// GET /api/users/:id/activity - Get user activity
usersRouter.get('/:id/activity', async (req, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const activity = await query<{
      id: string;
      type: string;
      content: any;
      created_at: Date;
    }>(
      `SELECT id, type, content, created_at
       FROM feed_items
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json(activity.map(a => ({
      id: a.id,
      type: a.type,
      content: a.content,
      createdAt: a.created_at
    })));
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

// PUT /api/users/me - Update current user profile
usersRouter.put('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { displayName, avatarUrl } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(displayName);
    }

    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatarUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user!.id);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    res.json({ message: 'Profile updated' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/users/leaderboard - Get leaderboard
usersRouter.get('/leaderboard/all', async (req, res: Response) => {
  try {
    const type = req.query.type as string || 'all-time';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    let timeFilter = '';
    if (type === 'weekly') {
      timeFilter = "WHERE created_at >= NOW() - INTERVAL '7 days'";
    } else if (type === 'monthly') {
      timeFilter = "WHERE created_at >= NOW() - INTERVAL '30 days'";
    }

    const users = await query<{
      id: string;
      username: string;
      display_name: string;
      points: number;
      level: number;
      avatar_url: string | null;
    }>(
      `SELECT id, username, display_name, points, level, avatar_url
       FROM users
       ${timeFilter}
       ORDER BY points DESC
       LIMIT $1`,
      [limit]
    );

    res.json(users.map((u, index) => ({
      rank: index + 1,
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      points: u.points,
      level: u.level,
      avatarUrl: u.avatar_url
    })));
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});
