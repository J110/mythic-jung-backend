import express from 'express';
import { memoryStore } from '../storage/memoryStore.js';
import { generateRelationshipOutput } from '../services/relationshipEngine.js';

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

    memoryStore.saveRelationshipSet(userId, relationshipSet);
    
    // Clear cached output when characters change
    memoryStore.clearRelationshipOutput(userId);

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
    const relationshipSet = memoryStore.getRelationshipSet(userId);

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
    const output = memoryStore.getRelationshipOutput(userId);

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

    const relationshipSet = memoryStore.getRelationshipSet(userId);
    
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
      const cached = memoryStore.getRelationshipOutput(userId);
      if (cached) {
        console.log(`[Relationship] Returning cached output for user ${userId}`);
        return res.json(cached);
      }
    }

    console.log(`[Relationship] Generating output for user ${userId}...`);

    // Get optional Me data for enrichment
    const meData = {
      profile: memoryStore.getProfile(userId),
      selfModel: null, // Will be populated if Me output exists
      assessments: memoryStore.getAssessmentAnswers(userId),
    };
    
    const meOutput = memoryStore.getOutput(userId);
    if (meOutput?.selfModel) {
      meData.selfModel = meOutput.selfModel;
    }

    // Generate relationship output
    const output = await generateRelationshipOutput(
      relationshipSet,
      meData,
      { moduleKeys }
    );

    // Cache the output
    memoryStore.saveRelationshipOutput(userId, output);
    
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
    memoryStore.clearRelationshipSet(userId);
    
    console.log(`[Relationship] Cleared for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
