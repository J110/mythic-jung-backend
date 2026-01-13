/**
 * Runs Routes
 * 
 * Manages PsycheModel runs - the single source of truth for
 * Constellation and Identification.
 * 
 * Endpoints:
 * - POST /v1/runs/generate - Generate a new run (or return cached)
 * - GET /v1/runs/latest - Get latest run ID for context
 * - GET /v1/runs/:runId/psyche-model - Fetch full PsycheModel
 */

import express from 'express';
import { memoryStore } from '../storage/memoryStore.js';
import {
  createPsycheModel,
  createRelationshipPsycheModel,
  createInputHash,
  createStructuralPosition,
  createSelfDirectionPosition,
  createMotifEntry,
  validatePsycheModel,
  StructuralRole,
  ENGINE_VERSIONS,
} from '../models/psycheModel.js';
import { synthesizeSelfModel } from '../services/synthesisEngine.js';
import { computeConstellation, computeRelationshipConstellation } from '../services/archetypeConstellationEngine.js';
import { discoverCharacterProfiles } from '../services/characterDiscoveryEngine.js';

export const runsRouter = express.Router();

// In-memory run storage (replace with DB in production)
const runStore = {
  // userId_context -> { latestRunId, runs: Map<runId, PsycheModel> }
  userRuns: new Map(),
};

/**
 * Get or create user run store
 */
function getUserRunStore(userId, context) {
  const key = `${userId}_${context}`;
  if (!runStore.userRuns.has(key)) {
    runStore.userRuns.set(key, {
      latestRunId: null,
      runs: new Map(),
    });
  }
  return runStore.userRuns.get(key);
}

/**
 * Save a run
 */
function saveRun(userId, context, psycheModel) {
  const store = getUserRunStore(userId, context);
  store.runs.set(psycheModel.runId, psycheModel);
  store.latestRunId = psycheModel.runId;
  console.log(`[Runs] Saved run ${psycheModel.runId} for ${userId}/${context}`);
}

/**
 * Get latest run
 */
function getLatestRun(userId, context) {
  const store = getUserRunStore(userId, context);
  if (!store.latestRunId) return null;
  return store.runs.get(store.latestRunId) || null;
}

/**
 * Get run by ID
 */
function getRun(userId, context, runId) {
  const store = getUserRunStore(userId, context);
  return store.runs.get(runId) || null;
}

/**
 * Check if inputs have changed since last run
 */
function haveInputsChanged(lastRun, currentHashes) {
  if (!lastRun) return true;
  
  const lastHashes = lastRun.inputHashes || {};
  return Object.keys(currentHashes).some(key => 
    currentHashes[key] !== lastHashes[key]
  );
}

/**
 * POST /v1/runs/generate
 * 
 * Generate a new run (or return cached if inputs unchanged)
 * 
 * Body: {
 *   context: 'ME' | 'REL',
 *   relationshipType?: 'ROMANTIC' | 'PLATONIC' (for REL only)
 *   force?: boolean (force regeneration even if cached)
 * }
 */
runsRouter.post('/generate', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const { context = 'ME', relationshipType = 'ROMANTIC', force = false } = req.body;
    
    console.log(`[Runs] Generate request for ${userId}/${context} (force=${force})`);
    
    if (context === 'ME') {
      // === ME CONTEXT ===
      // USE EXISTING OUTPUT as the source of truth
      const existingOutput = memoryStore.getOutput(userId);
      const userData = memoryStore.getUserData(userId);
      
      if (!existingOutput || !existingOutput.selfModel) {
        return res.status(400).json({
          error: 'No output generated yet. Please generate your profile first.',
          code: 'NO_OUTPUT',
        });
      }
      
      // Compute input hashes
      const inputHashes = {
        lockedPacketsHash: createInputHash(userData.profile?.characters || []),
        outputHash: createInputHash(existingOutput.generatedAt || existingOutput.cachedAt),
      };
      
      // Check if we can use cached run
      const lastRun = getLatestRun(userId, 'ME');
      if (!force && lastRun && !haveInputsChanged(lastRun, inputHashes)) {
        console.log(`[Runs] Returning cached run ${lastRun.runId}`);
        return res.json({
          runId: lastRun.runId,
          cached: true,
        });
      }
      
      // Generate new run from existing output
      console.log('[Runs] Generating PsycheModel from existing output...');
      
      // Get data from existing output
      const selfModel = existingOutput.selfModel;
      const characterProfiles = existingOutput.characterProfiles || [];
      
      console.log('[Runs] Using selfModel from output:');
      console.log('  - selfModel exists:', !!selfModel);
      console.log('  - profiles count:', characterProfiles.length);
      console.log('  - coreMappings:', selfModel?.coreMappings ? Object.keys(selfModel.coreMappings) : 'MISSING');
      console.log('  - identificationDynamics:', selfModel?.identificationDynamics ? Object.keys(selfModel.identificationDynamics) : 'MISSING');
      
      if (characterProfiles.length > 0) {
        console.log('  - First profile name:', characterProfiles[0]?.name || 'NO NAME');
      }
      
      if (!selfModel || !selfModel.coreMappings) {
        console.warn('[Runs] WARNING: selfModel is missing coreMappings!');
        console.log('[Runs] existingOutput keys:', Object.keys(existingOutput));
      }
      
      // Extract structural positions from synthesis
      const structuralPositions = extractStructuralPositions(selfModel, characterProfiles);
      
      // Compute constellation (motifs only)
      console.log('[Runs] Computing constellation...');
      const constellation = computeConstellation(
        selfModel,
        characterProfiles,
        memoryStore.getTempResonanceData(userId),
        userData.assessments || []
      );
      
      // Create PsycheModel
      const psycheModel = createPsycheModel({
        userId,
        context: 'ME',
        inputHashes,
        structuralPositions,
        motifDistribution: constellation.motifs.distribution.map(m => 
          createMotifEntry(m.motif, m.score)
        ),
        shadowMotifs: constellation.motifs.shadow.map(m => 
          createMotifEntry(m.motif, m.score)
        ),
        assessmentCoverage: selfModel.assessmentState?.coverage?.overall || 0,
      });
      
      // Validate
      const validation = validatePsycheModel(psycheModel);
      if (!validation.valid) {
        console.warn('[Runs] PsycheModel validation warnings:', validation.errors);
      }
      
      // Save
      saveRun(userId, 'ME', psycheModel);
      
      // Update output with psycheModelRunId reference
      memoryStore.saveOutput(userId, {
        ...existingOutput,
        psycheModelRunId: psycheModel.runId,
      });
      
      return res.json({
        runId: psycheModel.runId,
        cached: false,
      });
      
    } else if (context === 'REL') {
      // === RELATIONSHIP CONTEXT ===
      // USE EXISTING RELATIONSHIP OUTPUT as the source of truth
      const existingRelOutput = memoryStore.getRelationshipOutput(userId);
      
      if (!existingRelOutput) {
        return res.status(400).json({
          error: 'No relationship output generated yet. Please generate relationship profile first.',
          code: 'NO_REL_OUTPUT',
        });
      }
      
      // Compute input hashes
      const inputHashes = {
        outputHash: createInputHash(existingRelOutput.generatedAt || existingRelOutput.cachedAt),
      };
      
      // Check cached
      const lastRun = getLatestRun(userId, 'REL');
      if (!force && lastRun && !haveInputsChanged(lastRun, inputHashes)) {
        console.log(`[Runs] Returning cached REL run ${lastRun.runId}`);
        return res.json({
          runId: lastRun.runId,
          cached: true,
        });
      }
      
      // Generate new run from existing relationship output
      console.log('[Runs] Generating REL PsycheModel from existing output...');
      
      // Get data from existing relationship output
      const partnerSelfModel = existingRelOutput.otherSelfModel || existingRelOutput.selfModel;
      const partnerProfiles = existingRelOutput.otherProfiles || existingRelOutput.characterProfiles || [];
      
      console.log('[Runs] Using partner selfModel from output, profiles:', partnerProfiles.length);
      
      // Extract partner structural positions
      const partnerStructuralPositions = extractStructuralPositions(partnerSelfModel, partnerProfiles);
      
      // Compute partner constellation
      const partnerConstellation = computeConstellation(
        partnerSelfModel,
        partnerProfiles,
        null,
        []
      );
      
      // Get Me PsycheModel for relationship analysis
      let meConstellation = null;
      const meRun = getLatestRun(userId, 'ME');
      if (meRun) {
        meConstellation = {
          motifs: {
            distribution: meRun.motifDistribution,
            shadow: meRun.shadowMotifs,
          },
        };
      }
      
      // Compute relationship constellation
      let relationshipConstellation = null;
      if (meConstellation) {
        relationshipConstellation = computeRelationshipConstellation(
          meConstellation,
          partnerConstellation
        );
      }
      
      // Create Relationship PsycheModel
      const psycheModel = createRelationshipPsycheModel({
        userId,
        inputHashes,
        partnerStructuralPositions,
        partnerMotifDistribution: partnerConstellation.motifs.distribution.map(m => 
          createMotifEntry(m.motif, m.score)
        ),
        partnerShadowMotifs: partnerConstellation.motifs.shadow.map(m => 
          createMotifEntry(m.motif, m.score)
        ),
        relationshipConstellation: relationshipConstellation || {
          shared: [],
          complementary: [],
          tensions: [],
          field: { label: 'Dynamic Field', primaryThemes: ['exploration'], riskLoops: [] },
        },
        meSummary: meRun ? {
          runId: meRun.runId,
          motifDistribution: meRun.motifDistribution?.slice(0, 5),
        } : null,
        assessmentCoverage: 0,
      });
      
      // Validate
      const validation = validatePsycheModel(psycheModel);
      if (!validation.valid) {
        console.warn('[Runs] REL PsycheModel validation warnings:', validation.errors);
      }
      
      // Save
      saveRun(userId, 'REL', psycheModel);
      
      // Update relationship output with psycheModelRunId
      memoryStore.saveRelationshipOutput(userId, {
        ...existingRelOutput,
        psycheModelRunId: psycheModel.runId,
      });
      
      return res.json({
        runId: psycheModel.runId,
        cached: false,
      });
      
    } else {
      return res.status(400).json({
        error: `Invalid context: ${context}. Must be ME or REL.`,
      });
    }
    
  } catch (error) {
    console.error('[Runs] Generate error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate run',
    });
  }
});

/**
 * GET /v1/runs/latest
 * 
 * Get the latest run ID for a context
 * 
 * Query: ?context=ME|REL
 */
runsRouter.get('/latest', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const context = req.query.context || 'ME';
    
    const latestRun = getLatestRun(userId, context);
    
    if (!latestRun) {
      return res.status(404).json({
        error: `No runs found for context ${context}`,
        code: 'NO_RUNS',
      });
    }
    
    return res.json({
      runId: latestRun.runId,
      createdAt: latestRun.createdAt,
      context: latestRun.context,
    });
    
  } catch (error) {
    console.error('[Runs] Latest error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/runs/:runId/psyche-model
 * 
 * Fetch the full PsycheModel for a run
 */
runsRouter.get('/:runId/psyche-model', (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const { runId } = req.params;
    const context = req.query.context || 'ME';
    
    const run = getRun(userId, context, runId);
    
    if (!run) {
      // Try other context
      const otherContext = context === 'ME' ? 'REL' : 'ME';
      const otherRun = getRun(userId, otherContext, runId);
      
      if (otherRun) {
        return res.json(otherRun);
      }
      
      return res.status(404).json({
        error: `Run ${runId} not found`,
        code: 'RUN_NOT_FOUND',
      });
    }
    
    return res.json(run);
    
  } catch (error) {
    console.error('[Runs] Get psyche-model error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Extract structural positions from synthesis output
 * This is the AUTHORITATIVE source for structural roles
 */
function extractStructuralPositions(selfModel, profiles) {
  const mappings = selfModel?.coreMappings || {};
  const dynamics = selfModel?.identificationDynamics || {};
  
  const getPosition = (mappingKey, dynamicsKey) => {
    const mapping = mappings[mappingKey];
    const dynData = dynamics[dynamicsKey];
    
    const primary = mapping?.characterRefs?.[0] || dynData?.primary?.character;
    const secondary = dynData?.secondary?.map(s => s.characterId || s.character) || [];
    const confidence = dynData?.primary?.confidence || dynData?.roleConfidence || mapping?.confidence || 0.5;
    
    // Collect evidence flags
    const evidenceFlags = [];
    if (dynData?.primary?.evidenceFlags) {
      evidenceFlags.push(...dynData.primary.evidenceFlags);
    }
    if (mapping?.rationaleSignals?.assessmentRefs?.length) {
      evidenceFlags.push('ASSESSMENT_SELECTED');
    }
    
    return createStructuralPosition(primary, {
      secondary,
      confidence,
      evidenceFlags,
    });
  };
  
  // Build structural positions
  const positions = {
    [StructuralRole.EGO]: getPosition('ego', 'ego'),
    [StructuralRole.PERSONA]: getPosition('persona', 'persona'),
    [StructuralRole.SHADOW]: getPosition('shadow', 'shadow'),
    [StructuralRole.FEELING_FUNCTION]: getPosition('feelingFunction', 'feelingFunction'),
    [StructuralRole.EROS_AXIS]: getPosition('erosAxis', 'erosAxis'),
    [StructuralRole.SELF_DIRECTION]: createSelfDirectionPosition(
      selfModel?.individuationDirection?.missingQualities || ['integration', 'growth'],
      {
        confidence: 0.5,
        evidenceFlags: selfModel?.individuationDirection?.assessmentInsights?.length > 0 
          ? ['ASSESSMENT_INSIGHTS'] 
          : [],
      }
    ),
  };
  
  console.log('[Runs] Extracted structural positions:');
  Object.entries(positions).forEach(([role, pos]) => {
    if (role !== 'SELF_DIRECTION') {
      console.log(`  ${role}: ${pos.primary} (conf: ${pos.confidence?.toFixed(2)})`);
    }
  });
  
  return positions;
}
