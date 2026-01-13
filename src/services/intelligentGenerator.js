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
import { computeConstellation } from './archetypeConstellationEngine.js';
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
 * @param {Array} options.characterReferences - Optional reference constraints from Resonance Engine
 * @returns {Promise<GeneratedOutput>}
 */
export async function generateIntelligentOutput(userData, options = {}) {
  const { profile, assessments = [] } = userData;
  const characters = profile?.characters || [];
  // Get references from options (passed from generation service) or userData
  const characterReferences = options.characterReferences || userData.characterReferences || [];

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
  // Discovery has its own internal caching by canonicalId + reference
  console.log('[Step 2] Character Discovery Engine (gpt-4o)...');
  
  // Pass reference constraints from Resonance Engine if available
  const discoveryOptions = {};
  if (characterReferences && characterReferences.length > 0) {
    discoveryOptions.references = characterReferences;
    console.log(`[Step 2] Using ${characterReferences.filter(r => r?.mode !== 'NONE').length} reference constraints`);
  }
  
  const profiles = await discoverCharacterProfiles(canonicals, discoveryOptions);
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
  console.log('[Step 4] SelfModel has identificationDynamics:', !!selfModel.identificationDynamics);
  const narrativeOutput = await generateNarrative(selfModel, profiles, options);
  console.log('[Step 4] Narrative generation complete');
  console.log('[Step 4] narrativeOutput has identification_v2:', !!narrativeOutput.identification_v2);
  console.log('[Step 4] narrativeOutput keys:', Object.keys(narrativeOutput));

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

  // Step 6: Compute Archetype Constellation (deterministic, fast)
  console.log('[Step 6] Computing archetype constellation...');
  let constellation = null;
  try {
    constellation = computeConstellation(selfModel, profiles, { characterReferences }, assessments);
    console.log('[Step 6] ✅ Constellation computed:', {
      structuralKeys: constellation?.structural ? Object.keys(constellation.structural) : [],
      topMotifs: constellation?.motifs?.top?.length || 0,
    });
  } catch (constError) {
    console.error('[Step 6] Constellation error:', constError.message);
    // Non-fatal - continue without constellation
  }

  // Construct final output with examples and constellation
  const output = {
    story: narrativeOutput.story,
    identification: narrativeOutput.identification,
    identification_v2: narrativeOutput.identification_v2, // NEW: Center/Orbit system
    functioning: narrativeOutput.functioning,
    actions: narrativeOutput.actions,
    lifeDomains: narrativeOutput.lifeDomains,
    meta: narrativeOutput.meta,
    examples: examples,
    constellation: constellation, // NEW: Archetype constellation
    // Include selfModel and profiles for archetypes route
    selfModel: selfModel,
    characterProfiles: profiles,
  };
  
  console.log('[Final] Output ready with keys:', Object.keys(output));
  console.log('[Final] Has identification_v2:', !!output.identification_v2);
  console.log('[Final] Has examples:', !!output.examples);
  console.log('[Final] Has constellation:', !!output.constellation);

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
 * Assessment-driven regeneration - smart partial regen based on what changed
 * @param {Object} userData - User data with profile and assessments
 * @param {Object} previousAssessments - Previous assessment state for comparison
 * @param {Object} options - Generation options
 */
export async function regenerateFromAssessmentChange(userData, previousAssessments = [], options = {}) {
  const { profile, assessments = [] } = userData;
  const characters = profile?.characters || [];
  
  // Compute what mappings changed
  const changedMappings = computeChangedMappings(assessments, previousAssessments);
  console.log('[Assessment Regen] Changed mappings:', changedMappings);
  
  // Get current input hash
  const inputHash = createInputHash(characters, assessments);
  
  // Check if we have a cached selfModel with previous data
  const previousHash = createInputHash(characters, previousAssessments);
  const cachedPrevious = selfModelCache.get(previousHash);
  
  if (!cachedPrevious) {
    console.log('[Assessment Regen] No previous cache, doing full generation');
    return generateIntelligentOutput(userData, options);
  }
  
  // Determine regeneration scope based on changed mappings
  const regenScope = determineRegenScope(changedMappings);
  console.log('[Assessment Regen] Regeneration scope:', regenScope);
  
  if (regenScope.fullRegen) {
    console.log('[Assessment Regen] Full regeneration required');
    return generateIntelligentOutput(userData, { ...options, force: true });
  }
  
  // Partial regeneration: re-synthesize with new assessments
  console.log('[Assessment Regen] Partial regeneration with stability...');
  
  const selfModel = synthesizeSelfModel(cachedPrevious.profiles, assessments);
  
  // Cache the updated selfModel
  selfModelCache.set(inputHash, {
    selfModel,
    profiles: cachedPrevious.profiles,
    timestamp: Date.now(),
  });
  
  // Regenerate narrative with assessment-aware prompts
  const narrativeOutput = await generateNarrative(selfModel, cachedPrevious.profiles, {
    ...options,
    changedMappings,
    regenScope,
  });
  
  // Regenerate examples with assessment priorities
  const examples = await generateExamples(narrativeOutput, cachedPrevious.profiles, selfModel);
  
  // Compute delta summary
  const deltaSummary = computeDeltaSummary(changedMappings, selfModel, cachedPrevious.selfModel);
  
  const output = {
    story: narrativeOutput.story,
    identification: narrativeOutput.identification,
    identification_v2: narrativeOutput.identification_v2,
    functioning: narrativeOutput.functioning,
    actions: narrativeOutput.actions,
    lifeDomains: narrativeOutput.lifeDomains,
    meta: {
      ...narrativeOutput.meta,
      regenerationType: 'assessment_driven',
      changedMappings,
    },
    examples,
    deltaSummary, // What changed and why
  };
  
  // Cache output
  cacheOutput(inputHash, output);
  
  return output;
}

/**
 * Compute which mappings changed between assessment states
 */
function computeChangedMappings(newAssessments, oldAssessments) {
  const changed = {
    ego: false,
    persona: false,
    shadow: false,
    feelingFunction: false,
    cost: false,
    individuation: false,
    libidinalCharge: false,
  };
  
  // Map assessment types to mapping keys
  const typeToMapping = {
    'EGO_POSITION': 'ego',
    'PERSONA_FORMATION': 'persona',
    'SHADOW_PROXIMITY': 'shadow',
    'FEELING_FUNCTION': 'feelingFunction',
    'COST_COMPENSATION': 'cost',
    'INDIVIDUATION_DIRECTION': 'individuation',
    'LIBIDINAL_CHARGE': 'libidinalCharge',
  };
  
  // Index old assessments by questionId
  const oldByQuestion = {};
  oldAssessments.forEach(a => {
    if (a.questionId) oldByQuestion[a.questionId] = a;
  });
  
  // Check each new assessment for changes
  newAssessments.forEach(newA => {
    const oldA = oldByQuestion[newA.questionId];
    
    // Check if this is new or changed
    const isNew = !oldA;
    const isChanged = oldA && (
      JSON.stringify(oldA.selectedCharacterIds?.sort()) !== 
      JSON.stringify(newA.selectedCharacterIds?.sort())
    );
    
    if (isNew || isChanged) {
      const mappingKey = typeToMapping[newA.assessmentType];
      if (mappingKey) {
        changed[mappingKey] = true;
      }
      
      // Also mark by question prefix
      if (newA.questionId) {
        const prefix = newA.questionId.split('_')[0];
        const prefixMapping = {
          'LC': 'libidinalCharge',
          'EG': 'ego',
          'PF': 'persona',
          'SP': 'shadow',
          'FF': 'feelingFunction',
          'CC': 'cost',
          'ID': 'individuation',
        };
        if (prefixMapping[prefix]) {
          changed[prefixMapping[prefix]] = true;
        }
      }
    }
  });
  
  // Check for deleted assessments
  oldAssessments.forEach(oldA => {
    const stillExists = newAssessments.some(n => n.questionId === oldA.questionId);
    if (!stillExists) {
      const mappingKey = typeToMapping[oldA.assessmentType];
      if (mappingKey) changed[mappingKey] = true;
    }
  });
  
  return changed;
}

/**
 * Determine regeneration scope based on changed mappings
 */
function determineRegenScope(changedMappings) {
  const scope = {
    fullRegen: false,
    sections: [],
  };
  
  // Ego change affects: identification ego, story tone, actions
  if (changedMappings.ego) {
    scope.sections.push('identification.ego', 'story', 'actions');
  }
  
  // Persona change affects: identification persona, actions warnings
  if (changedMappings.persona) {
    scope.sections.push('identification.persona', 'actions');
  }
  
  // Shadow change affects: identification shadow/shadowVirtue, functioning costs
  if (changedMappings.shadow) {
    scope.sections.push('identification.shadow', 'identification.shadowVirtue', 'functioning');
  }
  
  // Feeling function change affects: feeling, eros, intimacy domain, redemption arc
  if (changedMappings.feelingFunction) {
    scope.sections.push('identification.feelingFunction', 'identification.erosAxis', 
                        'lifeDomains.intimacy', 'functioning.redemptionArc');
  }
  
  // Cost change affects: functioning costs, actions warnings
  if (changedMappings.cost) {
    scope.sections.push('functioning.costsAndCompensations', 'actions');
  }
  
  // Individuation change affects: individuation direction, next chapter
  if (changedMappings.individuation) {
    scope.sections.push('story.nextChapter', 'functioning.narrativeArc');
  }
  
  // Libidinal charge affects: current energy emphasis throughout
  if (changedMappings.libidinalCharge) {
    scope.sections.push('story', 'functioning.symbolicEssence');
  }
  
  // Full regen if too many sections affected (> 60%)
  const allSections = ['story', 'identification', 'functioning', 'actions', 'lifeDomains'];
  const affectedTop = new Set(scope.sections.map(s => s.split('.')[0]));
  if (affectedTop.size >= 4) {
    scope.fullRegen = true;
  }
  
  return scope;
}

/**
 * Compute delta summary - what changed and why
 */
function computeDeltaSummary(changedMappings, newSelfModel, oldSelfModel) {
  const deltas = [];
  
  // Compare ego centers
  if (changedMappings.ego) {
    const oldEgo = oldSelfModel?.coreMappings?.ego?.characterRefs?.[0];
    const newEgo = newSelfModel?.coreMappings?.ego?.characterRefs?.[0];
    if (oldEgo !== newEgo) {
      deltas.push({
        what: 'Ego center shifted',
        from: oldEgo,
        to: newEgo,
        triggeredBy: ['EGO_POSITION assessment'],
      });
    }
  }
  
  // Compare dominant now
  const oldDominant = oldSelfModel?.assessmentState?.dominantNow || [];
  const newDominant = newSelfModel?.assessmentState?.dominantNow || [];
  if (JSON.stringify(oldDominant) !== JSON.stringify(newDominant)) {
    deltas.push({
      what: 'Current energy emphasis shifted',
      from: oldDominant.join(', ') || 'none',
      to: newDominant.join(', ') || 'none',
      triggeredBy: ['LIBIDINAL_CHARGE assessment'],
    });
  }
  
  // Compare eros need
  const oldEros = oldSelfModel?.assessmentState?.erosNeedNow || [];
  const newEros = newSelfModel?.assessmentState?.erosNeedNow || [];
  if (JSON.stringify(oldEros) !== JSON.stringify(newEros)) {
    deltas.push({
      what: 'Intimacy/connection pattern shifted',
      from: oldEros.join(', ') || 'none',
      to: newEros.join(', ') || 'none',
      triggeredBy: ['FEELING_FUNCTION assessment'],
    });
  }
  
  // Compare risk edges
  const oldRisk = oldSelfModel?.assessmentState?.riskEdgesNow || [];
  const newRisk = newSelfModel?.assessmentState?.riskEdgesNow || [];
  if (JSON.stringify(oldRisk) !== JSON.stringify(newRisk)) {
    deltas.push({
      what: 'Shadow risk edges shifted',
      from: oldRisk.join(', ') || 'none',
      to: newRisk.join(', ') || 'none',
      triggeredBy: ['SHADOW_PROXIMITY assessment'],
    });
  }
  
  return {
    changes: deltas,
    changedMappings,
    timestamp: new Date().toISOString(),
  };
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
