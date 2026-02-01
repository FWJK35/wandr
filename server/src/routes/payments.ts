import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const paymentsRouter = Router();

// Helper: verify user owns business (or allow null business)
async function assertBusinessOwner(userId: string, businessId?: string) {
  if (!businessId) return;
  const biz = await queryOne<{ owner_id: string }>(
    'SELECT owner_id FROM businesses WHERE id = $1',
    [businessId]
  );
  if (!biz || biz.owner_id !== userId) {
    const err: any = new Error('Not authorized for this business');
    err.status = 403;
    throw err;
  }
}

// POST /api/payments/checkout - create mock checkout session
paymentsRouter.post('/checkout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { businessId, amountCents, description, enforceOwner } = req.body;
    const userId = req.user!.id;

    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'amountCents required' });
    }

    if (enforceOwner) {
      await assertBusinessOwner(userId, businessId);
    }

    const sessionId = uuidv4();
    const providerSessionId = `sess_${sessionId.replace(/-/g, '').slice(0, 24)}`;

    await query(
      `INSERT INTO payments (id, user_id, business_id, amount_cents, description, provider_session_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'created', NOW())`,
      [sessionId, userId, businessId || null, amountCents, description || 'Mock checkout', providerSessionId]
    );

    res.status(201).json({
      sessionId,
      providerSessionId,
      checkoutUrl: `https://checkout.stripe.com/pay/${providerSessionId}`,
      clientSecret: `mock_secret_${providerSessionId}`
    });
  } catch (error: any) {
    const status = error?.status || 500;
    console.error('Create checkout error:', error.message);
    res.status(status).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/payments/mock-complete - mark payment succeeded (demo)
paymentsRouter.post('/mock-complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, boostBusiness } = req.body;
    const userId = req.user!.id;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const payment = await queryOne<{
      id: string;
      business_id: string | null;
      status: string;
    }>(
      'SELECT id, business_id, status FROM payments WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (!payment) {
      return res.status(404).json({ error: 'Payment session not found' });
    }

    if (payment.status === 'succeeded') {
      return res.json({ status: 'succeeded', receiptUrl: `https://dashboard.stripe.com/mock/receipts/${sessionId}` });
    }

    // Mark payment as succeeded
    await query(
      `UPDATE payments SET status = 'succeeded', receipt_url = $1, completed_at = NOW() WHERE id = $2`,
      [`https://dashboard.stripe.com/mock/receipts/${sessionId}`, sessionId]
    );

    // Optionally apply boost to business
    if (boostBusiness && payment.business_id) {
      await query(
        `UPDATE businesses SET is_boosted = true, boost_expires_at = NOW() + INTERVAL '7 days' WHERE id = $1`,
        [payment.business_id]
      );
    }

    res.json({
      status: 'succeeded',
      receiptUrl: `https://dashboard.stripe.com/mock/receipts/${sessionId}`
    });
  } catch (error) {
    console.error('Complete payment error:', (error as any).message);
    res.status(500).json({ error: 'Failed to complete payment' });
  }
});

// GET /api/payments/history - list user payments
paymentsRouter.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const payments = await query<{
      id: string;
      business_id: string | null;
      amount_cents: number;
      currency: string;
      description: string;
      status: string;
      receipt_url: string | null;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, business_id, amount_cents, currency, description, status, receipt_url, created_at, completed_at
       FROM payments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json(payments.map(p => ({
      id: p.id,
      businessId: p.business_id,
      amountCents: p.amount_cents,
      currency: p.currency,
      description: p.description,
      status: p.status,
      receiptUrl: p.receipt_url,
      createdAt: p.created_at,
      completedAt: p.completed_at
    })));
  } catch (error) {
    console.error('Payments history error:', (error as any).message);
    res.status(500).json({ error: 'Failed to load payments' });
  }
});
