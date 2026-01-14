/**
 * Archetype Constellation API Routes
 * 
 * Endpoints:
 * - GET /v1/me/archetypes - Get Me constellation
 * - GET /v1/relationship/archetypes - Get Relationship constellation
 */

import express from 'express';
import { db } from '../storage/database.js';
import {
  computeConstellation,
  computeRelationshipConstellation,
  TAXONOMY_VERSION,
} from '../services/archetypeConstellationEngine.js';

export const archetypesRouter = express.Router();

const getUserId = (req) => req.headers['x-user-id'] || 'default-user';

// Cache for computed constellations
const constellationCache = new Map();

/**
 * GET /v1/me/archetypes
 * 
 * Returns the user's archetype constellation based on their Me characters.
 * Uses cached synthesis and profiles if available.
 */
archetypesRouter.get('/me/archetypes', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    console.log(`[Archetypes] GET /me/archetypes for user ${userId}`);
    console.log(`[Archetypes] Request headers X-User-Id: ${req.headers['x-user-id']}`);
    
    // Check cache first
    const cacheKey = `me_${userId}`;
    const cached = constellationCache.get(cacheKey);
    if (cached && !req.query.force) {
      console.log('[Archetypes] Returning cached Me constellation');
      return res.json(cached);
    }
    
    // Get Me output (which contains selfModel and profiles)
    const meOutput = await db.getMeOutput(userId);
    
    // First, check if constellation is already in the output (computed during generation)
    if (meOutput?.constellation) {
      console.log('[Archetypes] Using pre-computed constellation from output');
      const response = {
        meConstellation: meOutput.constellation,
        taxonomyVersion: TAXONOMY_VERSION,
        computedAt: meOutput.meta?.generatedAt || new Date().toISOString(),
      };
      constellationCache.set(cacheKey, response);
      return res.json(response);
    }
    
    // Fallback: compute if not in output
    if (!meOutput || !meOutput.selfModel) {
      return res.status(404).json({
        error: 'Me profile not generated yet. Please generate your Me output first.',
        code: 'ME_NOT_GENERATED',
      });
    }
    
    // Get profile data
    const profile = await db.getProfile(userId);
    if (!profile || !profile.characters) {
      return res.status(404).json({
        error: 'Character profiles not found.',
        code: 'PROFILES_NOT_FOUND',
      });
    }
    
    // Get resonance data if available
    const resonanceData = await db.getCharacterReferences(userId);
    
    // Get assessment answers if available
    const assessmentAnswers = await db.getAssessmentAnswers(userId) || [];
    
    // Extract character profiles from the output
    const characterProfiles = meOutput.characterProfiles || profile.characters?.map(c => ({
      name: c.displayName,
      canonicalId: c.canonicalId,
      archetypeSignals: c.archetypeSignals || { primaryArchetypes: ['Complex'] },
      behavioralTraits: c.behavioralTraits || {},
      motifs: c.motifs || generateDefaultMotifs(c.archetypeSignals?.primaryArchetypes || ['Hero']),
    })) || [];
    
    console.log(`[Archetypes] Computing Me constellation from ${characterProfiles.length} profiles`);
    
    // Compute constellation
    const constellation = computeConstellation(
      meOutput.selfModel,
      characterProfiles,
      resonanceData ? { characterReferences: resonanceData } : null,
      assessmentAnswers
    );
    
    const response = {
      meConstellation: constellation,
      taxonomyVersion: TAXONOMY_VERSION,
      computedAt: new Date().toISOString(),
    };
    
    // Cache the result
    constellationCache.set(cacheKey, response);
    
    res.json(response);
  } catch (error) {
    console.error('[Archetypes] Me archetypes error:', error);
    next(error);
  }
});

/**
 * Generate default motifs from archetypes
 */
function generateDefaultMotifs(archetypes) {
  const archetypeToMotif = {
    'hero': { motif: 'HERO', weight: 0.7 },
    'warrior': { motif: 'WARRIOR', weight: 0.7 },
    'sage': { motif: 'WISE_OLD_MAN', weight: 0.7 },
    'wise': { motif: 'WISE_OLD_MAN', weight: 0.6 },
    'mentor': { motif: 'WISE_OLD_MAN', weight: 0.6 },
    'trickster': { motif: 'TRICKSTER', weight: 0.7 },
    'rebel': { motif: 'OUTLAW_REBEL', weight: 0.7 },
    'outlaw': { motif: 'OUTLAW_REBEL', weight: 0.7 },
    'lover': { motif: 'LOVER_EROS', weight: 0.7 },
    'romantic': { motif: 'LOVER_EROS', weight: 0.6 },
    'caregiver': { motif: 'CAREGIVER_HEALER', weight: 0.7 },
    'healer': { motif: 'CAREGIVER_HEALER', weight: 0.7 },
    'nurturer': { motif: 'GREAT_MOTHER', weight: 0.7 },
    'mother': { motif: 'GREAT_MOTHER', weight: 0.6 },
    'father': { motif: 'FATHER_AUTHORITY', weight: 0.7 },
    'authority': { motif: 'FATHER_AUTHORITY', weight: 0.6 },
    'child': { motif: 'CHILD', weight: 0.6 },
    'innocent': { motif: 'CHILD', weight: 0.5 },
    'magician': { motif: 'MAGICIAN', weight: 0.7 },
    'transformer': { motif: 'MAGICIAN', weight: 0.6 },
    'seeker': { motif: 'SEEKER_WANDERER', weight: 0.7 },
    'explorer': { motif: 'SEEKER_WANDERER', weight: 0.7 },
    'wanderer': { motif: 'SEEKER_WANDERER', weight: 0.6 },
    'complex': { motif: 'HERO', weight: 0.5 },
  };
  
  const motifs = [];
  const seen = new Set();
  
  archetypes.forEach(arch => {
    const lower = arch.toLowerCase();
    // Check for partial matches
    for (const [key, value] of Object.entries(archetypeToMotif)) {
      if (lower.includes(key) && !seen.has(value.motif)) {
        motifs.push(value);
        seen.add(value.motif);
      }
    }
  });
  
  // Default if nothing matched
  if (motifs.length === 0) {
    motifs.push({ motif: 'HERO', weight: 0.5 });
    motifs.push({ motif: 'SEEKER_WANDERER', weight: 0.4 });
  }
  
  return motifs;
}

/**
 * GET /v1/relationship/archetypes
 * 
 * Returns the relationship archetype constellation including:
 * - Me constellation
 * - Partner constellation
 * - Relationship constellation (shared, complementary, tensions, field)
 */
archetypesRouter.get('/relationship/archetypes', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    console.log(`[Archetypes] GET /relationship/archetypes for user ${userId}`);
    
    // Check cache first
    const cacheKey = `relationship_${userId}`;
    const cached = constellationCache.get(cacheKey);
    if (cached && !req.query.force) {
      console.log('[Archetypes] Returning cached Relationship constellation');
      return res.json(cached);
    }
    
    // Get Relationship output
    const relationshipOutput = await db.getRelationshipOutput(userId);
    
    // First, check if constellation is already in the output (computed during generation)
    if (relationshipOutput?.constellation) {
      console.log('[Archetypes] Using pre-computed relationship constellation from output');
      const response = {
        meConstellation: relationshipOutput.constellation.meConstellation || null,
        partnerConstellation: relationshipOutput.constellation.partnerConstellation,
        relationshipConstellation: relationshipOutput.constellation.relationshipConstellation,
        taxonomyVersion: TAXONOMY_VERSION,
        computedAt: relationshipOutput.meta?.generatedAt || new Date().toISOString(),
      };
      constellationCache.set(cacheKey, response);
      return res.json(response);
    }
    
    // Fallback: compute if not in output
    const meOutput = await db.getMeOutput(userId);
    if (!meOutput || !meOutput.selfModel) {
      return res.status(404).json({
        error: 'Me profile not generated yet.',
        code: 'ME_NOT_GENERATED',
      });
    }
    
    if (!relationshipOutput || !relationshipOutput.relationshipModel) {
      return res.status(404).json({
        error: 'Relationship not generated yet. Please generate relationship output first.',
        code: 'RELATIONSHIP_NOT_GENERATED',
      });
    }
    
    // Get Me profile data
    const meProfile = await db.getProfile(userId);
    const meResonanceData = await db.getCharacterReferences(userId);
    const meAssessments = await db.getAssessmentAnswers(userId) || [];
    
    // Extract Me character profiles
    const meProfiles = meOutput.characterProfiles || meProfile?.characters?.map(c => ({
      name: c.displayName,
      canonicalId: c.canonicalId,
      archetypeSignals: c.archetypeSignals || { primaryArchetypes: ['Complex'] },
      behavioralTraits: c.behavioralTraits || {},
      motifs: c.motifs || generateDefaultMotifs(c.archetypeSignals?.primaryArchetypes || ['Hero']),
    })) || [];
    
    // Get Partner character profiles from relationship output
    const relationshipSet = await db.getRelationshipSet(userId);
    const partnerProfiles = (relationshipOutput.otherProfiles || []).map(p => ({
      ...p,
      motifs: p.motifs || generateDefaultMotifs(p.archetypeSignals?.primaryArchetypes || ['Hero']),
    }));
    
    // Get partner resonance data if available
    const partnerResonanceData = relationshipSet?.recognizedCharacters || [];
    
    console.log(`[Archetypes] Computing constellations - Me: ${meProfiles.length} profiles, Partner: ${partnerProfiles.length} profiles`);
    
    // Use pre-computed Me constellation if available
    let meConstellation = meOutput?.constellation;
    if (!meConstellation) {
      meConstellation = computeConstellation(
        meOutput.selfModel,
        meProfiles,
        meResonanceData ? { characterReferences: meResonanceData } : null,
        meAssessments
      );
    }
    
    // Compute Partner constellation (no assessments for partner)
    const partnerSelfModel = relationshipOutput.otherSelfModel || {
      coreMappings: relationshipOutput.relationshipModel?._internal?.otherMappings,
    };
    
    const partnerConstellation = computeConstellation(
      partnerSelfModel,
      partnerProfiles,
      partnerResonanceData ? { characterReferences: partnerResonanceData } : null,
      []
    );
    
    // Compute relationship constellation
    const relationshipConstellation = computeRelationshipConstellation(
      meConstellation,
      partnerConstellation,
      relationshipOutput.relationshipModel
    );
    
    const response = {
      meConstellation,
      partnerConstellation,
      relationshipConstellation,
      taxonomyVersion: TAXONOMY_VERSION,
      computedAt: new Date().toISOString(),
    };
    
    // Cache the result
    constellationCache.set(cacheKey, response);
    
    res.json(response);
  } catch (error) {
    console.error('[Archetypes] Relationship archetypes error:', error);
    next(error);
  }
});

/**
 * POST /v1/archetypes/clear-cache
 * 
 * Clears the constellation cache for the user.
 */
archetypesRouter.post('/clear-cache', (req, res) => {
  const userId = getUserId(req);
  
  constellationCache.delete(`me_${userId}`);
  constellationCache.delete(`relationship_${userId}`);
  
  console.log(`[Archetypes] Cache cleared for user ${userId}`);
  res.json({ success: true, message: 'Archetype cache cleared' });
});

export default archetypesRouter;
