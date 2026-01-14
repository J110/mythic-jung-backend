import express from 'express';
import { db } from '../storage/database.js';
import { generateRelationshipOutput, clearRelationshipCache } from '../services/relationshipEngine.js';
import { queueAIRequest, AI_PRIORITY } from '../services/aiQueue.js';
import {
  createJob,
  updateJobProgress,
  completeJob,
  failJob,
  getJob,
  getLatestJobForUser,
  JOB_STATUS,
} from '../services/jobManager.js';

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
// POST /v1/relationship/regenerate - Start async relationship generation
// Returns immediately with a jobId, processes in background
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

    // Create a job for async tracking
    const job = createJob(userId);
    
    console.log(`[Relationship] Starting async generation for job ${job.id}`);
    
    // Run generation in background (don't await)
    runRelationshipGenerationInBackground(job.id, userId, relationshipSet, moduleKeys).catch(err => {
      console.error(`[Relationship] Background generation failed for job ${job.id}:`, err);
    });
    
    // Return immediately with job info
    res.json({
      jobId: job.id,
      status: job.status,
      message: 'Relationship generation started. Poll /v1/relationship/status/:jobId for progress.',
    });
    
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

/**
 * Run relationship generation in background with progress updates
 */
async function runRelationshipGenerationInBackground(jobId, userId, relationshipSet, moduleKeys) {
  try {
    // NOTE: Relationship output is INDEPENDENT from Me output
    const meData = {
      profile: await db.getProfile(userId),
      selfModel: null, // Intentionally null - relationship is independent
      assessments: await db.getAssessmentAnswers(userId),
    };
    
    console.log(`[Relationship] Job ${jobId}: Using independent mode (no Me output dependency)`);

    // Get pre-recognized characters from resonance flow
    const preRecognizedCharacters = relationshipSet.recognizedCharacters || [];
    const referenceHints = relationshipSet.referenceHints || {};
    
    console.log(`[Relationship] Job ${jobId}: Pre-recognized characters: ${preRecognizedCharacters.length}`);

    // Generate relationship output with progress callback
    // Relationship engine has 9 steps total
    const output = await queueAIRequest(
      () => generateRelationshipOutput(
        relationshipSet,
        meData,
        { 
          moduleKeys,
          preRecognizedCharacters: preRecognizedCharacters.length >= 4 ? preRecognizedCharacters : null,
          referenceHints,
          onProgress: (step, label) => {
            // Relationship engine reports steps 1-9
            updateJobProgress(jobId, step, label);
          },
        }
      ),
      { priority: AI_PRIORITY.NORMAL }
    );

    // Cache the output
    await db.saveRelationshipOutput(userId, output);
    console.log(`[Relationship] Job ${jobId}: Output generated and cached`);

    // Mark job as complete
    completeJob(jobId, output);
    
  } catch (error) {
    console.error(`[Relationship] Job ${jobId} failed:`, error);
    failJob(jobId, error);
  }
}

// ============================================================================
// GET /v1/relationship/status/:jobId - Get relationship job status and progress
// ============================================================================
relationshipRouter.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  
  if (!job) {
    return res.status(404).json({
      error: 'Job not found',
      code: 'JOB_NOT_FOUND',
    });
  }
  
  // If completed, include the result
  if (job.status === JOB_STATUS.COMPLETED && job.result) {
    return res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      totalSteps: job.totalSteps,
      stepLabel: job.stepLabel,
      result: job.result,
    });
  }
  
  // If failed, include the error
  if (job.status === JOB_STATUS.FAILED) {
    return res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      totalSteps: job.totalSteps,
      stepLabel: job.stepLabel,
      error: job.error,
    });
  }
  
  // In progress
  return res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    totalSteps: job.totalSteps,
    stepLabel: job.stepLabel,
  });
});

// ============================================================================
// GET /v1/relationship/latest - Get latest relationship job for user
// ============================================================================
relationshipRouter.get('/latest', async (req, res) => {
  const userId = getUserId(req);
  const job = getLatestJobForUser(userId);
  
  if (!job) {
    return res.status(404).json({
      error: 'No jobs found for user',
      code: 'NO_JOBS',
    });
  }
  
  // If completed, include the result
  if (job.status === JOB_STATUS.COMPLETED && job.result) {
    return res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      totalSteps: job.totalSteps,
      stepLabel: job.stepLabel,
      result: job.result,
    });
  }
  
  return res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    totalSteps: job.totalSteps,
    stepLabel: job.stepLabel,
    error: job.error,
  });
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
