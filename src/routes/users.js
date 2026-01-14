import express from 'express';
import crypto from 'crypto';
import { db } from '../storage/database.js';

export const usersRouter = express.Router();

/**
 * POST /v1/users/login
 * Login or create a user by username
 * Returns existing user data if username exists, or creates new user
 */
usersRouter.post('/login', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({
        error: 'Username must be at least 2 characters',
        code: 'INVALID_USERNAME',
      });
    }
    
    const normalizedUsername = username.trim().toLowerCase();
    
    // Check if user exists
    let user = await db.getUserByUsername(normalizedUsername);
    let isReturningUser = false;
    let hasExistingData = false;
    
    if (user) {
      // Returning user - check if they have existing data
      isReturningUser = true;
      const meOutput = await db.getMeOutput(user.id);
      const relationshipOutput = await db.getRelationshipOutput(user.id);
      hasExistingData = !!(meOutput?.story || relationshipOutput?.myth);
      
      console.log(`[Users] Returning user: ${normalizedUsername} (${user.id}), hasData: ${hasExistingData}`);
    } else {
      // New user - create them
      const userId = crypto.randomUUID();
      user = {
        id: userId,
        username: normalizedUsername,
        displayName: username.trim(), // Preserve original casing for display
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      await db.saveUser(user);
      console.log(`[Users] New user created: ${normalizedUsername} (${userId})`);
    }
    
    // Update last login
    user.lastLoginAt = new Date().toISOString();
    await db.saveUser(user);
    
    // Get summary of existing data if any
    let dataSummary = null;
    if (hasExistingData) {
      const meOutput = await db.getMeOutput(user.id);
      const packets = await db.getLockedPackets(user.id);
      
      dataSummary = {
        characterCount: packets?.length || 0,
        hasStory: !!meOutput?.story,
        hasRelationship: !!(await db.getRelationshipOutput(user.id))?.myth,
        lastUpdated: meOutput?.generatedAt || user.lastLoginAt,
      };
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      isReturningUser,
      hasExistingData,
      dataSummary,
    });
    
  } catch (error) {
    console.error('[Users] Login error:', error);
    res.status(500).json({ error: 'Failed to process login', details: error.message });
  }
});

/**
 * GET /v1/users/:userId/status
 * Get current status of user's data
 */
usersRouter.get('/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await db.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const meOutput = await db.getMeOutput(userId);
    const relationshipOutput = await db.getRelationshipOutput(userId);
    const packets = await db.getLockedPackets(userId);
    const tonePreference = await db.getTonePreference(userId);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      data: {
        hasCharacters: (packets?.length || 0) > 0,
        characterCount: packets?.length || 0,
        hasMeOutput: !!meOutput?.story,
        hasRelationshipOutput: !!relationshipOutput?.myth,
        tonePreference: tonePreference || 'plain',
        lastUpdated: meOutput?.generatedAt || relationshipOutput?.generatedAt || null,
      },
    });
    
  } catch (error) {
    console.error('[Users] Status error:', error);
    res.status(500).json({ error: 'Failed to get user status', details: error.message });
  }
});

/**
 * GET /v1/users/:userId/sync
 * Get full user state for syncing (output, relationship, etc.)
 * Used when restoring session from local storage
 */
usersRouter.get('/:userId/sync', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await db.getUser(userId);
    if (!user) {
      // User doesn't exist in database (likely migrated from in-memory to PostgreSQL)
      // Return a special response so frontend knows to re-login
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        message: 'Your session has expired. Please login again.',
      });
    }
    
    const meOutput = await db.getMeOutput(userId);
    const relationshipOutput = await db.getRelationshipOutput(userId);
    const relationshipSet = await db.getRelationshipSet(userId);
    const tonePreference = await db.getTonePreference(userId);
    
    console.log(`[Users] Sync requested for user: ${user.username} (${userId})`);
    console.log(`[Users] Has meOutput: ${!!meOutput?.story}, Has relationshipOutput: ${!!relationshipOutput?.myth}`);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      meOutput: meOutput || null,
      relationshipOutput: relationshipOutput || null,
      relationshipSettings: relationshipSet ? {
        enabled: true,
        type: relationshipSet.relationshipType || 'romantic',
      } : null,
      tonePreference: tonePreference || 'plain',
    });
    
  } catch (error) {
    console.error('[Users] Sync error:', error);
    res.status(500).json({ error: 'Failed to sync user data', details: error.message });
  }
});

/**
 * DELETE /v1/users/:userId/data
 * Clear all user data (for starting fresh)
 */
usersRouter.delete('/:userId/data', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await db.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Clear all user data but keep the user account
    await db.clearUserData(userId);
    
    console.log(`[Users] Cleared all data for user: ${user.username} (${userId})`);
    
    res.json({
      success: true,
      message: 'All user data cleared',
    });
    
  } catch (error) {
    console.error('[Users] Clear data error:', error);
    res.status(500).json({ error: 'Failed to clear user data', details: error.message });
  }
});

export default usersRouter;
