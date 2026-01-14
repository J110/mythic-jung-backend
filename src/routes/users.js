import express from 'express';
import crypto from 'crypto';
import { db } from '../storage/database.js';

export const usersRouter = express.Router();

/**
 * POST /v1/users/login
 * Login or create a user by username
 * ALWAYS succeeds - creates user if not found
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
    const displayName = username.trim();
    
    console.log(`[Users] Login attempt for: ${normalizedUsername}`);
    
    // Try to find existing user, but don't fail if DB errors
    let user = null;
    let isReturningUser = false;
    let hasExistingData = false;
    
    try {
      user = await db.getUserByUsername(normalizedUsername);
      if (user) {
        isReturningUser = true;
        console.log(`[Users] Found existing user: ${user.id}`);
        
        // Check for existing data
        try {
          const meOutput = await db.getMeOutput(user.id);
          hasExistingData = !!(meOutput?.story);
          console.log(`[Users] User has existing data: ${hasExistingData}`);
        } catch (e) {
          console.log(`[Users] Could not check data: ${e.message}`);
          hasExistingData = false;
        }
      }
    } catch (e) {
      console.log(`[Users] DB lookup error (treating as new user): ${e.message}`);
      user = null;
    }
    
    // Create new user if not found
    if (!user) {
      const userId = crypto.randomUUID();
      user = {
        id: userId,
        username: normalizedUsername,
        displayName: displayName,
      };
      
      try {
        await db.saveUser(user);
        console.log(`[Users] Created new user: ${userId}`);
      } catch (e) {
        console.log(`[Users] Could not save to DB (using generated ID): ${e.message}`);
        // Still return success with the generated user
      }
    }
    
    // Always return success
    console.log(`[Users] Login successful: ${user.username} (${user.id})`);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName || displayName,
      },
      isReturningUser,
      hasExistingData,
      dataSummary: null,
    });
    
  } catch (error) {
    // Even on error, try to return a valid response
    console.error('[Users] Login error:', error);
    
    // Generate a user anyway
    const username = req.body?.username?.trim()?.toLowerCase() || 'user';
    const userId = crypto.randomUUID();
    
    res.json({
      success: true,
      user: {
        id: userId,
        username: username,
        displayName: req.body?.username?.trim() || username,
      },
      isReturningUser: false,
      hasExistingData: false,
      dataSummary: null,
    });
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
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
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
 */
usersRouter.get('/:userId/sync', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await db.getUser(userId);
    if (!user) {
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
    
    // Debug: Log meOutput structure to identify parsing issues
    if (meOutput) {
      console.log(`[Users] meOutput keys: ${Object.keys(meOutput).join(', ')}`);
      console.log(`[Users] meOutput.story type: ${typeof meOutput.story}, isNull: ${meOutput.story === null}`);
      console.log(`[Users] meOutput.identification type: ${typeof meOutput.identification}, isNull: ${meOutput.identification === null}`);
      console.log(`[Users] meOutput.functioning type: ${typeof meOutput.functioning}, isNull: ${meOutput.functioning === null}`);
      console.log(`[Users] meOutput.actions type: ${typeof meOutput.actions}, isNull: ${meOutput.actions === null}`);
      console.log(`[Users] meOutput.lifeDomains type: ${typeof meOutput.lifeDomains}, isNull: ${meOutput.lifeDomains === null}`);
      console.log(`[Users] meOutput.meta type: ${typeof meOutput.meta}, isNull: ${meOutput.meta === null}`);
    }
    
    // Ensure displayName is never null
    const safeUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
    };
    
    res.json({
      user: safeUser,
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
