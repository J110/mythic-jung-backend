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
  const identificationDynamics = computeIdentificationDynamics(
    profiles, 
    normalizedWeights, 
    coreMappings, 
    assessmentAnswers, 
    tensions
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

/**
 * Compute Identification Dynamics (Center/Orbit/Compensation) for each archetype
 * This provides stable, deterministic mappings that don't change between runs
 */
function computeIdentificationDynamics(profiles, weights, coreMappings, assessmentAnswers, tensions) {
  const dynamics = {};
  const archetypes = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis'];
  
  archetypes.forEach(archetype => {
    const mapping = coreMappings[archetype];
    if (!mapping) return;
    
    dynamics[archetype] = {
      center: computeCenter(profiles, weights, archetype, mapping, assessmentAnswers),
      orbit: computeOrbit(profiles, weights, archetype, assessmentAnswers, tensions),
      compensations: computeCompensations(profiles, weights, archetype, assessmentAnswers),
    };
  });
  
  return dynamics;
}

/**
 * Compute the CENTER (stable primary position) for an archetype
 * Center = top character(s) by weight, with threshold rules
 */
function computeCenter(profiles, weights, archetype, mapping, assessmentAnswers) {
  const primaryCharacter = mapping.characterRefs?.[0];
  if (!primaryCharacter) return null;
  
  const primaryIndex = profiles.findIndex(p => p.name === primaryCharacter);
  const primaryWeight = primaryIndex >= 0 ? weights[primaryIndex] : 0;
  
  // Find secondary candidates within 0.12 weight gap
  const WEIGHT_GAP_THRESHOLD = 0.12;
  const secondaryCandidates = profiles
    .map((p, idx) => ({ name: p.name, weight: weights[idx], index: idx }))
    .filter(c => c.name !== primaryCharacter && Math.abs(c.weight - primaryWeight) <= WEIGHT_GAP_THRESHOLD)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 1); // Max 1 secondary
  
  const characters = [primaryCharacter, ...secondaryCandidates.map(c => c.name)];
  
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

/**
 * Compute ORBIT entries (contextual shifts) for an archetype
 * Derived from specific assessments and tension rules
 */
function computeOrbit(profiles, weights, archetype, assessmentAnswers, tensions) {
  const orbit = [];
  
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
        orbitCharacter = orbitProfile.name;
      }
    }
    
    // Fall back to tension pair characters
    if (!orbitCharacter && tensions.length > 0) {
      const tensionChars = tensions[0].polarityPair;
      if (tensionChars?.length > 1) {
        orbitCharacter = tensionChars[1];
        orbitProfile = profiles.find(p => p.name === orbitCharacter);
      }
    }
    
    if (!orbitCharacter) return;
    
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
 * Create input hash for caching
 */
function createInputHash(profiles, assessmentAnswers) {
  const profileIds = profiles.map(p => p.canonicalId).sort().join(',');
  const answerIds = assessmentAnswers.map(a => `${a.assessmentType}:${a.selectedCharacterIds?.join(',') || ''}`).sort().join('|');
  return `${profileIds}|${answerIds}`;
}
