/**
 * Synthesis Engine
 * Combines 6 CharacterProfiles + assessment answers into a coherent SelfModel.
 * Based on: 03_SYNTHESIS_ENGINE_SPEC.md
 */

/**
 * Synthesize SelfModel from character profiles and assessments
 * @param {CharacterProfile[]} profiles - Array of 6 character profiles
 * @param {Object[]} assessmentAnswers - Assessment answers keyed by questionId
 * @returns {SelfModel}
 */
export function synthesizeSelfModel(profiles, assessmentAnswers = []) {
  if (!profiles || profiles.length !== 6) {
    throw new Error('Exactly 6 character profiles required for synthesis');
  }

  // Step 1: Start with equal weights
  const initialWeights = profiles.map(() => 1.0 / 6.0);
  
  // Step 2: Apply assessment overrides
  const adjustedWeights = applyAssessmentOverrides(profiles, initialWeights, assessmentAnswers);
  
  // Step 3: Normalize weights
  const normalizedWeights = normalizeWeights(adjustedWeights);
  
  // Step 4: Create core mappings
  const coreMappings = createCoreMappings(profiles, normalizedWeights, assessmentAnswers);
  
  // Step 5: Identify tensions
  const tensions = identifyTensions(profiles, normalizedWeights, coreMappings);
  
  // Step 6: Calculate costs and compensations
  const costsAndCompensations = calculateCostsAndCompensations(profiles, normalizedWeights);
  
  // Step 7: Determine individuation direction
  const individuationDirection = determineIndividuationDirection(profiles, coreMappings, tensions);

  // Create input hash for caching
  const inputHash = createInputHash(profiles, assessmentAnswers);

  return {
    meta: {
      synthesisVersion: 'v1',
      inputHash,
      generatedAt: new Date().toISOString(),
    },
    weights: {
      perCharacterWeight: normalizedWeights,
      perSectionAttribution: calculateSectionAttribution(profiles, normalizedWeights, coreMappings),
    },
    coreMappings,
    tensions,
    costsAndCompensations,
    individuationDirection,
  };
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
 * Create input hash for caching
 */
function createInputHash(profiles, assessmentAnswers) {
  const profileIds = profiles.map(p => p.canonicalId).sort().join(',');
  const answerIds = assessmentAnswers.map(a => `${a.assessmentType}:${a.selectedCharacterIds?.join(',') || ''}`).sort().join('|');
  return `${profileIds}|${answerIds}`;
}
