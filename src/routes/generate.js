import express from 'express';
import { db } from '../storage/database.js';
import { generateOutput } from '../services/generationService.js';
import { queueAIRequest, AI_PRIORITY } from '../services/aiQueue.js';

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
      const cached = await db.getMeOutput(userId);
      if (cached) {
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

    const assessmentCount = userData.assessments?.length || 0;
    const refCount = characterReferences.filter(r => r?.mode !== 'NONE').length;
    console.log(`Generating output for user ${userId} with ${userData.profile.characters.length} characters, ${assessmentCount} assessments, ${refCount} references`);

    // Generate output (queued to prevent rate limits)
    const output = await queueAIRequest(
      () => generateOutput(userData, { force }),
      { priority: AI_PRIORITY.NORMAL }
    );

    // Cache the output
    await db.saveMeOutput(userId, output);

    console.log(`Output generated and cached for user ${userId}`);
    
    // Log response details
    const responseJson = JSON.stringify(output);
    console.log(`[Generate] Response size: ${responseJson.length} bytes`);
    console.log(`[Generate] Output keys: ${Object.keys(output).join(', ')}`);
    console.log(`[Generate] Has constellation: ${!!output.constellation}`);
    console.log(`[Generate] Sending response...`);
    
    res.json(output);
    console.log(`[Generate] Response sent successfully`);
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
