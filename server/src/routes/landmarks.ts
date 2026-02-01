import { Router } from 'express';
import { fetchLandmarks, landmarkStableId } from '../quests/decisionEngine.js';

export const landmarksRouter = Router();

// GET /api/landmarks - list landmark points
landmarksRouter.get('/', async (req, res) => {
  try {
    const landmarks = await fetchLandmarks();

    const minLat = req.query.minLat ? Number(req.query.minLat) : null;
    const maxLat = req.query.maxLat ? Number(req.query.maxLat) : null;
    const minLng = req.query.minLng ? Number(req.query.minLng) : null;
    const maxLng = req.query.maxLng ? Number(req.query.maxLng) : null;
    const hasBounds = [minLat, maxLat, minLng, maxLng].every((v) => typeof v === 'number' && !Number.isNaN(v));

    const items = landmarks
      .filter((l) => {
        if (!hasBounds) return true;
        return l.latitude >= (minLat as number)
          && l.latitude <= (maxLat as number)
          && l.longitude >= (minLng as number)
          && l.longitude <= (maxLng as number);
      })
      .map((l) => ({
        id: landmarkStableId(l.name, l.latitude, l.longitude),
        name: l.name,
        category: l.category,
        description: l.description,
        latitude: l.latitude,
        longitude: l.longitude,
        is_landmark: true,
      }));

    res.json(items);
  } catch (err) {
    console.error('Get landmarks error:', err);
    res.status(500).json({ error: 'Failed to fetch landmarks' });
  }
});
