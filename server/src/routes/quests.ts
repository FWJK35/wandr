import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { buildCandidates, CandidateContext, fetchBusinesses, generateQuestsWithGemini } from '../quests/decisionEngine.js';
import { addMinutes } from '../utils/time.js';

export const questsRouter = Router();

// GET /api/quests - Get available quests
questsRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get quests not yet started by user
    const availableQuests = await query<{
      id: string;
      title: string;
      description: string;
      quest_type: string;
      requirements: any;
      points_reward: number;
      badge_id: string | null;
      badge_name: string | null;
      badge_icon: string | null;
    }>(
      `SELECT
        q.id, q.title, q.description, q.quest_type, q.requirements, q.points_reward,
        b.id as badge_id, b.name as badge_name, b.icon_url as badge_icon
       FROM quests q
       LEFT JOIN badges b ON b.id = q.badge_reward_id
       WHERE q.is_active = true
       AND q.id NOT IN (SELECT quest_id FROM user_quests WHERE user_id = $1)
       ORDER BY q.points_reward ASC`,
      [userId]
    );

    res.json(availableQuests.map(q => ({
      id: q.id,
      title: q.title,
      description: q.description,
      questType: q.quest_type,
      requirements: q.requirements,
      pointsReward: q.points_reward,
      badgeReward: q.badge_id ? {
        id: q.badge_id,
        name: q.badge_name,
        iconUrl: q.badge_icon
      } : null
    })));
  } catch (error) {
    console.error('Get quests error:', error);
    res.status(500).json({ error: 'Failed to get quests' });
  }
});

// GET /api/quests/user-active - Get user's active quests
questsRouter.get('/user-active', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const activeQuests = await query<{
      id: string;
      quest_id: string;
      title: string;
      description: string;
      quest_type: string;
      requirements: any;
      points_reward: number;
      progress: any;
      started_at: Date;
    }>(
      `SELECT
        uq.id, uq.quest_id, q.title, q.description, q.quest_type,
        q.requirements, q.points_reward, uq.progress, uq.started_at
       FROM user_quests uq
       JOIN quests q ON q.id = uq.quest_id
       WHERE uq.user_id = $1 AND uq.completed_at IS NULL
       ORDER BY uq.started_at DESC`,
      [userId]
    );

    res.json(activeQuests.map(q => ({
      id: q.id,
      questId: q.quest_id,
      title: q.title,
      description: q.description,
      questType: q.quest_type,
      requirements: q.requirements,
      pointsReward: q.points_reward,
      progress: q.progress,
      startedAt: q.started_at
    })));
  } catch (error) {
    console.error('Get active quests error:', error);
    res.status(500).json({ error: 'Failed to get active quests' });
  }
});

// POST /api/quests/:id/start - Start a quest
questsRouter.post('/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check quest exists
    const quest = await queryOne<{ id: string; requirements: any }>(
      'SELECT id, requirements FROM quests WHERE id = $1 AND is_active = true',
      [id]
    );

    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    // Check not already started
    const existing = await queryOne(
      'SELECT id FROM user_quests WHERE user_id = $1 AND quest_id = $2',
      [userId, id]
    );

    if (existing) {
      return res.status(409).json({ error: 'Quest already started' });
    }

    // Initialize progress based on requirements
    const initialProgress = initializeQuestProgress(quest.requirements);

    const userQuestId = uuidv4();
    await query(
      `INSERT INTO user_quests (id, user_id, quest_id, progress, started_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userQuestId, userId, id, JSON.stringify(initialProgress)]
    );

    res.status(201).json({
      id: userQuestId,
      questId: id,
      progress: initialProgress
    });
  } catch (error) {
    console.error('Start quest error:', error);
    res.status(500).json({ error: 'Failed to start quest' });
  }
});

// GET /api/quests/completed - Get completed quests
questsRouter.get('/completed', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const completedQuests = await query<{
      id: string;
      quest_id: string;
      title: string;
      description: string;
      points_reward: number;
      started_at: Date;
      completed_at: Date;
    }>(
      `SELECT
        uq.id, uq.quest_id, q.title, q.description, q.points_reward,
        uq.started_at, uq.completed_at
       FROM user_quests uq
       JOIN quests q ON q.id = uq.quest_id
       WHERE uq.user_id = $1 AND uq.completed_at IS NOT NULL
       ORDER BY uq.completed_at DESC`,
      [userId]
    );

    res.json(completedQuests.map(q => ({
      id: q.id,
      questId: q.quest_id,
      title: q.title,
      description: q.description,
      pointsReward: q.points_reward,
      startedAt: q.started_at,
      completedAt: q.completed_at
    })));
  } catch (error) {
    console.error('Get completed quests error:', error);
    res.status(500).json({ error: 'Failed to get completed quests' });
  }
});

// POST /api/quests/generate - generate time-windowed quests via decision engine
questsRouter.post('/generate', async (req, res) => {
  try {
    const { userLat, userLng, weatherTag, windowMinutes } = req.body || {};
    if (typeof userLat !== 'number' || typeof userLng !== 'number') {
      return res.status(400).json({ error: 'userLat and userLng are required numbers' });
    }
    const window = typeof windowMinutes === 'number' && windowMinutes > 0 ? windowMinutes : 120;

    const businesses = await fetchBusinesses();
    const ctx: CandidateContext = { userLat, userLng, weatherTag, windowMinutes: window };
    const candidates = buildCandidates(businesses, ctx);

    const generated = await generateQuestsWithGemini(candidates, ctx);

    // persist generated quests
    const now = new Date();
    const endsAt = addMinutes(now, window);
    for (const q of generated.quests) {
      await execute(
        `INSERT INTO generated_quests
           (quest_id, business_id, type, title, short_prompt, steps_json, points, starts_at, ends_at, suggested_percent_off, safety_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (quest_id) DO NOTHING`,
        [
          q.quest_id,
          q.business_id,
          q.type,
          q.title,
          q.short_prompt,
          JSON.stringify(q.steps || []),
          q.points,
          now,
          endsAt,
          q.suggested_percent_off,
          q.safety_note,
        ]
      );
    }

    return res.json(generated);
  } catch (err: any) {
    console.error('Generate quests error:', err);
    return res.status(500).json({ error: 'Failed to generate quests' });
  }
});

// GET /api/quests/active - active generated quests (time-windowed)
questsRouter.get('/active', async (_req, res) => {
  try {
    const rows = await query<{
      quest_id: string;
      business_id: string;
      type: string;
      title: string;
      short_prompt: string;
      steps_json: any;
      points: number;
      suggested_percent_off: number | null;
      safety_note: string | null;
      starts_at: Date;
      ends_at: Date;
    }>(
      `SELECT quest_id, business_id, type, title, short_prompt, steps_json, points,
              suggested_percent_off, safety_note, starts_at, ends_at
       FROM generated_quests
       WHERE NOW() BETWEEN starts_at AND ends_at
       ORDER BY starts_at DESC
       LIMIT 100`
    );

    return res.json(rows.map(r => ({
      quest_id: r.quest_id,
      business_id: r.business_id,
      type: r.type,
      title: r.title,
      short_prompt: r.short_prompt,
      steps: Array.isArray(r.steps_json) ? r.steps_json : [],
      points: r.points,
      suggested_percent_off: r.suggested_percent_off,
      safety_note: r.safety_note,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
    })));
  } catch (err) {
    console.error('Get active generated quests error:', err);
    return res.status(500).json({ error: 'Failed to fetch active quests' });
  }
});

// POST /api/quests/:id/check - Check quest progress (called after check-in)
questsRouter.post('/:id/check', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const userQuest = await queryOne<{
      id: string;
      quest_id: string;
      progress: any;
    }>(
      `SELECT uq.id, uq.quest_id, uq.progress
       FROM user_quests uq
       WHERE uq.id = $1 AND uq.user_id = $2 AND uq.completed_at IS NULL`,
      [id, userId]
    );

    if (!userQuest) {
      return res.status(404).json({ error: 'Active quest not found' });
    }

    const quest = await queryOne<{
      requirements: any;
      points_reward: number;
      badge_reward_id: string | null;
    }>(
      'SELECT requirements, points_reward, badge_reward_id FROM quests WHERE id = $1',
      [userQuest.quest_id]
    );

    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    // Update progress based on current state
    const updatedProgress = await calculateQuestProgress(userId, quest.requirements, userQuest.progress);
    const isComplete = checkQuestComplete(quest.requirements, updatedProgress);

    if (isComplete) {
      // Complete the quest
      await query(
        `UPDATE user_quests SET progress = $1, completed_at = NOW() WHERE id = $2`,
        [JSON.stringify(updatedProgress), id]
      );

      // Award points
      await query(
        'UPDATE users SET points = points + $1 WHERE id = $2',
        [quest.points_reward, userId]
      );

      // Award badge if applicable
      if (quest.badge_reward_id) {
        await query(
          `INSERT INTO user_badges (user_id, badge_id, earned_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING`,
          [userId, quest.badge_reward_id]
        );
      }

      // Create feed item
      const feedId = uuidv4();
      await query(
        `INSERT INTO feed_items (id, user_id, type, content, created_at)
         VALUES ($1, $2, 'quest_complete', $3, NOW())`,
        [feedId, userId, JSON.stringify({
          questId: userQuest.quest_id,
          pointsEarned: quest.points_reward
        })]
      );

      res.json({
        completed: true,
        progress: updatedProgress,
        pointsEarned: quest.points_reward,
        badgeEarned: quest.badge_reward_id
      });
    } else {
      await query(
        'UPDATE user_quests SET progress = $1 WHERE id = $2',
        [JSON.stringify(updatedProgress), id]
      );

      res.json({
        completed: false,
        progress: updatedProgress
      });
    }
  } catch (error) {
    console.error('Check quest error:', error);
    res.status(500).json({ error: 'Failed to check quest progress' });
  }
});

function initializeQuestProgress(requirements: any): any {
  const progress: any = {};

  if (requirements.visitCount) {
    progress.visitCount = 0;
  }
  if (requirements.uniqueCategories) {
    progress.categoriesVisited = [];
  }
  if (requirements.specificBusinesses) {
    progress.businessesVisited = [];
  }
  if (requirements.zoneCaptures) {
    progress.zonesCaptured = 0;
  }

  return progress;
}

async function calculateQuestProgress(userId: string, requirements: any, currentProgress: any): Promise<any> {
  const progress = { ...currentProgress };

  if (requirements.visitCount) {
    const [result] = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM check_ins WHERE user_id = $1',
      [userId]
    );
    progress.visitCount = parseInt(result?.count || '0');
  }

  if (requirements.uniqueCategories) {
    const categories = await query<{ category: string }>(
      `SELECT DISTINCT b.category
       FROM check_ins c
       JOIN businesses b ON b.id = c.business_id
       WHERE c.user_id = $1`,
      [userId]
    );
    progress.categoriesVisited = categories.map(c => c.category);
  }

  if (requirements.specificBusinesses) {
    const visited = await query<{ business_id: string }>(
      `SELECT DISTINCT business_id FROM check_ins
       WHERE user_id = $1 AND business_id = ANY($2)`,
      [userId, requirements.specificBusinesses]
    );
    progress.businessesVisited = visited.map(v => v.business_id);
  }

  if (requirements.zoneCaptures) {
    const [result] = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM zone_progress WHERE user_id = $1 AND captured = true',
      [userId]
    );
    progress.zonesCaptured = parseInt(result?.count || '0');
  }

  return progress;
}

function checkQuestComplete(requirements: any, progress: any): boolean {
  if (requirements.visitCount && progress.visitCount < requirements.visitCount) {
    return false;
  }
  if (requirements.uniqueCategories && progress.categoriesVisited.length < requirements.uniqueCategories) {
    return false;
  }
  if (requirements.specificBusinesses && progress.businessesVisited.length < requirements.specificBusinesses.length) {
    return false;
  }
  if (requirements.zoneCaptures && progress.zonesCaptured < requirements.zoneCaptures) {
    return false;
  }
  return true;
}
