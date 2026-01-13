/**
 * Synthesis Engine
 * Combines 4-6 CharacterProfiles + assessment answers into a coherent SelfModel.
 * Based on: 03_SYNTHESIS_ENGINE_SPEC.md
 * 
 * V2: Assessment-aware synthesis with stability smoothing
 */

import { 
  processAssessmentSignals, 
  computeStabilityAlpha, 
  canEgoCenterChange 
} from './assessmentSignalProcessor.js';

// Store previous synthesis for stability comparison
let previousSynthesis = null;

// Character count constants
const MIN_CHARACTERS = 4;
const MAX_CHARACTERS = 6;

/**
 * Synthesize SelfModel from character profiles and assessments
 * @param {CharacterProfile[]} profiles - Array of 4-6 character profiles
 * @param {Object[]} assessmentAnswers - Assessment answers keyed by questionId
 * @param {Object} options - Synthesis options
 * @returns {SelfModel}
 */
export function synthesizeSelfModel(profiles, assessmentAnswers = [], options = {}) {
  if (!profiles || profiles.length < MIN_CHARACTERS || profiles.length > MAX_CHARACTERS) {
    throw new Error(`${MIN_CHARACTERS}-${MAX_CHARACTERS} character profiles required for synthesis (got ${profiles?.length || 0})`);
  }

  // Check if character set has changed - reset previous synthesis if so
  const currentCharacterIds = profiles.map(p => p.canonicalId || p.name).sort().join(',');
  const previousCharacterIds = previousSynthesis?.meta?.characterIds;
  
  if (previousCharacterIds && previousCharacterIds !== currentCharacterIds) {
    console.log('[Synthesis] Character set changed - resetting previous synthesis');
    previousSynthesis = null;
  }

  // === NEW: Process Assessment Signals ===
  const assessmentSignals = processAssessmentSignals(assessmentAnswers, profiles);
  console.log('[Synthesis] Assessment coverage:', assessmentSignals.coverage.overall.toFixed(2));

  // Step 1: Start with equal weights (dynamic based on profile count)
  const initialWeights = profiles.map(() => 1.0 / profiles.length);
  
  // Step 2: Apply assessment overrides (basic)
  const basicAdjustedWeights = applyAssessmentOverrides(profiles, initialWeights, assessmentAnswers);
  
  // === NEW: Step 2.5: Apply assessment signal boosts ===
  const signalAdjustedWeights = applyAssessmentSignalBoosts(
    profiles, 
    basicAdjustedWeights, 
    assessmentSignals.characterSignalMatrix
  );
  
  // === NEW: Step 2.6: Apply stability smoothing ===
  const alpha = computeStabilityAlpha(assessmentSignals.coverage);
  const smoothedWeights = applyStabilitySmoothing(
    signalAdjustedWeights, 
    previousSynthesis?.weights?.perCharacterWeight || initialWeights,
    alpha
  );
  console.log('[Synthesis] Stability alpha:', alpha.toFixed(2));
  
  // Step 3: Normalize weights
  const normalizedWeights = normalizeWeights(smoothedWeights);
  
  // Step 4: Create core mappings (with ego stability check)
  const coreMappings = createCoreMappingsV2(
    profiles, 
    normalizedWeights, 
    assessmentAnswers, 
    assessmentSignals,
    previousSynthesis?.coreMappings
  );
  
  // Step 5: Identify tensions (enhanced with assessment signals)
  const tensions = identifyTensionsV2(profiles, normalizedWeights, coreMappings, assessmentSignals);
  
  // Step 6: Calculate costs and compensations (enhanced)
  const costsAndCompensations = calculateCostsAndCompensationsV2(
    profiles, 
    normalizedWeights, 
    assessmentSignals
  );
  
  // Step 7: Determine individuation direction (enhanced)
  const individuationDirection = determineIndividuationDirectionV2(
    profiles, 
    coreMappings, 
    tensions, 
    assessmentSignals
  );

  // Step 8: Compute identification dynamics (Center/Orbit/Compensation)
  // V3: Now uses evidence-based scoring with soft duplication penalty
  const identificationDynamics = computeIdentificationDynamics(
    profiles, 
    normalizedWeights, 
    coreMappings, 
    assessmentAnswers, 
    tensions,
    assessmentSignals,      // Pass assessment signals for scoring
    options.characterReferences || [] // Pass character references for phase fit
  );

  // Create input hash for caching
  const inputHash = createInputHash(profiles, assessmentAnswers);

  // === NEW: Build assessment state ===
  const assessmentState = {
    coverage: assessmentSignals.coverage,
    dominantNow: assessmentSignals.dominantNow,
    erosNeedNow: assessmentSignals.erosNeedNow,
    riskEdgesNow: assessmentSignals.riskEdgesNow,
    surpriseCandidates: assessmentSignals.surpriseCandidates,
    contextTriggers: assessmentSignals.contextTriggers,
    updatedAt: new Date().toISOString(),
  };

  const selfModel = {
    meta: {
      synthesisVersion: 'v2',
      inputHash,
      characterIds: currentCharacterIds,
      generatedAt: new Date().toISOString(),
      assessmentSignalsVersion: assessmentSignals.signalsVersion,
    },
    weights: {
      perCharacterWeight: normalizedWeights,
      perSectionAttribution: calculateSectionAttribution(profiles, normalizedWeights, coreMappings),
    },
    coreMappings,
    tensions,
    costsAndCompensations,
    individuationDirection,
    identificationDynamics,
    assessmentState, // NEW: Assessment-derived state
    assessmentSignals, // NEW: Full signals for downstream engines
  };

  // Store for stability comparison on next synthesis
  previousSynthesis = selfModel;

  return selfModel;
}

/**
 * Apply assessment signal boosts to weights
 */
function applyAssessmentSignalBoosts(profiles, weights, characterSignalMatrix) {
  const adjusted = [...weights];
  
  profiles.forEach((profile, idx) => {
    const charKey = profile.canonicalId || profile.name;
    const signals = characterSignalMatrix[charKey];
    
    if (!signals) return;
    
    // Boost based on total signal strength
    const boost = signals.totalSignalStrength * 0.3; // Scale factor
    adjusted[idx] += boost;
    
    // Additional boost for high energyNow (current psychic charge)
    if (signals.energyNow > 0.5) {
      adjusted[idx] += signals.energyNow * 0.15;
    }
  });
  
  return adjusted;
}

/**
 * Apply stability smoothing to prevent chaotic identity flipping
 * newWeights = (1-alpha)*oldWeights + alpha*computedWeights
 */
function applyStabilitySmoothing(newWeights, oldWeights, alpha) {
  return newWeights.map((newW, idx) => {
    const oldW = oldWeights[idx] || newW;
    return (1 - alpha) * oldW + alpha * newW;
  });
}

/**
 * Create core mappings V2 - with ego stability protection
 */
function createCoreMappingsV2(profiles, weights, assessmentAnswers, assessmentSignals, previousMappings) {
  // Check if ego center can change
  const egoCentrCanChange = canEgoCenterChange(assessmentSignals.coverage);
  
  // Track which profiles have been assigned
  const usedIndices = new Set();
  
  // Order matters: primary archetypes first
  const archetypeOrder = [
    { key: 'ego', assessmentType: 'EGO_POSITION' },
    { key: 'shadow', assessmentType: 'SHADOW_PROXIMITY' },
    { key: 'persona', assessmentType: 'PERSONA_FORMATION' },
    { key: 'feelingFunction', assessmentType: 'FEELING_FUNCTION' },
    { key: 'shadowVirtue', assessmentType: 'SHADOW_PROXIMITY' },
    { key: 'erosAxis', assessmentType: null },
  ];

  const mappings = {};
  
  for (const { key, assessmentType } of archetypeOrder) {
    // Special handling for ego: preserve if coverage threshold not met
    if (key === 'ego' && !egoCentrCanChange && previousMappings?.ego) {
      mappings.ego = previousMappings.ego;
      const prevChar = previousMappings.ego.characterRefs?.[0];
      const prevIdx = profiles.findIndex(p => p.name === prevChar);
      if (prevIdx >= 0) usedIndices.add(prevIdx);
      console.log('[Synthesis] Ego center preserved (coverage threshold not met)');
      continue;
    }
    
    const result = findBestFitExclusive(profiles, weights, key, assessmentAnswers, assessmentType, usedIndices);
    mappings[key] = result.mapping;
    if (result.index >= 0) {
      usedIndices.add(result.index);
    }
  }

  // Additional mappings
  mappings.truthOrientation = findBestFit(profiles, weights, 'truthOrientation', assessmentAnswers);
  mappings.powerStance = findBestFit(profiles, weights, 'powerStance', assessmentAnswers);
  mappings.relationalAsymmetry = findBestFit(profiles, weights, 'relationalAsymmetry', assessmentAnswers);
  mappings.lifePhase = inferLifePhase(profiles, weights);

  console.log('[Synthesis] Core mappings created (V2):');
  console.log('  Ego:', mappings.ego?.characterRefs?.[0]);
  console.log('  Shadow:', mappings.shadow?.characterRefs?.[0]);
  console.log('  Persona:', mappings.persona?.characterRefs?.[0]);
  console.log('  Feeling:', mappings.feelingFunction?.characterRefs?.[0]);
  console.log('  ShadowVirtue:', mappings.shadowVirtue?.characterRefs?.[0]);
  console.log('  Eros:', mappings.erosAxis?.characterRefs?.[0]);

  return mappings;
}

/**
 * Identify tensions V2 - enhanced with assessment signals
 */
function identifyTensionsV2(profiles, weights, coreMappings, assessmentSignals) {
  const tensions = [];
  
  // Base tensions from weight analysis
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const weightDiff = Math.abs(weights[i] - weights[j]);
      if (weightDiff < 0.05) {
        tensions.push({
          polarityPair: [profiles[i].name, profiles[j].name],
          recurringConflict: `Tension between ${profiles[i].name} and ${profiles[j].name}`,
          source: 'weight_analysis',
        });
      }
    }
  }

  // Ego-Shadow tension (always present)
  if (coreMappings.ego && coreMappings.shadow) {
    tensions.push({
      polarityPair: [coreMappings.ego.characterRefs[0], coreMappings.shadow.characterRefs[0]],
      recurringConflict: 'Ego-Shadow tension: conscious identity vs repressed aspects',
      source: 'archetype_opposition',
    });
  }
  
  // === NEW: Assessment-derived tensions ===
  // Dominant vs risk edge tension
  if (assessmentSignals.dominantNow.length > 0 && assessmentSignals.riskEdgesNow.length > 0) {
    const dominant = assessmentSignals.dominantNow[0];
    const risk = assessmentSignals.riskEdgesNow[0];
    if (dominant !== risk) {
      tensions.push({
        polarityPair: [dominant, risk],
        recurringConflict: `Current energy (${dominant}) in tension with shadow edge (${risk})`,
        source: 'assessment_signals',
        assessmentRefs: ['LC', 'SP'],
      });
    }
  }

  return tensions;
}

/**
 * Calculate costs and compensations V2 - enhanced with assessment signals
 */
function calculateCostsAndCompensationsV2(profiles, weights, assessmentSignals) {
  const costs = [];
  const compensators = [];
  const avoidedMedicine = [];

  profiles.forEach((profile, index) => {
    const weight = weights[index];
    const traits = profile.behavioralTraits || {};
    const charKey = profile.canonicalId || profile.name;
    const signals = assessmentSignals.characterSignalMatrix?.[charKey] || {};
    
    // Standard liability extraction
    if (traits.liabilities && Array.isArray(traits.liabilities)) {
      traits.liabilities.forEach(liability => {
        // Enhance with cost signal
        const costWeight = weight + (signals.costBoost || 0) * 0.2;
        costs.push({
          cost: liability,
          characterRef: profile.name,
          weight: costWeight,
          assessmentBoosted: signals.costBoost > 0.3,
        });
      });
    }
    
    // Standard compensation extraction
    if (traits.compensations && Array.isArray(traits.compensations)) {
      traits.compensations.forEach(compensation => {
        compensators.push({
          compensation: compensation,
          characterRef: profile.name,
          weight,
        });
      });
    }
  });

  // Avoided medicine
  profiles.forEach(profile => {
    const shadowArchetypes = profile.archetypeSignals?.shadowArchetypes || [];
    if (shadowArchetypes.length > 0) {
      avoidedMedicine.push({
        medicine: `Integration of ${shadowArchetypes[0]}`,
        characterRef: profile.name,
      });
    }
  });

  // Sort costs by assessment-boosted priority
  costs.sort((a, b) => {
    if (a.assessmentBoosted && !b.assessmentBoosted) return -1;
    if (!a.assessmentBoosted && b.assessmentBoosted) return 1;
    return b.weight - a.weight;
  });

  return {
    costs: costs.slice(0, 10),
    compensators: compensators.slice(0, 10),
    avoidedMedicine: avoidedMedicine.slice(0, 5),
  };
}

/**
 * Determine individuation direction V2 - enhanced with assessment signals
 */
function determineIndividuationDirectionV2(profiles, coreMappings, tensions, assessmentSignals) {
  const missingQualities = [];
  const synthesisTrio = [];
  let nextChapterTheme = 'Integration and wholeness';

  // Identify missing qualities from shadow
  if (coreMappings.shadow) {
    const shadowProfile = profiles.find(p => p.name === coreMappings.shadow.characterRefs[0]);
    if (shadowProfile) {
      const shadowArchetypes = shadowProfile.archetypeSignals?.shadowArchetypes || [];
      shadowArchetypes.forEach(archetype => {
        missingQualities.push(`Integration of ${archetype}`);
      });
    }
  }

  // Synthesis trio
  if (coreMappings.ego && coreMappings.shadow && coreMappings.feelingFunction) {
    synthesisTrio.push(
      coreMappings.ego.characterRefs[0],
      coreMappings.shadow.characterRefs[0],
      coreMappings.feelingFunction.characterRefs[0]
    );
  }

  // === NEW: Assessment-derived individuation direction ===
  // Use surprise candidates to enhance next chapter theme
  if (assessmentSignals.surpriseCandidates?.length > 0) {
    const topSurprise = assessmentSignals.surpriseCandidates[0];
    if (topSurprise.pattern === 'shadow_ego_integration') {
      nextChapterTheme = `Integration of light and shadow through ${topSurprise.characterRef}`;
    } else if (topSurprise.pattern === 'cost_growth_edge') {
      nextChapterTheme = `Transforming the cost pattern of ${topSurprise.characterRef} into growth`;
    }
  }

  return {
    missingQualities: missingQualities.slice(0, 5),
    synthesisTrio,
    nextChapterTheme,
    assessmentInsights: assessmentSignals.surpriseCandidates || [],
  };
}

/**
 * Reset previous synthesis (for testing)
 */
export function resetPreviousSynthesis() {
  previousSynthesis = null;
}

/**
 * Apply assessment overrides to weights
 */
function applyAssessmentOverrides(profiles, weights, assessmentAnswers) {
  const adjusted = [...weights];
  
  assessmentAnswers.forEach(answer => {
    if (!answer.selectedCharacterIds || answer.selectedCharacterIds.length === 0) {
      return;
    }

    // Find profile indices for selected characters
    const selectedIndices = answer.selectedCharacterIds
      .map(charId => {
        // Try to match by canonicalId, name, or id
        return profiles.findIndex(p => 
          p.canonicalId === charId || 
          p.name === charId ||
          p.name.toLowerCase() === charId.toLowerCase()
        );
      })
      .filter(idx => idx >= 0);

    if (selectedIndices.length === 0) {
      return;
    }

    // Determine which mapping this assessment affects
    const mappingType = getMappingTypeForAssessment(answer.assessmentType);
    
    // Apply weight delta (boost selected, reduce others slightly)
    const delta = 0.15; // Per spec: scale by confidence if present
    const confidence = answer.confidence || 1.0;
    const scaledDelta = delta * confidence;

    selectedIndices.forEach(idx => {
      adjusted[idx] += scaledDelta / selectedIndices.length;
    });

    // Slightly reduce non-selected (but don't go negative)
    const reduction = scaledDelta / (profiles.length - selectedIndices.length) * 0.3;
    adjusted.forEach((weight, idx) => {
      if (!selectedIndices.includes(idx)) {
        adjusted[idx] = Math.max(0.01, weight - reduction);
      }
    });
  });

  return adjusted;
}

/**
 * Get mapping type for assessment type
 */
function getMappingTypeForAssessment(assessmentType) {
  const mapping = {
    'EGO_POSITION': 'ego',
    'PERSONA_FORMATION': 'persona',
    'SHADOW_PROXIMITY': 'shadow',
    'FEELING_FUNCTION': 'feelingFunction',
    'LIBIDINAL_CHARGE': 'ego',
    'COST_COMPENSATION': 'costsAndCompensations',
    'INDIVIDUATION_DIRECTION': 'individuationDirection',
  };
  return mapping[assessmentType] || null;
}

/**
 * Normalize weights to sum to 1.0
 */
function normalizeWeights(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    // Fallback: equal weights
    return weights.map(() => 1.0 / weights.length);
  }
  return weights.map(w => w / sum);
}

/**
 * Create core mappings - ensures DIFFERENT characters for EACH archetype
 */
function createCoreMappings(profiles, weights, assessmentAnswers) {
  // Track which profiles have been assigned to ensure diversity
  const usedIndices = new Set();
  
  // Order matters: primary archetypes first, then secondary
  const archetypeOrder = [
    { key: 'ego', assessmentType: 'EGO_POSITION' },
    { key: 'shadow', assessmentType: 'SHADOW_PROXIMITY' },
    { key: 'persona', assessmentType: 'PERSONA_FORMATION' },
    { key: 'feelingFunction', assessmentType: 'FEELING_FUNCTION' },
    { key: 'shadowVirtue', assessmentType: 'SHADOW_PROXIMITY' },
    { key: 'erosAxis', assessmentType: null },
  ];

  const mappings = {};
  
  // Assign each archetype to a DIFFERENT character
  for (const { key, assessmentType } of archetypeOrder) {
    const result = findBestFitExclusive(profiles, weights, key, assessmentAnswers, assessmentType, usedIndices);
    mappings[key] = result.mapping;
    if (result.index >= 0) {
      usedIndices.add(result.index);
    }
  }

  // Additional mappings can share characters
  mappings.truthOrientation = findBestFit(profiles, weights, 'truthOrientation', assessmentAnswers);
  mappings.powerStance = findBestFit(profiles, weights, 'powerStance', assessmentAnswers);
  mappings.relationalAsymmetry = findBestFit(profiles, weights, 'relationalAsymmetry', assessmentAnswers);
  mappings.lifePhase = inferLifePhase(profiles, weights);

  console.log('[Synthesis] Core mappings created:');
  console.log('  Ego:', mappings.ego?.characterRefs?.[0]);
  console.log('  Shadow:', mappings.shadow?.characterRefs?.[0]);
  console.log('  Persona:', mappings.persona?.characterRefs?.[0]);
  console.log('  Feeling:', mappings.feelingFunction?.characterRefs?.[0]);
  console.log('  ShadowVirtue:', mappings.shadowVirtue?.characterRefs?.[0]);
  console.log('  Eros:', mappings.erosAxis?.characterRefs?.[0]);

  return mappings;
}

/**
 * Find best fit EXCLUDING already used profiles (ensures diversity)
 */
function findBestFitExclusive(profiles, weights, mappingType, assessmentAnswers, assessmentType, usedIndices) {
  // First, check if assessment explicitly selected a character
  const assessmentAnswer = assessmentAnswers.find(a => a.assessmentType === assessmentType);
  if (assessmentAnswer && assessmentAnswer.selectedCharacterIds && assessmentAnswer.selectedCharacterIds.length > 0) {
    const selectedId = assessmentAnswer.selectedCharacterIds[0];
    const selectedIndex = profiles.findIndex(p => 
      p.canonicalId === selectedId || 
      p.name === selectedId ||
      p.name.toLowerCase() === selectedId.toLowerCase()
    );
    if (selectedIndex >= 0 && !usedIndices.has(selectedIndex)) {
      const selectedProfile = profiles[selectedIndex];
      return {
        index: selectedIndex,
        mapping: {
          characterRefs: [selectedProfile.name],
          rationaleSignals: {
            matchedTraitSignals: [`Selected in ${assessmentType} assessment`],
            characterRefs: [selectedProfile.name],
            assessmentRefs: [assessmentAnswer.questionId || assessmentType],
          },
        },
      };
    }
  }

  // Score each AVAILABLE profile for this mapping
  const scores = profiles.map((profile, index) => {
    // Skip already used profiles
    if (usedIndices.has(index)) {
      return { profile, score: -999, index };
    }
    
    let score = weights[index] * 10; // Base score from weight (scaled up)
    
    // Match based on profile's jungFunctions and archetypes
    const jungFunctions = profile.jungFunctions || {};
    const archetypes = profile.archetypeSignals || {};
    
    switch (mappingType) {
      case 'ego':
        // Hero, leader, and active archetypes are good for ego
        score += matchArchetypeSignal(archetypes.primaryArchetypes, ['Hero', 'Ruler', 'Warrior', 'Leader']) * 2;
        score += matchSignal(jungFunctions.egoMode) * 1.5;
        break;
      case 'shadow':
        // Shadow, outlaw, trickster archetypes
        score += matchArchetypeSignal(archetypes.shadowArchetypes, ['Shadow', 'Outlaw', 'Trickster']) * 2;
        score += matchArchetypeSignal(archetypes.primaryArchetypes, ['Rebel', 'Outlaw', 'Trickster']) * 1.5;
        score += matchSignal(jungFunctions.shadowPattern) * 1;
        break;
      case 'persona':
        // Caregiver, regular, lover archetypes - social adaptation
        score += matchArchetypeSignal(archetypes.primaryArchetypes, ['Caregiver', 'Everyman', 'Lover', 'Creator']) * 2;
        score += matchSignal(jungFunctions.personaMode) * 1.5;
        break;
      case 'feelingFunction':
        // Emotional, empathetic characters
        score += matchArchetypeSignal(archetypes.primaryArchetypes, ['Caregiver', 'Lover', 'Innocent', 'Sage']) * 2;
        score += matchSignal(jungFunctions.feelingChannel) * 1.5;
        // Characters known for emotional depth
        if (profile.name && ['Hunter Adams', 'Patch Adams'].some(n => profile.name.toLowerCase().includes(n.toLowerCase()))) {
          score += 3; // Patch Adams is ideal for feeling function
        }
        break;
      case 'shadowVirtue':
        // Wisdom from darkness
        score += matchArchetypeSignal(archetypes.primaryArchetypes, ['Sage', 'Magician', 'Explorer']) * 1.5;
        score += matchSignal(profile.narrativeArc?.redemption) * 1;
        break;
      case 'erosAxis':
        // Connection and intimacy
        score += matchArchetypeSignal(archetypes.primaryArchetypes, ['Lover', 'Creator', 'Caregiver']) * 2;
        score += matchSignal(jungFunctions.erosNeed) * 1.5;
        break;
    }
    
    return { profile, score, index };
  });

  // Sort by score and pick top
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  
  if (top.score <= -999) {
    // All profiles used, fall back to any
    const fallback = profiles[0];
    return {
      index: -1,
      mapping: {
        characterRefs: [fallback.name],
        rationaleSignals: {
          matchedTraitSignals: ['Fallback assignment'],
          characterRefs: [fallback.name],
          assessmentRefs: [],
        },
      },
    };
  }
  
  return {
    index: top.index,
    mapping: {
      characterRefs: [top.profile.name],
      rationaleSignals: {
        matchedTraitSignals: [`Best ${mappingType} match (score: ${top.score.toFixed(2)})`],
        characterRefs: [top.profile.name],
        assessmentRefs: assessmentAnswer ? [assessmentAnswer.questionId || assessmentType] : [],
      },
    },
  };
}

/**
 * Match against specific archetype keywords
 */
function matchArchetypeSignal(archetypes, keywords) {
  if (!archetypes || !Array.isArray(archetypes)) return 0;
  const matches = archetypes.filter(a => 
    keywords.some(k => a.toLowerCase().includes(k.toLowerCase()))
  );
  return matches.length > 0 ? 1 : 0;
}

/**
 * Find best fit profile for a mapping position
 */
function findBestFit(profiles, weights, mappingType, assessmentAnswers, assessmentType) {
  // First, check if assessment explicitly selected a character
  const assessmentAnswer = assessmentAnswers.find(a => a.assessmentType === assessmentType);
  if (assessmentAnswer && assessmentAnswer.selectedCharacterIds && assessmentAnswer.selectedCharacterIds.length > 0) {
    const selectedId = assessmentAnswer.selectedCharacterIds[0];
    const selectedProfile = profiles.find(p => 
      p.canonicalId === selectedId || 
      p.name === selectedId ||
      p.name.toLowerCase() === selectedId.toLowerCase()
    );
    if (selectedProfile) {
      return {
        characterRefs: [selectedProfile.name],
        rationaleSignals: {
          matchedTraitSignals: [`Selected in ${assessmentType} assessment`],
          characterRefs: [selectedProfile.name],
          assessmentRefs: [assessmentAnswer.questionId || assessmentType],
        },
      };
    }
  }

  // Score each profile for this mapping
  const scores = profiles.map((profile, index) => {
    let score = weights[index]; // Base score from weight
    
    // Match based on profile's jungFunctions
    const jungFunctions = profile.jungFunctions || {};
    
    switch (mappingType) {
      case 'ego':
        score += matchSignal(jungFunctions.egoMode) * 0.3;
        break;
      case 'persona':
        score += matchSignal(jungFunctions.personaMode) * 0.3;
        break;
      case 'shadow':
        score += matchSignal(profile.archetypeSignals?.shadowArchetypes) * 0.3;
        score += matchSignal(jungFunctions.shadowPattern) * 0.2;
        break;
      case 'shadowVirtue':
        // Shadow virtue is often the shadow's light elements
        score += matchSignal(profile.archetypeSignals?.shadowArchetypes) * 0.2;
        break;
      case 'feelingFunction':
        score += matchSignal(jungFunctions.feelingChannel) * 0.3;
        break;
      case 'erosAxis':
        score += matchSignal(jungFunctions.erosNeed) * 0.3;
        break;
      case 'truthOrientation':
        score += matchSignal(jungFunctions.truthOrientation) * 0.3;
        break;
      case 'powerStance':
        score += matchSignal(jungFunctions.powerStance) * 0.3;
        break;
      case 'relationalAsymmetry':
        score += matchSignal(jungFunctions.relationalPattern) * 0.3;
        break;
    }
    
    return { profile, score, index };
  });

  // Sort by score and pick top
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  
  return {
    characterRefs: [top.profile.name],
    rationaleSignals: {
      matchedTraitSignals: [`High ${mappingType} signal from profile`],
      characterRefs: [top.profile.name],
      assessmentRefs: assessmentAnswer ? [assessmentAnswer.questionId || assessmentType] : [],
    },
  };
}

/**
 * Match signal helper
 */
function matchSignal(signal) {
  if (!signal) return 0;
  if (typeof signal === 'string' && signal.length > 0) return 0.5;
  if (Array.isArray(signal) && signal.length > 0) return 0.5;
  return 0;
}

/**
 * Infer life phase
 */
function inferLifePhase(profiles, weights) {
  // Simple heuristic: average narrative arc stage
  // In production, use more sophisticated analysis
  return {
    characterRefs: profiles.map(p => p.name),
    rationaleSignals: {
      matchedTraitSignals: ['Inferred from narrative arcs'],
      characterRefs: profiles.map(p => p.name),
      assessmentRefs: [],
    },
  };
}

/**
 * Identify tensions (polarity pairs, recurring conflicts)
 */
function identifyTensions(profiles, weights, coreMappings) {
  const tensions = [];
  
  // Check for close weights (conflicts)
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const weightDiff = Math.abs(weights[i] - weights[j]);
      if (weightDiff < 0.05) { // Close weights indicate tension
        tensions.push({
          polarityPair: [profiles[i].name, profiles[j].name],
          recurringConflict: `Tension between ${profiles[i].name} and ${profiles[j].name}`,
        });
      }
    }
  }

  // Ego-Shadow tension (always present)
  if (coreMappings.ego && coreMappings.shadow) {
    tensions.push({
      polarityPair: [coreMappings.ego.characterRefs[0], coreMappings.shadow.characterRefs[0]],
      recurringConflict: 'Ego-Shadow tension: conscious identity vs repressed aspects',
    });
  }

  return tensions;
}

/**
 * Calculate costs and compensations
 */
function calculateCostsAndCompensations(profiles, weights) {
  const costs = [];
  const compensators = [];
  const avoidedMedicine = [];

  profiles.forEach((profile, index) => {
    const weight = weights[index];
    const traits = profile.behavioralTraits || {};
    
    if (traits.liabilities && Array.isArray(traits.liabilities)) {
      traits.liabilities.forEach(liability => {
        costs.push({
          cost: liability,
          characterRef: profile.name,
          weight,
        });
      });
    }
    
    if (traits.compensations && Array.isArray(traits.compensations)) {
      traits.compensations.forEach(compensation => {
        compensators.push({
          compensation: compensation,
          characterRef: profile.name,
          weight,
        });
      });
    }
  });

  // Avoided medicine: what the shadow offers but is rejected
  profiles.forEach(profile => {
    const shadowArchetypes = profile.archetypeSignals?.shadowArchetypes || [];
    if (shadowArchetypes.length > 0) {
      avoidedMedicine.push({
        medicine: `Integration of ${shadowArchetypes[0]}`,
        characterRef: profile.name,
      });
    }
  });

  return {
    costs: costs.slice(0, 10), // Limit to top 10
    compensators: compensators.slice(0, 10),
    avoidedMedicine: avoidedMedicine.slice(0, 5),
  };
}

/**
 * Determine individuation direction
 */
function determineIndividuationDirection(profiles, coreMappings, tensions) {
  const missingQualities = [];
  const synthesisTrio = [];
  const nextChapterTheme = 'Integration and wholeness';

  // Identify missing qualities from shadow
  if (coreMappings.shadow) {
    const shadowProfile = profiles.find(p => p.name === coreMappings.shadow.characterRefs[0]);
    if (shadowProfile) {
      const shadowArchetypes = shadowProfile.archetypeSignals?.shadowArchetypes || [];
      shadowArchetypes.forEach(archetype => {
        missingQualities.push(`Integration of ${archetype}`);
      });
    }
  }

  // Synthesis trio: ego, shadow, feeling function
  if (coreMappings.ego && coreMappings.shadow && coreMappings.feelingFunction) {
    synthesisTrio.push(
      coreMappings.ego.characterRefs[0],
      coreMappings.shadow.characterRefs[0],
      coreMappings.feelingFunction.characterRefs[0]
    );
  }

  return {
    missingQualities: missingQualities.slice(0, 5),
    synthesisTrio,
    nextChapterTheme,
  };
}

/**
 * Calculate section attribution
 */
function calculateSectionAttribution(profiles, weights, coreMappings) {
  return {
    ego: coreMappings.ego?.characterRefs || [],
    persona: coreMappings.persona?.characterRefs || [],
    shadow: coreMappings.shadow?.characterRefs || [],
    shadowVirtue: coreMappings.shadowVirtue?.characterRefs || [],
    feelingFunction: coreMappings.feelingFunction?.characterRefs || [],
    erosAxis: coreMappings.erosAxis?.characterRefs || [],
  };
}

// ============================================================================
// V3: EVIDENCE-BASED IDENTIFICATION (No Hard De-duplication)
// ============================================================================

// Scoring thresholds (from spec)
const SCORING_CONFIG = {
  STRONG_SCORE: 0.80,       // No penalty when score >= this
  STRONG_MARGIN: 0.12,      // No penalty when margin >= this
  EXAMPLE_MIN: 0.70,        // No penalty when example support >= this
  TIE_MARGIN: 0.06,         // Apply penalty when margin <= this
  REPEAT_LAMBDA: 0.05,      // Penalty multiplier
  SECONDARY_INCLUDE_MARGIN: 0.10, // Include secondary when margin <= this
  DOMINANCE_ROLES: 3,       // Roles needed for dominant archetype
};

/**
 * Compute role score for a character in a specific role
 * Uses multiple evidence features (all normalized 0..1)
 */
function computeRoleScore(profile, role, weights, profileIndex, assessmentSignals, characterReferences) {
  const features = {
    roleTraitFit: computeRoleTraitFit(profile, role),
    resonanceFit: computeResonanceFit(profile, role, assessmentSignals),
    assessmentFit: computeAssessmentFit(profile, role, assessmentSignals),
    referencePhaseFit: computeReferencePhaseFit(profile, role, characterReferences),
    exampleSupport: computeExampleSupport(profile, role),
    weightFit: weights[profileIndex] || 0, // Base weight from synthesis
  };
  
  // Weighted sum (all features normalized 0..1)
  const featureWeights = {
    roleTraitFit: 0.30,
    resonanceFit: 0.20,
    assessmentFit: 0.15,
    referencePhaseFit: 0.10,
    exampleSupport: 0.10,
    weightFit: 0.15,
  };
  
  let score = 0;
  let evidenceFlags = [];
  
  Object.entries(features).forEach(([key, value]) => {
    score += featureWeights[key] * value;
    if (value >= 0.7) {
      evidenceFlags.push(key);
    }
  });
  
  return {
    score: Math.min(1.0, score),
    features,
    evidenceFlags,
  };
}

/**
 * Compute trait fit for a role (from CharacterProfile/Discovery)
 */
function computeRoleTraitFit(profile, role) {
  if (!profile) return 0;
  
  const roleTraitMap = {
    ego: ['Hero', 'Leader', 'Protagonist', 'Driven', 'Competent'],
    persona: ['Charming', 'Adaptive', 'Performer', 'Social', 'Mask'],
    shadow: ['Villain', 'Dark', 'Repressed', 'Hidden', 'Destructive'],
    shadowVirtue: ['Noble', 'Honorable', 'Virtue', 'Principled', 'Rejected'],
    feelingFunction: ['Emotional', 'Intuitive', 'Relational', 'Empathic', 'Heart'],
    erosAxis: ['Passionate', 'Desire', 'Creative', 'Vitality', 'Life-force'],
  };
  
  const targetTraits = roleTraitMap[role] || [];
  const profileTraits = [
    ...(profile.archetypeSignals?.primaryArchetypes || []),
    ...(profile.behavioralTraits?.strengths || []),
    ...(profile.dominantEnergy || []),
  ].map(t => t?.toLowerCase() || '');
  
  let matches = 0;
  targetTraits.forEach(trait => {
    if (profileTraits.some(pt => pt.includes(trait.toLowerCase()))) {
      matches++;
    }
  });
  
  return Math.min(1.0, matches / Math.max(targetTraits.length, 1));
}

/**
 * Compute resonance fit (situations, emotions, admire/reject)
 */
function computeResonanceFit(profile, role, assessmentSignals) {
  if (!assessmentSignals?.characterSignalMatrix) return 0.5;
  
  const charSignals = assessmentSignals.characterSignalMatrix[profile?.name];
  if (!charSignals) return 0.5;
  
  // Role-specific resonance signals
  const roleResonanceMap = {
    ego: ['dominantNow', 'libidinallyhigh'],
    persona: ['sociallyactivated', 'performative'],
    shadow: ['shadowactivated', 'triggered'],
    shadowVirtue: ['admired', 'rejected'],
    feelingFunction: ['emotionallyengaged', 'relational'],
    erosAxis: ['eros', 'desire', 'passion'],
  };
  
  const signals = roleResonanceMap[role] || [];
  let signalScore = 0;
  
  signals.forEach(signal => {
    if (charSignals[signal] || charSignals[signal.toLowerCase()]) {
      signalScore += 0.25;
    }
  });
  
  return Math.min(1.0, 0.5 + signalScore);
}

/**
 * Compute assessment fit
 */
function computeAssessmentFit(profile, role, assessmentSignals) {
  if (!assessmentSignals?.coverage?.overall) return 0.5; // Neutral if no assessments
  
  const coverage = assessmentSignals.coverage.overall;
  if (coverage < 0.1) return 0.5; // Neutral for low coverage
  
  // Check if assessment explicitly selected this character for this role
  const charSignals = assessmentSignals.characterSignalMatrix?.[profile?.name];
  if (!charSignals) return 0.5;
  
  // Role-specific assessment mappings
  const roleAssessmentMap = {
    ego: 'egoSelected',
    persona: 'personaSelected',
    shadow: 'shadowSelected',
    feelingFunction: 'feelingSelected',
    erosAxis: 'erosSelected',
  };
  
  if (charSignals[roleAssessmentMap[role]]) return 0.9;
  
  return 0.5;
}

/**
 * Compute reference phase fit
 */
function computeReferencePhaseFit(profile, role, characterReferences) {
  if (!characterReferences || characterReferences.length === 0) return 0.5;
  
  const ref = characterReferences.find(r => 
    r.canonicalId === profile?.canonicalId || 
    r.characterName === profile?.name
  );
  
  if (!ref) return 0.5;
  
  // Check phase alignment
  if (ref.phaseId) {
    const phaseRoleMap = {
      phase_hero: ['ego'],
      phase_dark: ['shadow'],
      phase_growth: ['shadowVirtue', 'individuation'],
      phase_relational: ['feelingFunction', 'erosAxis'],
    };
    
    for (const [phase, roles] of Object.entries(phaseRoleMap)) {
      if (ref.phaseId.includes(phase) && roles.includes(role)) {
        return 0.85;
      }
    }
  }
  
  return 0.5;
}

/**
 * Compute example support (availability of role-specific examples)
 */
function computeExampleSupport(profile, role) {
  if (!profile) return 0.3;
  
  // Check if profile has rich content
  const hasRichContent = 
    (profile.behavioralTraits?.strengths?.length > 2) &&
    (profile.archetypeSignals?.primaryArchetypes?.length > 0);
  
  if (hasRichContent) return 0.8;
  if (profile.behavioralTraits?.strengths?.length > 0) return 0.6;
  
  return 0.4;
}

/**
 * Compute Identification Dynamics (Center/Orbit/Compensation) for each archetype
 * V3: Evidence-based selection with soft duplication penalty
 */
function computeIdentificationDynamics(profiles, weights, coreMappings, assessmentAnswers, tensions, assessmentSignals = {}, characterReferences = []) {
  const dynamics = {};
  const archetypes = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis'];
  
  // Track role assignments for repeat penalty (soft, not hard constraint)
  const roleUsageTracker = new Map();
  profiles.forEach(p => {
    roleUsageTracker.set(p.name, { count: 0, roles: [], scores: [] });
  });
  
  // Score all characters for all roles
  const roleScores = {};
  archetypes.forEach(role => {
    roleScores[role] = profiles.map((profile, idx) => ({
      character: profile.name,
      characterId: profile.canonicalId || profile.name,
      ...computeRoleScore(profile, role, weights, idx, assessmentSignals, characterReferences),
    })).sort((a, b) => b.score - a.score);
  });
  
  // Debug: Log role scores (top 3 per role)
  console.log('[Synthesis] Role scores (top 3 per role):');
  archetypes.forEach(role => {
    const top3 = roleScores[role].slice(0, 3).map(s => `${s.character}:${s.score.toFixed(2)}`).join(', ');
    console.log(`  ${role}: ${top3}`);
  });
  
  // Compute dynamics with evidence-based selection
  archetypes.forEach(role => {
    const scores = roleScores[role];
    const top = scores[0];
    const second = scores[1];
    const margin = top.score - (second?.score || 0);
    
    // Determine if penalty should apply
    const shouldApplyPenalty = shouldApplyRepeatPenalty(top, margin, roleUsageTracker);
    
    // Apply penalty if needed
    let primary = top;
    let secondary = [];
    
    if (shouldApplyPenalty) {
      // Re-score with penalty
      const adjustedScores = scores.map(s => ({
        ...s,
        adjustedScore: s.score - computeRepeatPenalty(s.character, roleUsageTracker),
      })).sort((a, b) => b.adjustedScore - a.adjustedScore);
      
      primary = adjustedScores[0];
      console.log(`[Synthesis] Penalty applied for ${role}: ${top.character} -> ${primary.character}`);
    }
    
    // Include secondary if margin is small
    if (margin <= SCORING_CONFIG.SECONDARY_INCLUDE_MARGIN && second) {
      secondary.push({
        characterId: second.characterId,
        character: second.character,
        confidence: second.score,
        evidenceFlags: second.evidenceFlags,
      });
    }
    
    // Record role assignment
    const tracker = roleUsageTracker.get(primary.character);
    if (tracker) {
      tracker.count++;
      tracker.roles.push(role);
      tracker.scores.push(primary.score);
    }
    
    // Build result with primary + secondary format
    dynamics[role] = {
      primary: {
        characterId: primary.characterId,
        character: primary.character,
        confidence: parseFloat(primary.score.toFixed(2)),
        evidenceFlags: primary.evidenceFlags,
      },
      secondary,
      center: buildCenterFromEvidence(profiles, primary, role, coreMappings[role], assessmentAnswers),
      orbit: computeOrbitWithEvidence(profiles, weights, role, assessmentAnswers, tensions, roleScores[role]),
      compensations: [], // Simplified for now
      roleConfidence: computeRoleConfidence(primary.score, margin, primary.evidenceFlags),
    };
  });
  
  // Detect dominant archetype
  const dominantArchetype = detectDominantArchetype(roleUsageTracker, archetypes);
  
  // Log final stats
  console.log('[Synthesis] Final role assignments:');
  roleUsageTracker.forEach((tracker, name) => {
    if (tracker.count > 0) {
      console.log(`  ${name}: ${tracker.count} roles (${tracker.roles.join(', ')})`);
    }
  });
  
  if (dominantArchetype.enabled) {
    console.log(`[Synthesis] DOMINANT ARCHETYPE: ${dominantArchetype.characterName} (${dominantArchetype.roles.join(', ')})`);
  }
  
  // Add dominant archetype to dynamics
  dynamics._dominantArchetype = dominantArchetype;
  
  return dynamics;
}

/**
 * Determine if repeat penalty should be applied
 * Only apply in weak/tied cases
 */
function shouldApplyRepeatPenalty(top, margin, roleUsageTracker) {
  const { STRONG_SCORE, STRONG_MARGIN, EXAMPLE_MIN, TIE_MARGIN } = SCORING_CONFIG;
  
  // No penalty if evidence is strong
  if (top.score >= STRONG_SCORE) return false;
  if (margin >= STRONG_MARGIN) return false;
  if (top.features?.exampleSupport >= EXAMPLE_MIN) return false;
  
  // Check if already assigned
  const tracker = roleUsageTracker.get(top.character);
  if (!tracker || tracker.count === 0) return false;
  
  // Apply penalty only for weak/tied cases
  return margin <= TIE_MARGIN;
}

/**
 * Compute repeat penalty
 */
function computeRepeatPenalty(charName, roleUsageTracker) {
  const { REPEAT_LAMBDA } = SCORING_CONFIG;
  const tracker = roleUsageTracker.get(charName);
  if (!tracker) return 0;
  
  const count = tracker.count;
  if (count <= 1) return 0;
  if (count === 2) return REPEAT_LAMBDA * 0.5;
  if (count === 3) return REPEAT_LAMBDA * 1.0;
  return REPEAT_LAMBDA * 1.5;
}

/**
 * Compute role confidence from score and margin
 */
function computeRoleConfidence(score, margin, evidenceFlags) {
  let confidence = score;
  
  // Boost for strong margin
  if (margin >= 0.15) confidence = Math.min(1.0, confidence + 0.1);
  
  // Boost for multiple evidence flags
  if (evidenceFlags.length >= 3) confidence = Math.min(1.0, confidence + 0.05);
  
  return parseFloat(confidence.toFixed(2));
}

/**
 * Detect if a single character dominates multiple roles
 */
function detectDominantArchetype(roleUsageTracker, archetypes) {
  const { DOMINANCE_ROLES } = SCORING_CONFIG;
  
  let dominant = null;
  
  roleUsageTracker.forEach((tracker, name) => {
    if (tracker.count >= DOMINANCE_ROLES) {
      if (!dominant || tracker.count > dominant.count) {
        dominant = {
          characterName: name,
          count: tracker.count,
          roles: tracker.roles,
          scores: tracker.scores,
        };
      }
    }
  });
  
  if (dominant) {
    // Determine reason flags
    const avgScore = dominant.scores.reduce((a, b) => a + b, 0) / dominant.scores.length;
    const reasonFlags = [];
    
    if (avgScore >= SCORING_CONFIG.STRONG_SCORE) reasonFlags.push('strong_score');
    if (dominant.count >= 4) reasonFlags.push('high_role_count');
    
    return {
      enabled: true,
      characterCanonicalId: dominant.characterName,
      characterName: dominant.characterName,
      roles: dominant.roles,
      reasonFlags,
    };
  }
  
  return { enabled: false };
}

/**
 * Build center from evidence-based selection
 */
function buildCenterFromEvidence(profiles, primary, role, mapping, assessmentAnswers) {
  const profile = profiles.find(p => p.name === primary.character);
  
  const traitSignals = [];
  if (profile?.archetypeSignals?.primaryArchetypes?.length) {
    traitSignals.push(...profile.archetypeSignals.primaryArchetypes.slice(0, 2));
  }
  if (profile?.behavioralTraits?.strengths?.length) {
    traitSignals.push(profile.behavioralTraits.strengths[0]);
  }
  
  return {
    label: `Primary ${role.charAt(0).toUpperCase() + role.slice(1)} Position`,
    characters: [primary.character],
    confidence: primary.confidence,
    rationale: {
      traitSignals: [...new Set(traitSignals)].slice(0, 5),
      assessmentRefs: [],
      exampleRefs: [],
      evidenceFlags: primary.evidenceFlags,
    },
  };
}

/**
 * Compute orbit entries with evidence-based scoring
 */
function computeOrbitWithEvidence(profiles, weights, archetype, assessmentAnswers, tensions, roleScores) {
  const orbit = [];
  const usedInOrbit = new Set();
  
  // Get secondary candidates from role scores
  const candidates = roleScores.slice(1, 4); // 2nd-4th place
  
  const orbitTriggers = getOrbitTriggersForArchetype(archetype);
  
  orbitTriggers.forEach(trigger => {
    // Find best candidate not yet used in orbit
    const candidate = candidates.find(c => !usedInOrbit.has(c.character));
    if (!candidate) return;
    
    usedInOrbit.add(candidate.character);
    
    const profile = profiles.find(p => p.name === candidate.character);
    const costRisk = profile?.behavioralTraits?.liabilities?.[0] 
      ? `Risk of ${profile.behavioralTraits.liabilities[0].toLowerCase()}`
      : 'Risk of overextension';
    
    orbit.push({
      // trigger must be an object with { name, tags } for Flutter compatibility
      trigger: {
        name: trigger.triggerName,
        tags: trigger.tags || [],
      },
      triggerName: trigger.triggerName, // Keep for backwards compat
      tags: trigger.tags,
      character: candidate.character,
      characters: [candidate.character],
      confidence: parseFloat(candidate.score.toFixed(2)),
      costRisk,
      evidenceFlags: candidate.evidenceFlags,
    });
  });
  
  return orbit;
}

/**
 * Get orbit triggers for an archetype
 */
function getOrbitTriggersForArchetype(archetype) {
  const triggers = {
    'ego': [
      { triggerName: 'Under Time Pressure', tags: ['time', 'stakes', 'urgency'] },
      { triggerName: 'When Depleted', tags: ['fatigue', 'burnout', 'stress'] },
    ],
    'persona': [
      { triggerName: 'In High-Stakes Social Settings', tags: ['social', 'performance'] },
      { triggerName: 'When Seeking Approval', tags: ['validation', 'recognition'] },
    ],
    'shadow': [
      { triggerName: 'When Triggered by Injustice', tags: ['anger', 'justice'] },
      { triggerName: 'When Boundaries Are Crossed', tags: ['violation', 'limits'] },
    ],
    'shadowVirtue': [
      { triggerName: 'When Values Are Challenged', tags: ['integrity', 'principles'] },
    ],
    'feelingFunction': [
      { triggerName: 'In Intimate Settings', tags: ['closeness', 'vulnerability'] },
    ],
    'erosAxis': [
      { triggerName: 'When Pursuing Passion', tags: ['desire', 'creativity'] },
    ],
  };
  
  return triggers[archetype] || [];
}

/**
 * Check if a character can take another role based on diversity constraints
 */
function canTakeRole(charName, roleUsageTracker, maxRoles, confidence = 0.5) {
  const tracker = roleUsageTracker.get(charName);
  if (!tracker) return true;
  
  // Allow exceeding max if confidence is very high
  if (confidence >= 0.85) return true;
  
  return tracker.count < maxRoles;
}

/**
 * Record that a character has taken a role
 */
function recordRole(charName, roleName, roleUsageTracker) {
  const tracker = roleUsageTracker.get(charName);
  if (tracker) {
    tracker.count++;
    tracker.roles.push(roleName);
  }
}

/**
 * Compute the CENTER (stable primary position) for an archetype
 * Center = top character(s) by weight, with threshold rules
 * V2: With diversity constraint
 */
function computeCenterWithDiversity(profiles, weights, archetype, mapping, assessmentAnswers, roleUsageTracker, maxRoles, highConfidenceThreshold) {
  const primaryCharacter = mapping.characterRefs?.[0];
  if (!primaryCharacter) return null;
  
  const primaryIndex = profiles.findIndex(p => p.name === primaryCharacter);
  const primaryWeight = primaryIndex >= 0 ? weights[primaryIndex] : 0;
  
  // Find secondary candidates within 0.12 weight gap
  // DIVERSITY: Skip candidates who have hit their role limit
  const WEIGHT_GAP_THRESHOLD = 0.12;
  const secondaryCandidates = profiles
    .map((p, idx) => ({ name: p.name, weight: weights[idx], index: idx }))
    .filter(c => {
      if (c.name === primaryCharacter) return false;
      if (Math.abs(c.weight - primaryWeight) > WEIGHT_GAP_THRESHOLD) return false;
      // Check diversity constraint
      if (!canTakeRole(c.name, roleUsageTracker, maxRoles, c.weight)) return false;
      return true;
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 1); // Max 1 secondary
  
  const characters = [primaryCharacter, ...secondaryCandidates.map(c => c.name)];
  
  // Record roles taken
  secondaryCandidates.forEach(c => {
    recordRole(c.name, `${archetype}_secondary`, roleUsageTracker);
  });
  
  // Determine confidence based on weight dominance
  const weightSum = characters.reduce((sum, name) => {
    const idx = profiles.findIndex(p => p.name === name);
    return sum + (idx >= 0 ? weights[idx] : 0);
  }, 0);
  const confidence = Math.min(0.95, weightSum / 0.5); // Normalize to ~0.95 max
  
  // Collect rationale
  const traitSignals = [];
  const assessmentRefs = [];
  
  characters.forEach(charName => {
    const profile = profiles.find(p => p.name === charName);
    if (profile) {
      if (profile.archetypeSignals?.primaryArchetypes?.length) {
        traitSignals.push(...profile.archetypeSignals.primaryArchetypes.slice(0, 2));
      }
      if (profile.behavioralTraits?.strengths?.length) {
        traitSignals.push(profile.behavioralTraits.strengths[0]);
      }
    }
  });
  
  // Find related assessments
  const archetypeAssessmentMap = {
    'ego': ['EGO_POSITION', 'LIBIDINAL_CHARGE'],
    'persona': ['PERSONA_FORMATION'],
    'shadow': ['SHADOW_PROXIMITY'],
    'shadowVirtue': ['SHADOW_PROXIMITY'],
    'feelingFunction': ['FEELING_FUNCTION'],
    'erosAxis': ['FEELING_FUNCTION', 'LIBIDINAL_CHARGE'],
  };
  
  const relevantTypes = archetypeAssessmentMap[archetype] || [];
  assessmentAnswers.forEach(a => {
    if (relevantTypes.includes(a.assessmentType)) {
      assessmentRefs.push(a.questionId || a.assessmentType);
    }
  });
  
  return {
    label: `Primary ${archetype.charAt(0).toUpperCase() + archetype.slice(1)} Position`,
    characters,
    confidence: parseFloat(confidence.toFixed(2)),
    rationale: {
      traitSignals: [...new Set(traitSignals)].slice(0, 5),
      assessmentRefs: [...new Set(assessmentRefs)].slice(0, 3),
      exampleRefs: [], // To be filled by Example Engine
    },
  };
}

// Legacy function for backwards compatibility
function computeCenter(profiles, weights, archetype, mapping, assessmentAnswers) {
  const dummyTracker = new Map();
  profiles.forEach(p => dummyTracker.set(p.name, { count: 0, roles: [] }));
  return computeCenterWithDiversity(profiles, weights, archetype, mapping, assessmentAnswers, dummyTracker, 999, 0.5);
}

/**
 * Compute ORBIT entries (contextual shifts) for an archetype
 * Derived from specific assessments and tension rules
 * V2: With diversity constraint - prevents same character appearing in all orbits
 */
function computeOrbitWithDiversity(profiles, weights, archetype, assessmentAnswers, tensions, roleUsageTracker, maxRoles) {
  const orbit = [];
  const usedInThisOrbit = new Set(); // Track characters used in this archetype's orbit
  
  // Define trigger mappings from assessments
  const orbitTriggers = {
    'ego': [
      { assessmentType: 'LIBIDINAL_CHARGE', triggerName: 'Under Time Pressure', tags: ['time', 'stakes', 'urgency'] },
      { assessmentType: 'COST_COMPENSATION', triggerName: 'When Depleted', tags: ['fatigue', 'burnout', 'stress'] },
    ],
    'persona': [
      { assessmentType: 'PERSONA_FORMATION', triggerName: 'In High-Stakes Social Settings', tags: ['social', 'performance', 'image'] },
      { assessmentType: 'LIBIDINAL_CHARGE', triggerName: 'When Seeking Approval', tags: ['validation', 'recognition'] },
    ],
    'shadow': [
      { assessmentType: 'SHADOW_PROXIMITY', triggerName: 'When Triggered by Injustice', tags: ['anger', 'justice', 'boundaries'] },
      { assessmentType: 'COST_COMPENSATION', triggerName: 'Under Prolonged Stress', tags: ['stress', 'defense', 'protection'] },
    ],
    'shadowVirtue': [
      { assessmentType: 'SHADOW_PROXIMITY', triggerName: 'In Crisis Moments', tags: ['crisis', 'transformation', 'necessity'] },
    ],
    'feelingFunction': [
      { assessmentType: 'FEELING_FUNCTION', triggerName: 'In Intimate Relationships', tags: ['intimacy', 'vulnerability', 'connection'] },
      { assessmentType: 'LIBIDINAL_CHARGE', triggerName: 'When Emotionally Overwhelmed', tags: ['emotion', 'intensity', 'sensitivity'] },
    ],
    'erosAxis': [
      { assessmentType: 'FEELING_FUNCTION', triggerName: 'In Romantic Contexts', tags: ['romance', 'desire', 'attraction'] },
    ],
  };
  
  const triggers = orbitTriggers[archetype] || [];
  
  triggers.forEach(trigger => {
    // Find assessment answer that matches
    const answer = assessmentAnswers.find(a => a.assessmentType === trigger.assessmentType);
    let orbitCharacter = null;
    let orbitProfile = null;
    
    if (answer?.selectedCharacterIds?.length) {
      const charId = answer.selectedCharacterIds[0];
      orbitProfile = profiles.find(p => 
        p.canonicalId === charId || 
        p.name === charId || 
        p.name.toLowerCase() === charId.toLowerCase()
      );
      if (orbitProfile) {
        // DIVERSITY CHECK: Only use if not at limit and not already used in this orbit
        if (canTakeRole(orbitProfile.name, roleUsageTracker, maxRoles) && !usedInThisOrbit.has(orbitProfile.name)) {
          orbitCharacter = orbitProfile.name;
        }
      }
    }
    
    // Fall back to tension pair characters with diversity check
    if (!orbitCharacter && tensions.length > 0) {
      // Try each tension pair character that hasn't been overused
      for (const tension of tensions) {
        const tensionChars = tension.polarityPair || [];
        for (let i = 1; i < tensionChars.length; i++) { // Start from index 1
          const candidate = tensionChars[i];
          if (!usedInThisOrbit.has(candidate) && canTakeRole(candidate, roleUsageTracker, maxRoles)) {
            orbitCharacter = candidate;
            orbitProfile = profiles.find(p => p.name === candidate);
            break;
          }
        }
        if (orbitCharacter) break;
      }
    }
    
    // Final fallback: pick any profile not at limit
    if (!orbitCharacter) {
      const sortedByWeight = profiles
        .map((p, idx) => ({ profile: p, weight: weights[idx] }))
        .sort((a, b) => b.weight - a.weight);
      
      for (const { profile } of sortedByWeight) {
        if (!usedInThisOrbit.has(profile.name) && canTakeRole(profile.name, roleUsageTracker, maxRoles)) {
          orbitCharacter = profile.name;
          orbitProfile = profile;
          break;
        }
      }
    }
    
    if (!orbitCharacter) return;
    
    // Record usage
    usedInThisOrbit.add(orbitCharacter);
    recordRole(orbitCharacter, `${archetype}_orbit`, roleUsageTracker);
    
    // Derive cost risk from profile liabilities
    const costRisk = orbitProfile?.behavioralTraits?.liabilities?.[0] 
      ? `Risk of ${orbitProfile.behavioralTraits.liabilities[0].toLowerCase()}`
      : 'Risk of overextension';
    
    orbit.push({
      trigger: {
        name: trigger.triggerName,
        tags: trigger.tags,
      },
      characters: [orbitCharacter],
      costRisk,
      rationale: {
        traitSignals: orbitProfile?.archetypeSignals?.primaryArchetypes?.slice(0, 2) || [],
        assessmentRefs: answer ? [answer.questionId || answer.assessmentType] : [],
        exampleRefs: [], // To be filled by Example Engine
      },
    });
  });
  
  // Add tension-based orbit (always present if tensions exist)
  tensions.slice(0, 2).forEach((tension, idx) => {
    if (tension.polarityPair?.length > 1) {
      const tensionCharacter = tension.polarityPair[idx % tension.polarityPair.length];
      const tensionProfile = profiles.find(p => p.name === tensionCharacter);
      
      // Avoid duplicates
      if (orbit.some(o => o.characters.includes(tensionCharacter))) return;
      
      orbit.push({
        trigger: {
          name: 'When Inner Tension Surfaces',
          tags: ['conflict', 'polarity', 'integration'],
        },
        characters: [tensionCharacter],
        costRisk: 'Risk of internal fragmentation',
        rationale: {
          traitSignals: tensionProfile?.archetypeSignals?.primaryArchetypes?.slice(0, 2) || [],
          assessmentRefs: [],
          exampleRefs: [],
        },
      });
    }
  });
  
  // Deterministic sort for stability
  orbit.sort((a, b) => a.trigger.name.localeCompare(b.trigger.name));
  
  return orbit.slice(0, 5); // Max 5 orbit entries
}

/**
 * Compute COMPENSATIONS (what happens when balance is lost)
 * Derived from shadow proximity + cost/compensation patterns
 */
function computeCompensations(profiles, weights, archetype, assessmentAnswers) {
  const compensations = [];
  
  // Find relevant assessments
  const costAnswer = assessmentAnswers.find(a => a.assessmentType === 'COST_COMPENSATION');
  const shadowAnswer = assessmentAnswers.find(a => a.assessmentType === 'SHADOW_PROXIMITY');
  
  // Compensation patterns by archetype
  const compensationPatterns = {
    'ego': [
      { name: 'Withdrawal into Control', when: 'when overwhelmed by demands' },
      { name: 'Overwork and Burnout', when: 'when purpose feels threatened' },
    ],
    'persona': [
      { name: 'Mask Hardening', when: 'when authenticity feels unsafe' },
      { name: 'People-Pleasing Spiral', when: 'when acceptance is uncertain' },
    ],
    'shadow': [
      { name: 'Projection onto Others', when: 'when disowned traits surface' },
      { name: 'Reactive Eruption', when: 'when boundaries are repeatedly crossed' },
    ],
    'shadowVirtue': [
      { name: 'Virtue Suppression', when: 'when the gift feels dangerous' },
    ],
    'feelingFunction': [
      { name: 'Emotional Withdrawal', when: 'when feelings become overwhelming' },
      { name: 'Over-Intellectualization', when: 'when emotional safety is compromised' },
    ],
    'erosAxis': [
      { name: 'Connection Avoidance', when: 'when intimacy feels threatening' },
    ],
  };
  
  const patterns = compensationPatterns[archetype] || [];
  
  patterns.forEach(pattern => {
    // Find a character that represents this compensation
    let compensationCharacter = null;
    let compensationProfile = null;
    
    if (shadowAnswer?.selectedCharacterIds?.length) {
      const charId = shadowAnswer.selectedCharacterIds[0];
      compensationProfile = profiles.find(p => 
        p.canonicalId === charId || 
        p.name === charId ||
        p.name.toLowerCase() === charId.toLowerCase()
      );
      if (compensationProfile) {
        compensationCharacter = compensationProfile.name;
      }
    }
    
    // Fall back to any profile with shadow archetypes
    if (!compensationCharacter) {
      compensationProfile = profiles.find(p => 
        p.archetypeSignals?.shadowArchetypes?.length > 0
      );
      if (compensationProfile) {
        compensationCharacter = compensationProfile.name;
      }
    }
    
    // Last resort: use first profile
    if (!compensationCharacter && profiles.length > 0) {
      compensationProfile = profiles[0];
      compensationCharacter = compensationProfile.name;
    }
    
    if (!compensationCharacter) return;
    
    // Derive expression behaviors from profile
    const expression = [];
    if (compensationProfile?.behavioralTraits?.liabilities?.length) {
      expression.push(...compensationProfile.behavioralTraits.liabilities.slice(0, 2));
    }
    if (expression.length === 0) {
      expression.push('Increased defensiveness', 'Loss of perspective');
    }
    
    // Derive return path from strengths
    const returnPath = compensationProfile?.behavioralTraits?.strengths?.[0]
      ? `Reconnecting with ${compensationProfile.behavioralTraits.strengths[0].toLowerCase()}`
      : 'Returning to core values and practices';
    
    compensations.push({
      name: pattern.name,
      when: pattern.when,
      expression,
      risk: 'Prolonged imbalance leads to exhaustion and loss of self',
      returnPath,
      characters: [compensationCharacter],
      rationale: {
        assessmentRefs: [
          ...(costAnswer ? [costAnswer.questionId || 'COST_COMPENSATION'] : []),
          ...(shadowAnswer ? [shadowAnswer.questionId || 'SHADOW_PROXIMITY'] : []),
        ].slice(0, 2),
        exampleRefs: [], // To be filled by Example Engine
      },
    });
  });
  
  // Deterministic sort for stability
  compensations.sort((a, b) => a.name.localeCompare(b.name));
  
  return compensations.slice(0, 3); // Max 3 compensations
}

/**
 * Compute COMPENSATIONS with diversity constraint
 */
function computeCompensationsWithDiversity(profiles, weights, archetype, assessmentAnswers, roleUsageTracker, maxRoles) {
  const compensations = [];
  const usedInCompensations = new Set();
  
  // Find relevant assessments
  const costAnswer = assessmentAnswers.find(a => a.assessmentType === 'COST_COMPENSATION');
  const shadowAnswer = assessmentAnswers.find(a => a.assessmentType === 'SHADOW_PROXIMITY');
  
  // Compensation patterns by archetype
  const compensationPatterns = {
    'ego': [
      { name: 'Withdrawal into Control', when: 'when overwhelmed by demands' },
      { name: 'Overwork and Burnout', when: 'when purpose feels threatened' },
    ],
    'persona': [
      { name: 'Mask Hardening', when: 'when authenticity feels unsafe' },
      { name: 'People-Pleasing Spiral', when: 'when acceptance is uncertain' },
    ],
    'shadow': [
      { name: 'Projection onto Others', when: 'when disowned traits surface' },
      { name: 'Reactive Eruption', when: 'when boundaries are repeatedly crossed' },
    ],
    'shadowVirtue': [
      { name: 'Virtue Suppression', when: 'when the gift feels dangerous' },
    ],
    'feelingFunction': [
      { name: 'Emotional Withdrawal', when: 'when feelings become overwhelming' },
      { name: 'Over-Intellectualization', when: 'when emotional safety is compromised' },
    ],
    'erosAxis': [
      { name: 'Connection Avoidance', when: 'when intimacy feels threatening' },
    ],
  };
  
  const patterns = compensationPatterns[archetype] || [];
  
  patterns.forEach(pattern => {
    let compensationCharacter = null;
    let compensationProfile = null;
    
    // First try: assessment-selected character with diversity check
    if (shadowAnswer?.selectedCharacterIds?.length) {
      const charId = shadowAnswer.selectedCharacterIds[0];
      compensationProfile = profiles.find(p => 
        (p.canonicalId === charId || p.name === charId || p.name.toLowerCase() === charId.toLowerCase()) &&
        !usedInCompensations.has(p.name) &&
        canTakeRole(p.name, roleUsageTracker, maxRoles)
      );
      if (compensationProfile) {
        compensationCharacter = compensationProfile.name;
      }
    }
    
    // Second try: profile with shadow archetypes (with diversity check)
    if (!compensationCharacter) {
      compensationProfile = profiles.find(p => 
        p.archetypeSignals?.shadowArchetypes?.length > 0 &&
        !usedInCompensations.has(p.name) &&
        canTakeRole(p.name, roleUsageTracker, maxRoles)
      );
      if (compensationProfile) {
        compensationCharacter = compensationProfile.name;
      }
    }
    
    // Third try: any profile not at limit
    if (!compensationCharacter) {
      const sortedByWeight = profiles
        .map((p, idx) => ({ profile: p, weight: weights[idx] }))
        .sort((a, b) => b.weight - a.weight);
      
      for (const { profile } of sortedByWeight) {
        if (!usedInCompensations.has(profile.name) && canTakeRole(profile.name, roleUsageTracker, maxRoles)) {
          compensationCharacter = profile.name;
          compensationProfile = profile;
          break;
        }
      }
    }
    
    if (!compensationCharacter) return;
    
    // Record usage
    usedInCompensations.add(compensationCharacter);
    recordRole(compensationCharacter, `${archetype}_compensation`, roleUsageTracker);
    
    // Derive expression behaviors
    const expression = [];
    if (compensationProfile?.behavioralTraits?.liabilities?.length) {
      expression.push(...compensationProfile.behavioralTraits.liabilities.slice(0, 2));
    }
    if (expression.length === 0) {
      expression.push('Increased defensiveness', 'Loss of perspective');
    }
    
    const returnPath = compensationProfile?.behavioralTraits?.strengths?.[0]
      ? `Reconnecting with ${compensationProfile.behavioralTraits.strengths[0].toLowerCase()}`
      : 'Returning to core values and practices';
    
    compensations.push({
      name: pattern.name,
      when: pattern.when,
      expression,
      risk: 'Prolonged imbalance leads to exhaustion and loss of self',
      returnPath,
      characters: [compensationCharacter],
      rationale: {
        assessmentRefs: [
          ...(costAnswer ? [costAnswer.questionId || 'COST_COMPENSATION'] : []),
          ...(shadowAnswer ? [shadowAnswer.questionId || 'SHADOW_PROXIMITY'] : []),
        ].slice(0, 2),
        exampleRefs: [],
      },
    });
  });
  
  compensations.sort((a, b) => a.name.localeCompare(b.name));
  
  return compensations.slice(0, 3);
}

// Legacy computeOrbit for backwards compatibility
function computeOrbit(profiles, weights, archetype, assessmentAnswers, tensions) {
  const dummyTracker = new Map();
  profiles.forEach(p => dummyTracker.set(p.name, { count: 0, roles: [] }));
  return computeOrbitWithDiversity(profiles, weights, archetype, assessmentAnswers, tensions, dummyTracker, 999);
}

/**
 * Create input hash for caching
 */
function createInputHash(profiles, assessmentAnswers) {
  const profileIds = profiles.map(p => p.canonicalId).sort().join(',');
  const answerIds = assessmentAnswers.map(a => `${a.assessmentType}:${a.selectedCharacterIds?.join(',') || ''}`).sort().join('|');
  return `${profileIds}|${answerIds}`;
}
