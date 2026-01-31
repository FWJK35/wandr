import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/index.js';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', async (req, res: Response) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }

    // Check if email or username already exists
    const existing = await queryOne(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );

    if (existing) {
      return res.status(409).json({ error: 'Email or username already taken' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const id = uuidv4();
    await query(
      `INSERT INTO users (id, email, username, password_hash, display_name, points, level, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, 1, NOW())`,
      [id, email.toLowerCase(), username.toLowerCase(), passwordHash, username]
    );

    const user = { id, email: email.toLowerCase(), username: username.toLowerCase() };
    const token = generateToken(user);

    res.status(201).json({
      user: {
        id,
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        displayName: username,
        points: 0,
        level: 1
      },
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await queryOne<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
      display_name: string;
      points: number;
      level: number;
      avatar_url: string | null;
    }>(
      'SELECT id, email, username, password_hash, display_name, points, level, avatar_url FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        points: user.points,
        level: user.level,
        avatarUrl: user.avatar_url
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', authenticate, (req: AuthRequest, res: Response) => {
  // With JWT, logout is handled client-side by removing the token
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne<{
      id: string;
      email: string;
      username: string;
      display_name: string;
      points: number;
      level: number;
      avatar_url: string | null;
      streak_days: number;
      created_at: Date;
    }>(
      `SELECT id, email, username, display_name, points, level, avatar_url, streak_days, created_at
       FROM users WHERE id = $1`,
      [req.user!.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      points: user.points,
      level: user.level,
      avatarUrl: user.avatar_url,
      streakDays: user.streak_days,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});
