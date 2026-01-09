import express from 'express';
import { memoryStore } from '../storage/memoryStore.js';
import { generateOutput } from '../services/generationService.js';

export const generateRouter = express.Router();

const getUserId = (req) => {
  return req.headers['x-user-id'] || 'default-user';
};

// POST /v1/generate - Generate output
generateRouter.post('/', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { force = false } = req.body;

    // Get cached output if not forcing regeneration
    if (!force) {
      const cached = memoryStore.getOutput(userId);
      if (cached) {
        return res.json(cached);
      }
    }

    // Get user data for generation
    const userData = memoryStore.getUserData(userId);

    if (!userData.profile || !userData.profile.characters || userData.profile.characters.length === 0) {
      return res.status(400).json({
        error: 'Profile with characters is required for generation',
      });
    }

    const assessmentCount = userData.assessments?.length || 0;
    console.log(`Generating output for user ${userId} with ${userData.profile.characters.length} characters and ${assessmentCount} assessment answers`);

    // Generate output (5-engine pipeline with Example Engine)
    const output = await generateOutput(userData, { force });

    // Cache the output
    memoryStore.saveOutput(userId, output);

    console.log(`Output generated and cached for user ${userId}`);
    res.json(output);
  } catch (error) {
    console.error('Generation error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Return validation errors with proper status code
    if (error.message && (
      error.message.includes('recognized') || 
      error.message.includes('characters') ||
      error.message.includes('TV, movies, books') ||
      error.message.includes('Invalid characters')
    )) {
      return res.status(400).json({
        error: error.message,
        code: 'CHARACTERS_NOT_RECOGNIZED',
        userMessage: 'The characters you entered are not recognized. Please add proper character names from stories, movies, books, or mythology to begin the discovery.',
      });
    }
    
    // Handle OpenAI API errors
    if (error.message && (
      error.message.includes('OpenAI') ||
      error.message.includes('API') ||
      error.message.includes('model') ||
      error.status === 404 ||
      error.status === 401
    )) {
      return res.status(500).json({
        error: 'AI service error. Please check your OpenAI API key and model availability.',
        code: 'AI_SERVICE_ERROR',
        details: error.message,
      });
    }
    
    // Generic error response
    return res.status(500).json({
      error: error.message || 'An error occurred during generation. Please try again.',
      code: 'GENERATION_ERROR',
    });
  }
});
