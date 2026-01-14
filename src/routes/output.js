import express from 'express';
import { db } from '../storage/database.js';

export const outputRouter = express.Router();

const getUserId = (req) => {
  return req.headers['x-user-id'] || 'default-user';
};

// GET /v1/output - Get cached output
outputRouter.get('/', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const output = await db.getMeOutput(userId);

    if (!output) {
      return res.status(404).json({ error: 'No cached output found' });
    }

    res.json(output);
  } catch (error) {
    next(error);
  }
});
