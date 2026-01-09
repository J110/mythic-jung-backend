/**
 * Intelligent Generator - SPEED OPTIMIZED
 * Orchestrates the 5 intelligent engines:
 * 1. Character Recognition Engine (gpt-4o-mini - fast)
 * 2. Character Discovery Engine (gpt-4o-mini - fast, validated)
 * 3. Synthesis Engine (NO LLM - deterministic)
 * 4. Narrative Engine (gpt-4o - core product quality)
 * 5. Example Engine (gpt-4o-mini - fast examples)
 * 
 * SPEED OPTIMIZATION:
 * - Concise prompts throughout
 * - Batched API calls
 * - Aggressive caching
 * - Reduced max_tokens
 */

import { recognizeCharacters, RecognitionStatus } from './characterRecognitionEngine.js';
import { discoverCharacterProfiles } from './characterDiscoveryEngine.js';
import { synthesizeSelfModel } from './synthesisEngine.js';
import { generateNarrative } from './narrativeEngine.js';
import { generateExamples } from './exampleEngine.js';
import crypto from 'crypto';

// === AGGRESSIVE CACHING ===
// In production, use Redis or persistent DB
const outputCache = new Map();
const selfModelCache = new Map();

/**
 * Create stable hash from user inputs for caching
 */
function createInputHash(characters, assessments) {
  const charIds = characters.map(c => c.displayName || c.id).sort().join('|');
  const assessIds = assessments.map(a => 
    `${a.assessmentType}:${(a.selectedCharacterIds || []).sort().join(',')}`
  ).sort().join('|');
  
  const combined = `${charIds}::${assessIds}`;
  return crypto.createHash('md5').update(combined).digest('hex');
}

/**
 * Check if we have a valid cached output
 */
function getCachedOutput(inputHash) {
  if (outputCache.has(inputHash)) {
    const cached = outputCache.get(inputHash);
    // Cache valid for 24 hours
    if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      console.log('[Cache] HIT - returning cached output');
      return cached.output;
    }
    outputCache.delete(inputHash);
  }
  return null;
}

/**
 * Store output in cache
 */
function cacheOutput(inputHash, output) {
  outputCache.set(inputHash, {
    output,
    timestamp: Date.now(),
  });
  
  // Limit cache size (LRU-style)
  if (outputCache.size > 100) {
    const firstKey = outputCache.keys().next().value;
    outputCache.delete(firstKey);
  }
}

/**
 * Generate output using intelligent engines
 * 
 * MODEL USAGE (Quality-First):
 * - Recognition: gpt-4o-mini (short disambiguation - OK)
 * - Discovery: gpt-4o (archetypal depth - REQUIRED)
 * - Synthesis: NO LLM (deterministic)
 * - Narrative: gpt-4o (core product - REQUIRED)
 * 
 * @param {Object} userData - User data with profile and assessments
 * @param {Object} options - Generation options
 * @returns {Promise<GeneratedOutput>}
 */
export async function generateIntelligentOutput(userData, options = {}) {
  const { profile, assessments = [] } = userData;
  const characters = profile?.characters || [];

  if (characters.length === 0) {
    throw new Error('No characters provided');
  }

  // === CACHE CHECK ===
  const inputHash = createInputHash(characters, assessments);
  
  if (!options.force) {
    const cached = getCachedOutput(inputHash);
    if (cached) {
      return cached;
    }
  }

  console.log('[Intelligent Generator] Starting generation pipeline...');
  console.log('[Intelligent Generator] Input hash:', inputHash);

  // Step 1: Character Recognition (gpt-4o-mini - OK for short tasks)
  console.log('[Step 1] Character Recognition Engine (gpt-4o-mini)...');
  const characterInputs = characters.map(c => c.displayName || c.id);
  const recognitionResult = await recognizeCharacters(characterInputs);

  // Check recognition results
  const recognized = recognitionResult.results.filter(r => r.status === RecognitionStatus.RECOGNIZED);
  const ambiguous = recognitionResult.results.filter(r => r.status === RecognitionStatus.AMBIGUOUS);
  const notRecognized = recognitionResult.results.filter(r => r.status === RecognitionStatus.NOT_RECOGNIZED);

  console.log(`[Step 1] Recognition: ${recognized.length} ✓, ${ambiguous.length} ?, ${notRecognized.length} ✗`);

  // Reject if too many unrecognized
  if (notRecognized.length >= 3) {
    const unrecognizedNames = notRecognized.map((r, idx) => {
      const resultIndex = recognitionResult.results.findIndex(res => res === r);
      return characterInputs[resultIndex >= 0 ? resultIndex : idx];
    }).filter(Boolean);
    
    const errorMsg = unrecognizedNames.length > 0
      ? `The following characters were not recognized: ${unrecognizedNames.join(', ')}. Please provide proper character names from TV, movies, books, or real life.`
      : `Too many unrecognized characters. Please provide proper character names from TV, movies, books, or real life.`;
    
    throw new Error(errorMsg);
  }
  
  if (ambiguous.length > 0) {
    console.log(`[Step 1] Warning: ${ambiguous.length} ambiguous - using first candidates`);
  }

  // Map to canonicals
  const canonicals = recognitionResult.results.map((result, index) => {
    if (result.status === RecognitionStatus.RECOGNIZED) {
      return result.canonical;
    } else if (result.status === RecognitionStatus.AMBIGUOUS && result.candidates.length > 0) {
      console.warn(`[Step 1] Ambiguous: ${characterInputs[index]} -> ${result.candidates[0].name}`);
      return result.candidates[0];
    } else {
      console.warn(`[Step 1] Placeholder: ${characterInputs[index]}`);
      return {
        canonicalId: `placeholder_${index}`,
        name: characterInputs[index],
        franchise: 'Unknown',
        medium: 'unknown',
        portrayal: null,
      };
    }
  });

  // Step 2: Character Discovery (gpt-4o - REQUIRED for archetypal depth)
  // Discovery has its own internal caching by canonicalId
  console.log('[Step 2] Character Discovery Engine (gpt-4o)...');
  const profiles = await discoverCharacterProfiles(canonicals);
  console.log(`[Step 2] Discovery: ${profiles.length} profiles`);

  // Step 3: Synthesis (NO LLM - deterministic, explainable, stable)
  console.log('[Step 3] Synthesis Engine (deterministic)...');
  const selfModel = synthesizeSelfModel(profiles, assessments);
  console.log(`[Step 3] Synthesis: ${selfModel.tensions.length} tensions identified`);

  // Cache SelfModel for potential partial regeneration
  selfModelCache.set(inputHash, {
    selfModel,
    profiles,
    timestamp: Date.now(),
  });

  // Step 4: Narrative Generation (gpt-4o - REQUIRED for product quality)
  // This is the core product - mythic coherence, symbolic depth, emotional resonance
  console.log('[Step 4] Narrative Engine (gpt-4o - QUALITY CRITICAL)...');
  const narrativeOutput = await generateNarrative(selfModel, profiles, options);
  console.log('[Step 4] Narrative generation complete');

  // Step 5: Example Generation (gpt-4o - real examples supporting the narrative)
  console.log('[Step 5] Example Engine - generating real character examples...');
  let examples = null;
  
  try {
    examples = await generateExamples(narrativeOutput, profiles, selfModel);
    const storyCount = Object.values(examples?.story || {}).flat().length;
    const funcCount = Object.values(examples?.functioning || {}).flat().length;
    console.log('[Step 5] ✅ Examples generated:', { story: storyCount, functioning: funcCount });
  } catch (exampleError) {
    console.error('[Step 5] Example generation error:', exampleError.message);
    examples = {
      story: { mythSummary: [], centralTension: [], guidingSentence: [], northStarScene: [] },
      identification: { ego: [], persona: [], shadow: [], shadowVirtue: [], feelingFunction: [], erosAxis: [] },
      functioning: { coreTraits: [], symbolicEssence: [], narrativeArc: [], redemptionArc: [], costsAndCompensations: [], alignmentIndicators: [] },
      actions: [],
      lifeDomains: { work: [], leadership: [], truth: [], intimacy: [], social: [], innerLife: [] },
    };
  }

  // Construct final output with examples
  const output = {
    story: narrativeOutput.story,
    identification: narrativeOutput.identification,
    functioning: narrativeOutput.functioning,
    actions: narrativeOutput.actions,
    lifeDomains: narrativeOutput.lifeDomains,
    meta: narrativeOutput.meta,
    examples: examples,
  };
  
  console.log('[Final] Output ready with keys:', Object.keys(output));
  console.log('[Final] Has examples:', !!output.examples, 'Story count:', output.examples?.story?.length || 0);

  // === CACHE OUTPUT ===
  cacheOutput(inputHash, output);

  return output;
}

/**
 * Partial regeneration - only regenerates narrative from cached SelfModel
 * Use when only presentation needs to change, not the underlying synthesis
 */
export async function regenerateNarrativeOnly(userData, options = {}) {
  const { profile, assessments = [] } = userData;
  const characters = profile?.characters || [];
  
  const inputHash = createInputHash(characters, assessments);
  
  // Check if we have cached SelfModel
  if (selfModelCache.has(inputHash)) {
    const cached = selfModelCache.get(inputHash);
    console.log('[Partial Regen] Using cached SelfModel, regenerating narrative only...');
    
    const narrativeOutput = await generateNarrative(cached.selfModel, cached.profiles, options);
    const examples = await generateExamples(narrativeOutput, cached.profiles, cached.selfModel);
    
    const output = {
      ...narrativeOutput,
      examples,
    };
    
    cacheOutput(inputHash, output);
    
    return output;
  }
  
  // Fallback to full generation
  console.log('[Partial Regen] No cached SelfModel, doing full generation...');
  return generateIntelligentOutput(userData, options);
}

/**
 * Clear all caches (for testing/debugging)
 */
export function clearCaches() {
  outputCache.clear();
  selfModelCache.clear();
  console.log('[Cache] All caches cleared');
}

/**
 * Get cache stats (for monitoring)
 */
export function getCacheStats() {
  return {
    outputCacheSize: outputCache.size,
    selfModelCacheSize: selfModelCache.size,
  };
}
