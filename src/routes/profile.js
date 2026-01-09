import express from 'express';
import { memoryStore } from '../storage/memoryStore.js';

export const profileRouter = express.Router();

// For now, we'll use a default user ID
// In production, implement proper authentication
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

    memoryStore.saveProfile(userId, profile);
    
    // Invalidate cached output when characters change
    // This ensures regeneration happens with new character selection
    memoryStore.clearOutput(userId);

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
    const profile = memoryStore.getProfile(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(profile);
  } catch (error) {
    next(error);
  }
});
