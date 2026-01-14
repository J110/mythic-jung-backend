import express from 'express';
import { db } from '../storage/database.js';
import { generateRelationshipOutput, clearRelationshipCache } from '../services/relationshipEngine.js';
import { queueAIRequest, AI_PRIORITY } from '../services/aiQueue.js';

export const relationshipRouter = express.Router();

// Get user ID from request (same pattern as Me endpoints)
const getUserId = (req) => {
  return req.headers['x-user-id'] || 'default-user';
};

// ============================================================================
// POST /v1/relationship/set - Save relationship character set
// ============================================================================
relationshipRouter.post('/set', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { enabled, relationshipType, otherCharacterInputs } = req.body;

    if (enabled && (!otherCharacterInputs || !Array.isArray(otherCharacterInputs))) {
      return res.status(400).json({ 
        error: 'otherCharacterInputs array is required when enabled',
        code: 'INVALID_INPUT'
      });
    }

    if (enabled && otherCharacterInputs.length < 4) {
      return res.status(400).json({ 
        error: 'At least 4 characters are required',
        code: 'INSUFFICIENT_CHARACTERS'
      });
    }

    const relationshipSet = {
      userId,
      enabled: enabled || false,
      relationshipType: relationshipType || 'platonic',
      otherLabel: relationshipType === 'romantic' ? 'partner' : 'friend',
      otherCharacterInputs: otherCharacterInputs || [],
      updatedAt: new Date().toISOString(),
    };

    await db.saveRelationshipSet(userId, relationshipSet);
    
    // Clear cached output when characters change
    await db.clearRelationshipOutput(userId);

    console.log(`[Relationship] Set saved for user ${userId}: enabled=${enabled}, type=${relationshipType}, characters=${otherCharacterInputs?.length || 0}`);
    
    res.json({ success: true, relationshipSet });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /v1/relationship/set - Get current relationship set
// ============================================================================
relationshipRouter.get('/set', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const relationshipSet = await db.getRelationshipSet(userId);

    if (!relationshipSet) {
      return res.status(404).json({ error: 'Relationship set not found' });
    }

    res.json(relationshipSet);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /v1/relationship/output - Get cached relationship output
// ============================================================================
relationshipRouter.get('/output', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const output = await db.getRelationshipOutput(userId);

    if (!output) {
      return res.status(404).json({ error: 'Relationship output not found' });
    }

    res.json(output);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /v1/relationship/regenerate - Generate/regenerate relationship output
// ============================================================================
relationshipRouter.post('/regenerate', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { force = false, moduleKeys = null } = req.body;

    const relationshipSet = await db.getRelationshipSet(userId);
    
    if (!relationshipSet || !relationshipSet.enabled) {
      return res.status(400).json({ 
        error: 'Relationship is not enabled',
        code: 'RELATIONSHIP_NOT_ENABLED'
      });
    }

    if (!relationshipSet.otherCharacterInputs || relationshipSet.otherCharacterInputs.length < 4) {
      return res.status(400).json({ 
        error: 'At least 4 characters are required',
        code: 'INSUFFICIENT_CHARACTERS'
      });
    }

    // Check for cached output unless force regeneration
    if (!force) {
      const cached = await db.getRelationshipOutput(userId);
      if (cached) {
        console.log(`[Relationship] Returning cached output for user ${userId}`);
        return res.json(cached);
      }
    } else {
      // Force regeneration - clear all caches
      clearRelationshipCache();
      await db.clearRelationshipOutput(userId);
      console.log(`[Relationship] Force regeneration - caches cleared for user ${userId}`);
    }

    console.log(`[Relationship] Generating output for user ${userId} (v2 engine)...`);

    // NOTE: Relationship output is INDEPENDENT from Me output
    const meData = {
      profile: await db.getProfile(userId),
      selfModel: null, // Intentionally null - relationship is independent
      assessments: await db.getAssessmentAnswers(userId),
    };
    
    console.log(`[Relationship] Using independent mode (no Me output dependency)`);

    // Get pre-recognized characters from resonance flow
    const preRecognizedCharacters = relationshipSet.recognizedCharacters || [];
    const referenceHints = relationshipSet.referenceHints || {};
    
    console.log(`[Relationship] Pre-recognized characters: ${preRecognizedCharacters.length}`);
    if (preRecognizedCharacters.length > 0) {
      console.log(`[Relationship] Using pre-recognized: ${preRecognizedCharacters.map(c => c.canonical?.name || c.input).join(', ')}`);
    }

    // Generate relationship output (queued to prevent rate limits)
    const output = await queueAIRequest(
      () => generateRelationshipOutput(
        relationshipSet,
        meData,
        { 
          moduleKeys,
          preRecognizedCharacters: preRecognizedCharacters.length >= 4 ? preRecognizedCharacters : null,
          referenceHints,
        }
      ),
      { priority: AI_PRIORITY.NORMAL }
    );

    // Cache the output
    await db.saveRelationshipOutput(userId, output);
    
    console.log(`[Relationship] Output generated and cached for user ${userId}`);
    res.json(output);
  } catch (error) {
    console.error('[Relationship] Generation error:', error);
    
    // Handle specific errors
    if (error.message?.includes('not recognized')) {
      return res.status(400).json({
        error: error.message,
        userMessage: 'Some characters were not recognized. Please use well-known characters from stories, movies, or books.',
        code: 'CHARACTERS_NOT_RECOGNIZED'
      });
    }
    
    next(error);
  }
});

// ============================================================================
// DELETE /v1/relationship/set - Disable/clear relationship
// ============================================================================
relationshipRouter.delete('/set', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await db.clearRelationshipSet(userId);
    
    console.log(`[Relationship] Cleared for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /v1/relationship/clear-cache - Clear all relationship caches
// ============================================================================
relationshipRouter.post('/clear-cache', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    
    // Clear engine cache
    clearRelationshipCache();
    
    // Clear stored output
    await db.clearRelationshipOutput(userId);
    
    console.log(`[Relationship] All caches cleared for user ${userId}`);
    res.json({ success: true, message: 'All relationship caches cleared' });
  } catch (error) {
    next(error);
  }
});
