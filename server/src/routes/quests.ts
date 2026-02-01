import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { buildCandidates, buildLandmarkCandidates, CandidateContext, fetchBusinesses, fetchLandmarks, generateLandmarkQuestsWithGemini, generateQuestsWithGemini, landmarkLegacyId, landmarkStableId } from '../quests/decisionEngine.js';
import { addMinutes } from '../utils/time.js';
import { initializeQuestProgress, calculateQuestProgress, checkQuestComplete } from '../services/questProgress.js';

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
    const baseWindow = typeof windowMinutes === 'number' && windowMinutes > 0 ? windowMinutes : 120;

    const businesses = await fetchBusinesses();
    const ctx: CandidateContext = { userLat, userLng, weatherTag, windowMinutes: baseWindow };
    const candidates = buildCandidates(businesses, ctx);

    const generated = await generateQuestsWithGemini(candidates, ctx);

    // persist generated quests
    const now = new Date();
    const endsAt = addMinutes(now, baseWindow);
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

// POST /api/quests/generate-landmarks - landmark-focused quests
questsRouter.post('/generate-landmarks', async (req, res) => {
  try {
    const { userLat, userLng, weatherTag, windowMinutes } = req.body || {};
    if (typeof userLat !== 'number' || typeof userLng !== 'number') {
      return res.status(400).json({ error: 'userLat and userLng are required numbers' });
    }
    const window = typeof windowMinutes === 'number' && windowMinutes > 0 ? windowMinutes : 120;

    const landmarks = await fetchLandmarks();
    const ctx: CandidateContext = { userLat, userLng, weatherTag, windowMinutes: window };
    const candidates = buildLandmarkCandidates(landmarks, ctx);

    const generated = await generateLandmarkQuestsWithGemini(candidates, ctx);

    const now = new Date();
    const endsAt = addMinutes(now, window);
    for (const q of generated.quests) {
      const coupon = q.suggested_percent_off;
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
          coupon,
          q.safety_note,
        ]
      );
    }

    return res.json(generated);
  } catch (err: any) {
    console.error('Generate landmark quests error:', err);
    return res.status(500).json({ error: 'Failed to generate landmark quests' });
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
      is_landmark: boolean;
    }>(
      `SELECT g.quest_id, g.business_id, g.type, g.title, g.short_prompt, g.steps_json, g.points,
              g.suggested_percent_off, g.safety_note, g.starts_at, g.ends_at,
              CASE
                WHEN b.id IS NULL THEN true
                ELSE COALESCE(b.tags @> ARRAY['landmark'], false)
              END AS is_landmark
       FROM generated_quests g
       LEFT JOIN businesses b ON b.id::text = g.business_id
       WHERE NOW() BETWEEN g.starts_at AND g.ends_at
       ORDER BY g.starts_at DESC
       LIMIT 100`
    );

    const landmarks = await fetchLandmarks();
    const legacyMap = new Map<string, { name: string; latitude: number; longitude: number }>();
    const stableMap = new Map<string, { name: string; latitude: number; longitude: number }>();
    landmarks.forEach((l) => {
      legacyMap.set(landmarkLegacyId(l.name, l.latitude, l.longitude), l);
      stableMap.set(landmarkStableId(l.name, l.latitude, l.longitude), l);
    });

    const mapped = await Promise.all(rows.map(async (r) => {
      let businessId = r.business_id;
      let isLandmark = !!r.is_landmark;
      if (isLandmark) {
        if (legacyMap.has(businessId)) {
          const landmark = legacyMap.get(businessId)!;
          const stableId = landmarkStableId(landmark.name, landmark.latitude, landmark.longitude);
          if (stableId !== businessId) {
            await execute('UPDATE generated_quests SET business_id = $1 WHERE quest_id = $2', [stableId, r.quest_id]);
            businessId = stableId;
          }
        } else if (stableMap.has(businessId)) {
          isLandmark = true;
        }
      }
      return {
        quest_id: r.quest_id,
        business_id: businessId,
        type: r.type,
        title: r.title,
        short_prompt: r.short_prompt,
        steps: Array.isArray(r.steps_json) ? r.steps_json : [],
        points: r.points,
        suggested_percent_off: r.suggested_percent_off,
        safety_note: r.safety_note,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        is_landmark: isLandmark,
      };
    }));

    return res.json(mapped);
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

      // Points system disabled — skip user points award
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
