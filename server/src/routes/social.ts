import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../db/index.js';
import { authenticate, AuthRequest, optionalAuth } from '../middleware/auth.js';

export const socialRouter = Router();

// GET /api/social/feed - Get activity feed
socialRouter.get('/feed', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const feedType = req.query.type as string || 'all'; // 'all', 'friends', 'following'

    let userFilter = '';
    if (feedType === 'friends') {
      userFilter = `AND (
        fi.user_id IN (
          SELECT user_id FROM friendships WHERE friend_id = $1 AND status = 'accepted'
          UNION
          SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'
        )
        OR fi.user_id = $1
      )`;
    } else if (feedType === 'following') {
      userFilter = `AND (
        fi.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
        OR fi.user_id = $1
      )`;
    }

    const feedItems = await query<{
      id: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      type: string;
      content: any;
      created_at: Date;
      like_count: string;
      comment_count: string;
      user_liked: boolean;
    }>(
      `SELECT
        fi.id, fi.user_id, u.username, u.display_name, u.avatar_url,
        fi.type, fi.content, fi.created_at,
        (SELECT COUNT(*) FROM likes WHERE feed_item_id = fi.id) as like_count,
        (SELECT COUNT(*) FROM comments WHERE feed_item_id = fi.id) as comment_count,
        EXISTS(SELECT 1 FROM likes WHERE feed_item_id = fi.id AND user_id = $1) as user_liked
       FROM feed_items fi
       JOIN users u ON u.id = fi.user_id
       WHERE 1=1 ${userFilter}
       ORDER BY fi.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json(feedItems.map(fi => ({
      id: fi.id,
      user: {
        id: fi.user_id,
        username: fi.username,
        displayName: fi.display_name,
        avatarUrl: fi.avatar_url
      },
      type: fi.type,
      content: fi.content,
      createdAt: fi.created_at,
      likeCount: parseInt(fi.like_count),
      commentCount: parseInt(fi.comment_count),
      userLiked: fi.user_liked
    })));
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// POST /api/social/feed/:id/like - Like a feed item
socialRouter.post('/feed/:id/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check feed item exists
    const feedItem = await queryOne('SELECT id FROM feed_items WHERE id = $1', [id]);
    if (!feedItem) {
      return res.status(404).json({ error: 'Feed item not found' });
    }

    // Toggle like
    const existing = await queryOne(
      'SELECT id FROM likes WHERE feed_item_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existing) {
      await execute('DELETE FROM likes WHERE feed_item_id = $1 AND user_id = $2', [id, userId]);
      res.json({ liked: false });
    } else {
      const likeId = uuidv4();
      await query(
        'INSERT INTO likes (id, feed_item_id, user_id, created_at) VALUES ($1, $2, $3, NOW())',
        [likeId, id, userId]
      );
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to like' });
  }
});

// GET /api/social/feed/:id/comments - Get comments
socialRouter.get('/feed/:id/comments', async (req, res: Response) => {
  try {
    const { id } = req.params;

    const comments = await query<{
      id: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      content: string;
      created_at: Date;
    }>(
      `SELECT
        c.id, c.user_id, u.username, u.display_name, u.avatar_url,
        c.content, c.created_at
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.feed_item_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    res.json(comments.map(c => ({
      id: c.id,
      user: {
        id: c.user_id,
        username: c.username,
        displayName: c.display_name,
        avatarUrl: c.avatar_url
      },
      content: c.content,
      createdAt: c.created_at
    })));
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// POST /api/social/feed/:id/comment - Add comment
socialRouter.post('/feed/:id/comment', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    // Check feed item exists
    const feedItem = await queryOne('SELECT id FROM feed_items WHERE id = $1', [id]);
    if (!feedItem) {
      return res.status(404).json({ error: 'Feed item not found' });
    }

    const commentId = uuidv4();
    await query(
      'INSERT INTO comments (id, feed_item_id, user_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [commentId, id, userId, content.trim()]
    );

    res.status(201).json({
      id: commentId,
      content: content.trim()
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// POST /api/social/friends/request - Send friend request
socialRouter.post('/friends/request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId: friendId } = req.body;
    const userId = req.user!.id;

    if (userId === friendId) {
      return res.status(400).json({ error: 'Cannot friend yourself' });
    }

    // Check friend exists
    const friend = await queryOne('SELECT id FROM users WHERE id = $1', [friendId]);
    if (!friend) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check existing friendship
    const existing = await queryOne(
      `SELECT id, status FROM friendships
       WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [userId, friendId]
    );

    if (existing) {
      return res.status(409).json({ error: 'Friendship already exists', status: (existing as any).status });
    }

    const friendshipId = uuidv4();
    await query(
      `INSERT INTO friendships (id, user_id, friend_id, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [friendshipId, userId, friendId]
    );

    res.status(201).json({ id: friendshipId, status: 'pending' });
  } catch (error) {
    console.error('Friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// POST /api/social/friends/:id/accept - Accept friend request
socialRouter.post('/friends/:id/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await execute(
      `UPDATE friendships SET status = 'accepted'
       WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
      [id, userId]
    );

    if (result === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    res.json({ status: 'accepted' });
  } catch (error) {
    console.error('Accept friend error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// DELETE /api/social/friends/:id - Remove friend
socialRouter.delete('/friends/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await execute(
      `DELETE FROM friendships
       WHERE id = $1 AND (user_id = $2 OR friend_id = $2)`,
      [id, userId]
    );

    if (result === 0) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// GET /api/social/friends - Get friends list
socialRouter.get('/friends', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const friends = await query<{
      friendship_id: string;
      friend_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      points: number;
      level: number;
    }>(
      `SELECT
        f.id as friendship_id,
        CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END as friend_id,
        u.username, u.display_name, u.avatar_url, u.points, u.level
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
       WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'`,
      [userId]
    );

    res.json(friends.map(f => ({
      friendshipId: f.friendship_id,
      id: f.friend_id,
      username: f.username,
      displayName: f.display_name,
      avatarUrl: f.avatar_url,
      points: f.points,
      level: f.level
    })));
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// GET /api/social/friends/pending - Get pending friend requests
socialRouter.get('/friends/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const requests = await query<{
      friendship_id: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      created_at: Date;
    }>(
      `SELECT
        f.id as friendship_id, f.user_id,
        u.username, u.display_name, u.avatar_url,
        f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.user_id
       WHERE f.friend_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json(requests.map(r => ({
      friendshipId: r.friendship_id,
      from: {
        id: r.user_id,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: r.avatar_url
      },
      createdAt: r.created_at
    })));
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ error: 'Failed to get pending requests' });
  }
});

// POST /api/social/follow - Follow a user
socialRouter.post('/follow', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId: followingId } = req.body;
    const userId = req.user!.id;

    if (userId === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const user = await queryOne('SELECT id FROM users WHERE id = $1', [followingId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const followId = uuidv4();
    await query(
      `INSERT INTO follows (id, follower_id, following_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (follower_id, following_id) DO NOTHING`,
      [followId, userId, followingId]
    );

    res.status(201).json({ following: true });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow' });
  }
});

// DELETE /api/social/follow/:id - Unfollow a user
socialRouter.delete('/follow/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id: followingId } = req.params;
    const userId = req.user!.id;

    await execute(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [userId, followingId]
    );

    res.json({ following: false });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ error: 'Failed to unfollow' });
  }
});

// GET /api/social/followers - Get followers
socialRouter.get('/followers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const followers = await query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = $1`,
      [userId]
    );

    res.json(followers.map(f => ({
      id: f.id,
      username: f.username,
      displayName: f.display_name,
      avatarUrl: f.avatar_url
    })));
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to get followers' });
  }
});

// GET /api/social/following - Get following
socialRouter.get('/following', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const following = await query<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = $1`,
      [userId]
    );

    res.json(following.map(f => ({
      id: f.id,
      username: f.username,
      displayName: f.display_name,
      avatarUrl: f.avatar_url
    })));
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to get following' });
  }
});
