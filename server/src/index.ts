import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { businessesRouter } from './routes/businesses.js';
import { checkinsRouter } from './routes/checkins.js';
import { zonesRouter } from './routes/zones.js';
import { questsRouter } from './routes/quests.js';
import { socialRouter } from './routes/social.js';
import { rewardsRouter } from './routes/rewards.js';
import { businessDashboardRouter } from './routes/business-dashboard.js';
import { paymentsRouter } from './routes/payments.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/businesses', businessesRouter);
app.use('/api/checkins', checkinsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/quests', questsRouter);
app.use('/api/social', socialRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/business-dashboard', businessDashboardRouter);
app.use('/api/payments', paymentsRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Wandr server running on port ${PORT}`);
});

export default app;
