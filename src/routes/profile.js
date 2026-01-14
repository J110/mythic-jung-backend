import express from 'express';
import { db } from '../storage/database.js';

export const profileRouter = express.Router();

const getUserId = (req) => {
  return req.headers['x-user-id'] || 'default-user';
};

// POST /v1/profile - Update profile with characters
profileRouter.post('/', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { characters } = req.body;

    if (!characters || !Array.isArray(characters)) {
      return res.status(400).json({ error: 'characters array is required' });
    }

    const profile = {
      userId,
      characters,
      lastUpdated: new Date().toISOString(),
    };

    await db.saveProfile(userId, profile);
    
    // Invalidate cached output when characters change
    console.log(`[Profile] Clearing cached output for user ${userId} (characters changed)`);
    await db.clearMeOutput(userId);
    console.log(`[Profile] Cache cleared for user ${userId}`);

    console.log(`Profile updated for user ${userId} with ${characters.length} characters`);
    res.json({ success: true, profile });
  } catch (error) {
    next(error);
  }
});

// GET /v1/profile - Get current profile
profileRouter.get('/', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const profile = await db.getProfile(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profile);
  } catch (error) {
    next(error);
  }
});
