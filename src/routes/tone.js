/**
 * Tone API Routes
 * 
 * Handles narrative tone preferences and rendering
 */

import express from 'express';
import crypto from 'crypto';
import { memoryStore } from '../storage/memoryStore.js';
import {
  NarrativeTone,
  DEFAULT_TONE,
  getAvailableTones,
  isValidTone,
  extractCanonicalNarrative,
  renderFullOutput,
  renderSection,
  getToneCacheKey,
} from '../services/toneRenderer.js';

export const toneRouter = express.Router();

// Helper to get user ID
function getUserId(req) {
  return req.headers['x-user-id'] || req.query.userId || 'default-user';
}

// Helper to create content hash for caching
function createContentHash(content) {
  return crypto.createHash('md5').update(JSON.stringify(content)).digest('hex').slice(0, 12);
}

/**
 * GET /v1/tone/available
 * 
 * Get all available narrative tones with metadata
 */
toneRouter.get('/available', (req, res) => {
  res.json({
    tones: getAvailableTones(),
    default: DEFAULT_TONE,
  });
});

/**
 * GET /v1/tone/preference
 * 
 * Get user's current tone preference
 */
toneRouter.get('/preference', (req, res) => {
  const userId = getUserId(req);
  const preferences = memoryStore.getUserPreferences(userId);
  
  res.json({
    narrativeTone: preferences.narrativeTone || DEFAULT_TONE,
    availableTones: getAvailableTones(),
  });
});

/**
 * POST /v1/tone/preference
 * 
 * Set user's tone preference
 */
toneRouter.post('/preference', (req, res) => {
  const userId = getUserId(req);
  const { narrativeTone } = req.body;

  if (!narrativeTone) {
    return res.status(400).json({
      error: 'narrativeTone is required',
      availableTones: Object.values(NarrativeTone),
    });
  }

  if (!isValidTone(narrativeTone)) {
    return res.status(400).json({
      error: `Invalid tone "${narrativeTone}"`,
      availableTones: Object.values(NarrativeTone),
    });
  }

  memoryStore.setNarrativeTone(userId, narrativeTone);
  
  console.log(`[Tone] User ${userId} set tone to ${narrativeTone}`);

  res.json({
    success: true,
    narrativeTone,
    message: `Tone set to ${narrativeTone}`,
  });
});

/**
 * POST /v1/tone/render/me
 * 
 * Render Me output in specified tone
 * Uses caching - only regenerates if needed
 */
toneRouter.post('/render/me', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { tone, section, force } = req.body;
    
    // Get tone (from request, or user preference, or default)
    const requestedTone = tone || memoryStore.getNarrativeTone(userId);
    
    console.log(`[Tone] Render Me request: tone=${requestedTone}, section=${section}, force=${force}`);
    
    if (!isValidTone(requestedTone)) {
      return res.status(400).json({
        error: `Invalid tone "${requestedTone}"`,
        availableTones: Object.values(NarrativeTone),
      });
    }

    // Get canonical output
    const output = memoryStore.getOutput(userId);
    if (!output) {
      return res.status(404).json({
        error: 'No output found. Generate output first.',
      });
    }

    // Create content hash for caching
    const contentHash = createContentHash(output);
    const cacheKey = getToneCacheKey(`${userId}_${contentHash}`, requestedTone, section || 'full');

    // Check cache (skip if force=true)
    if (!force) {
      const cached = memoryStore.getToneCache(cacheKey);
      if (cached) {
        console.log(`[Tone] Cache hit for ${cacheKey}`);
        return res.json({
          success: true,
          tone: requestedTone,
          rendered: cached,
          cached: true,
        });
      }
    } else {
      console.log(`[Tone] Force=true, bypassing cache for ${cacheKey}`);
    }

    // Extract canonical narrative
    const canonical = extractCanonicalNarrative(output, 'ME');

    // Render
    let rendered;
    if (section) {
      rendered = await renderSection(canonical, requestedTone, 'ME', section);
    } else {
      rendered = await renderFullOutput(canonical, requestedTone, 'ME');
    }

    // Cache result (even if force was true, cache the new result)
    memoryStore.saveToneCache(cacheKey, rendered);

    console.log(`[Tone] Rendered Me output in ${requestedTone} tone${section ? ` (section: ${section})` : ''} (fresh render)`);

    res.json({
      success: true,
      tone: requestedTone,
      rendered,
      cached: false,
    });
  } catch (error) {
    console.error('[Tone] Me render error:', error);
    next(error);
  }
});

/**
 * POST /v1/tone/render/relationship
 * 
 * Render Relationship output in specified tone
 */
toneRouter.post('/render/relationship', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { tone, section, force } = req.body;
    
    // Get tone (default to MYTHIC for relationships if no preference)
    let requestedTone = tone || memoryStore.getNarrativeTone(userId);
    
    console.log(`[Tone] Render Relationship request: tone=${requestedTone}, section=${section}, force=${force}`);
    
    // Romantic relationships default to MYTHIC unless user has explicit preference
    const relationshipSet = memoryStore.getRelationshipSet(userId);
    if (relationshipSet?.relationshipType === 'romantic' && !tone) {
      const userPrefs = memoryStore.getUserPreferences(userId);
      if (!userPrefs.narrativeTone) {
        requestedTone = NarrativeTone.MYTHIC;
      }
    }
    
    if (!isValidTone(requestedTone)) {
      return res.status(400).json({
        error: `Invalid tone "${requestedTone}"`,
        availableTones: Object.values(NarrativeTone),
      });
    }

    // Get canonical output
    const output = memoryStore.getRelationshipOutput(userId);
    if (!output) {
      return res.status(404).json({
        error: 'No relationship output found. Generate relationship analysis first.',
      });
    }

    // Create content hash for caching
    const contentHash = createContentHash(output);
    const cacheKey = getToneCacheKey(`${userId}_rel_${contentHash}`, requestedTone, section || 'full');

    // Check cache (skip if force=true)
    if (!force) {
      const cached = memoryStore.getToneCache(cacheKey);
      if (cached) {
        console.log(`[Tone] Cache hit for ${cacheKey}`);
        return res.json({
          success: true,
          tone: requestedTone,
          rendered: cached,
          cached: true,
        });
      }
    } else {
      console.log(`[Tone] Force=true, bypassing cache for ${cacheKey}`);
    }

    // Extract canonical narrative
    const canonical = extractCanonicalNarrative(output, 'RELATIONSHIP');

    // Render
    let rendered;
    if (section) {
      rendered = await renderSection(canonical, requestedTone, 'RELATIONSHIP', section);
    } else {
      rendered = await renderFullOutput(canonical, requestedTone, 'RELATIONSHIP');
    }

    // Cache result
    memoryStore.saveToneCache(cacheKey, rendered);

    console.log(`[Tone] Rendered Relationship output in ${requestedTone} tone${section ? ` (section: ${section})` : ''}`);

    res.json({
      success: true,
      tone: requestedTone,
      rendered,
      cached: false,
    });
  } catch (error) {
    console.error('[Tone] Relationship render error:', error);
    next(error);
  }
});

/**
 * DELETE /v1/tone/cache
 * 
 * Clear tone cache for user
 */
toneRouter.delete('/cache', (req, res) => {
  const userId = getUserId(req);
  memoryStore.clearToneCacheForUser(userId);
  
  res.json({
    success: true,
    message: 'Tone cache cleared',
  });
});
