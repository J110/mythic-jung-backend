import express from 'express';
import { db } from '../storage/database.js';
import { generateOutput } from '../services/generationService.js';
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

export const generateRouter = express.Router();

const getUserId = (req) => {
  return req.headers['x-user-id'] || 'default-user';
};

/**
 * POST /v1/generate - Start async generation
 * Returns immediately with a jobId, processes in background
 */
generateRouter.post('/', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { force = false, async: useAsync = true } = req.body;

    console.log(`[Generate] Request for user ${userId}, force=${force}, async=${useAsync}`);

    // Get cached output if not forcing regeneration
    if (!force) {
      const cached = await db.getMeOutput(userId);
      if (cached) {
        console.log(`[Generate] Returning cached output for user ${userId}`);
        return res.json(cached);
      }
    }

    // Get user data for generation
    const userData = await db.getUserData(userId);

    if (!userData.profile || !userData.profile.characters || userData.profile.characters.length === 0) {
      return res.status(400).json({
        error: 'Profile with characters is required for generation',
      });
    }

    // Get character references from Resonance Engine (if any)
    const characterReferences = await db.getCharacterReferences(userId);
    userData.characterReferences = characterReferences;

    // Create a job for tracking
    const job = createJob(userId);
    
    // Start async generation
    console.log(`[Generate] Starting async generation for job ${job.id}`);
    
    // Run generation in background (don't await)
    runGenerationInBackground(job.id, userId, userData, force).catch(err => {
      console.error(`[Generate] Background generation failed for job ${job.id}:`, err);
    });
    
    // Return immediately with job info
    res.json({
      jobId: job.id,
      status: job.status,
      message: 'Generation started. Poll /v1/generate/status/:jobId for progress.',
    });
    
  } catch (error) {
    console.error('[Generate] Error:', error);
    return res.status(500).json({
      error: error.message || 'An error occurred during generation.',
      code: 'GENERATION_ERROR',
    });
  }
});

/**
 * GET /v1/generate/status/:jobId - Get job status and progress
 */
generateRouter.get('/status/:jobId', async (req, res) => {
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

/**
 * GET /v1/generate/latest - Get latest job for user
 */
generateRouter.get('/latest', async (req, res) => {
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

/**
 * Run generation in background with progress updates
 */
async function runGenerationInBackground(jobId, userId, userData, force) {
  try {
    updateJobProgress(jobId, 1, 'Recognizing characters...');
    
    const assessmentCount = userData.assessments?.length || 0;
    const refCount = userData.characterReferences?.filter(r => r?.mode !== 'NONE').length || 0;
    console.log(`[Generate] Job ${jobId}: ${userData.profile.characters.length} characters, ${assessmentCount} assessments, ${refCount} references`);

    // Generate output with progress callback
    const output = await queueAIRequest(
      () => generateOutput(userData, { 
        force,
        onProgress: (step, label) => {
          updateJobProgress(jobId, step, label);
        },
      }),
      { priority: AI_PRIORITY.NORMAL }
    );

    // Cache the output
    await db.saveMeOutput(userId, output);
    console.log(`[Generate] Job ${jobId}: Output generated and cached`);

    // Mark job as complete
    completeJob(jobId, output);
    
  } catch (error) {
    console.error(`[Generate] Job ${jobId} failed:`, error);
    failJob(jobId, error);
  }
}
