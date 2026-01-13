import express from 'express';
import crypto from 'crypto';
import { memoryStore } from '../storage/memoryStore.js';

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
    let user = memoryStore.getUserByUsername(normalizedUsername);
    let isReturningUser = false;
    let hasExistingData = false;
    
    if (user) {
      // Returning user - check if they have existing data
      isReturningUser = true;
      const meOutput = memoryStore.getMeOutput(user.id);
      const relationshipOutput = memoryStore.getRelationshipOutput(user.id);
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
      memoryStore.saveUser(user);
      console.log(`[Users] New user created: ${normalizedUsername} (${userId})`);
    }
    
    // Update last login
    user.lastLoginAt = new Date().toISOString();
    memoryStore.saveUser(user);
    
    // Get summary of existing data if any
    let dataSummary = null;
    if (hasExistingData) {
      const meOutput = memoryStore.getMeOutput(user.id);
      const packets = memoryStore.getLockedPackets(user.id);
      
      dataSummary = {
        characterCount: packets?.length || 0,
        hasStory: !!meOutput?.story,
        hasRelationship: !!memoryStore.getRelationshipOutput(user.id)?.myth,
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
    
    const user = memoryStore.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const meOutput = memoryStore.getMeOutput(userId);
    const relationshipOutput = memoryStore.getRelationshipOutput(userId);
    const packets = memoryStore.getLockedPackets(userId);
    const tonePreference = memoryStore.getTonePreference(userId);
    
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
 * DELETE /v1/users/:userId/data
 * Clear all user data (for starting fresh)
 */
usersRouter.delete('/:userId/data', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = memoryStore.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Clear all user data but keep the user account
    memoryStore.clearUserData(userId);
    
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
