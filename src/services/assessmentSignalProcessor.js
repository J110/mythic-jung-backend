/**
 * Assessment Signal Processor (ASP)
 * Converts raw assessment answers into structured signals for synthesis.
 * 
 * This is a DETERMINISTIC module - no LLM calls.
 * Same inputs always produce same outputs.
 */

/**
 * Question ID to mapping/signal type definitions
 * Each question maps to specific archetype boosts and signal types
 */
const QUESTION_MAPPINGS = {
  // === LIBIDINAL CHARGE (LC) - Current psychic energy ===
  'LC_Q1_REACTING_LIKE': {
    targetComponents: ['ego', 'energyNow'],
    signalType: 'energyNow',
    weight: 0.25,
  },
  'LC_Q2_DRAWN_TO': {
    targetComponents: ['eros', 'energyNow'],
    signalType: 'erosBoost',
    weight: 0.2,
  },
  'LC_Q3_ENERGY_LATELY': {
    targetComponents: ['ego', 'energyNow'],
    signalType: 'energyNow',
    weight: 0.3,
  },
  'LC_Q4_SMALL_STRESS_AUTOMATIC': {
    targetComponents: ['ego', 'shadow'],
    signalType: 'energyNow',
    weight: 0.25,
    triggerTag: 'time_pressure',
  },
  
  // === EGO POSITION (EG) - Core identity anchor ===
  'EG_Q1_INHABIT_POV': {
    targetComponents: ['ego'],
    signalType: 'egoBoost',
    weight: 0.35,
  },
  'EG_Q2_MAKING_DECISION': {
    targetComponents: ['ego'],
    signalType: 'egoBoost',
    weight: 0.25,
  },
  'EG_Q3_REAL_STAKES_DECISIONS': {
    targetComponents: ['ego'],
    signalType: 'egoBoost',
    weight: 0.25,
    triggerTag: 'real_stakes',
  },
  'EG_Q4_CRISIS_MODE': {
    targetComponents: ['ego', 'shadow'],
    signalType: 'egoBoost',
    weight: 0.15,
    triggerTag: 'crisis',
  },
  
  // === PERSONA FORMATION (PF) - Social mask ===
  'PF_Q1_SOCIAL_ADAPTATION': {
    targetComponents: ['persona'],
    signalType: 'personaBoost',
    weight: 0.3,
  },
  'PF_Q2_PROFESSIONAL_SELF': {
    targetComponents: ['persona'],
    signalType: 'personaBoost',
    weight: 0.25,
  },
  'PF_Q3_COSTLY_MASK': {
    targetComponents: ['persona', 'cost'],
    signalType: 'personaBoost',
    weight: 0.25,
    triggerTag: 'costly_mask',
  },
  'PF_Q4_AUTHENTIC_SLIP': {
    targetComponents: ['persona', 'shadow'],
    signalType: 'personaBoost',
    weight: 0.2,
  },
  
  // === SHADOW PROXIMITY (SP) - Disowned aspects ===
  'SP_Q1_CONCERN_BECOMING': {
    targetComponents: ['shadow'],
    signalType: 'shadowBoost',
    weight: 0.3,
    triggerTag: 'shadow_fear',
  },
  'SP_Q2_IRRITATION_TRIGGER': {
    targetComponents: ['shadow'],
    signalType: 'shadowBoost',
    weight: 0.25,
  },
  'SP_Q3_HIDDEN_CAPACITY': {
    targetComponents: ['shadow', 'shadowVirtue'],
    signalType: 'shadowBoost',
    weight: 0.2,
  },
  'SP_Q4_SHADOW_VIRTUE_CONTEXT': {
    targetComponents: ['shadowVirtue'],
    signalType: 'shadowBoost',
    weight: 0.25,
    triggerTag: 'shadow_virtue',
  },
  
  // === FEELING FUNCTION (FF) - Emotional processing ===
  'FF_Q1_EMOTIONAL_PROCESSING': {
    targetComponents: ['feelingFunction'],
    signalType: 'feelingBoost',
    weight: 0.3,
  },
  'FF_Q2_EMPATHY_STYLE': {
    targetComponents: ['feelingFunction'],
    signalType: 'feelingBoost',
    weight: 0.25,
  },
  'FF_Q3_EMOTIONAL_ANCHOR': {
    targetComponents: ['feelingFunction', 'eros'],
    signalType: 'feelingBoost',
    weight: 0.2,
  },
  'FF_Q4_INTIMACY_NEED': {
    targetComponents: ['eros', 'feelingFunction'],
    signalType: 'erosBoost',
    weight: 0.25,
    triggerTag: 'intimacy_need',
  },
  
  // === COST COMPENSATION (CC) - Psychological costs ===
  'CC_Q1_EXHAUSTION_PATTERN': {
    targetComponents: ['cost'],
    signalType: 'costBoost',
    weight: 0.35,
    triggerTag: 'exhaustion',
  },
  'CC_Q2_DRAINING_MODE': {
    targetComponents: ['cost', 'shadow'],
    signalType: 'costBoost',
    weight: 0.3,
    triggerTag: 'draining_mode',
  },
  'CC_Q3_RESTORE_RITUAL': {
    targetComponents: ['cost', 'individuation'],
    signalType: 'restoreBoost',
    weight: 0.35,
    triggerTag: 'restore_ritual',
  },
  
  // === INDIVIDUATION DIRECTION (ID) - Growth path ===
  'ID_Q1_BECOMING_MORE': {
    targetComponents: ['individuation'],
    signalType: 'individuationBoost',
    weight: 0.35,
  },
  'ID_Q2_INTEGRATION_NEED': {
    targetComponents: ['individuation', 'shadow'],
    signalType: 'individuationBoost',
    weight: 0.35,
  },
  'ID_Q3_WHOLENESS_VISION': {
    targetComponents: ['individuation'],
    signalType: 'individuationBoost',
    weight: 0.3,
  },
};

/**
 * Assessment module definitions with question counts
 */
const ASSESSMENT_MODULES = {
  'LIBIDINAL_CHARGE': { questionCount: 4, prefix: 'LC' },
  'EGO_POSITION': { questionCount: 4, prefix: 'EG' },
  'PERSONA_FORMATION': { questionCount: 4, prefix: 'PF' },
  'SHADOW_PROXIMITY': { questionCount: 4, prefix: 'SP' },
  'FEELING_FUNCTION': { questionCount: 4, prefix: 'FF' },
  'COST_COMPENSATION': { questionCount: 3, prefix: 'CC' },
  'INDIVIDUATION_DIRECTION': { questionCount: 3, prefix: 'ID' },
};

/**
 * Process assessment answers into structured signals
 * @param {Array} assessmentAnswers - Raw assessment answers
 * @param {Array} profiles - Character profiles for character lookup
 * @returns {AssessmentSignals}
 */
export function processAssessmentSignals(assessmentAnswers = [], profiles = []) {
  // Compute coverage per module
  const coverage = computeCoverage(assessmentAnswers);
  
  // Build character signal matrix
  const characterSignalMatrix = buildCharacterSignalMatrix(assessmentAnswers, profiles, coverage);
  
  // Extract context triggers
  const contextTriggers = extractContextTriggers(assessmentAnswers, profiles);
  
  // Compute module weights (how much to trust each module based on coverage)
  const moduleWeights = computeModuleWeights(coverage);
  
  // Identify current dominant characters (from LC answers)
  const dominantNow = identifyDominantNow(assessmentAnswers, profiles);
  
  // Identify eros need characters (from FF_Q4)
  const erosNeedNow = identifyErosNeedNow(assessmentAnswers, profiles);
  
  // Identify risk edge characters (from SP answers)
  const riskEdgesNow = identifyRiskEdges(assessmentAnswers, profiles);
  
  // Compute surprise candidates (grounded insights)
  const surpriseCandidates = computeSurpriseCandidates(assessmentAnswers, profiles, characterSignalMatrix);
  
  return {
    signalsVersion: '1.0',
    coverage,
    moduleWeights,
    characterSignalMatrix,
    contextTriggers,
    dominantNow,
    erosNeedNow,
    riskEdgesNow,
    surpriseCandidates,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Compute coverage per assessment module
 */
function computeCoverage(assessmentAnswers) {
  const coverage = {};
  let totalAnswered = 0;
  let totalQuestions = 0;
  
  Object.entries(ASSESSMENT_MODULES).forEach(([moduleType, config]) => {
    const moduleAnswers = assessmentAnswers.filter(a => 
      a.assessmentType === moduleType || 
      (a.questionId && a.questionId.startsWith(config.prefix + '_'))
    );
    
    const answered = moduleAnswers.filter(a => 
      a.selectedCharacterIds && a.selectedCharacterIds.length > 0
    ).length;
    
    coverage[moduleType] = answered / config.questionCount;
    totalAnswered += answered;
    totalQuestions += config.questionCount;
  });
  
  coverage.overall = totalQuestions > 0 ? totalAnswered / totalQuestions : 0;
  
  return coverage;
}

/**
 * Build character signal matrix
 * Each character gets boost values for each archetype component
 */
function buildCharacterSignalMatrix(assessmentAnswers, profiles, coverage) {
  const matrix = {};
  
  // Initialize matrix for each character
  profiles.forEach(profile => {
    const charId = profile.canonicalId || profile.name;
    matrix[charId] = {
      characterName: profile.name,
      egoBoost: 0,
      personaBoost: 0,
      shadowBoost: 0,
      feelingBoost: 0,
      erosBoost: 0,
      costBoost: 0,
      individuationBoost: 0,
      energyNow: 0,
      totalSignalStrength: 0,
    };
  });
  
  // Process each answer
  assessmentAnswers.forEach(answer => {
    if (!answer.selectedCharacterIds || answer.selectedCharacterIds.length === 0) {
      return;
    }
    
    // Find the question mapping
    const questionMapping = QUESTION_MAPPINGS[answer.questionId] || 
      getDefaultMappingForAssessmentType(answer.assessmentType);
    
    if (!questionMapping) return;
    
    // Get module coverage for scaling
    const moduleType = getModuleTypeFromQuestionId(answer.questionId) || answer.assessmentType;
    const moduleCoverage = coverage[moduleType] || 0.5;
    
    // Calculate delta (scaled by weight and confidence)
    const confidence = answer.confidence || 1.0;
    const delta = questionMapping.weight * confidence * moduleCoverage;
    
    // Apply boost to selected characters
    answer.selectedCharacterIds.forEach(charId => {
      const charKey = findCharacterKey(charId, profiles, matrix);
      if (!charKey || !matrix[charKey]) return;
      
      // Apply signal type boost
      const signalType = questionMapping.signalType;
      if (matrix[charKey][signalType] !== undefined) {
        matrix[charKey][signalType] += delta / answer.selectedCharacterIds.length;
      }
      
      matrix[charKey].totalSignalStrength += delta / answer.selectedCharacterIds.length;
    });
  });
  
  // Normalize boosts within each signal type
  normalizeSignalMatrix(matrix);
  
  return matrix;
}

/**
 * Find character key in matrix (handles various ID formats)
 */
function findCharacterKey(charId, profiles, matrix) {
  // Direct match
  if (matrix[charId]) return charId;
  
  // Try name match
  const profile = profiles.find(p => 
    p.canonicalId === charId || 
    p.name === charId ||
    p.name.toLowerCase() === charId.toLowerCase()
  );
  
  if (profile) {
    return profile.canonicalId || profile.name;
  }
  
  return null;
}

/**
 * Normalize signal matrix so boosts are comparable
 */
function normalizeSignalMatrix(matrix) {
  const signalTypes = ['egoBoost', 'personaBoost', 'shadowBoost', 'feelingBoost', 
                       'erosBoost', 'costBoost', 'individuationBoost', 'energyNow'];
  
  signalTypes.forEach(signalType => {
    const values = Object.values(matrix).map(m => m[signalType]);
    const max = Math.max(...values, 0.01);
    
    Object.keys(matrix).forEach(charKey => {
      matrix[charKey][signalType] = parseFloat((matrix[charKey][signalType] / max).toFixed(3));
    });
  });
}

/**
 * Extract context triggers from answers
 */
function extractContextTriggers(assessmentAnswers, profiles) {
  const triggers = [];
  
  assessmentAnswers.forEach(answer => {
    const mapping = QUESTION_MAPPINGS[answer.questionId];
    if (!mapping || !mapping.triggerTag) return;
    if (!answer.selectedCharacterIds || answer.selectedCharacterIds.length === 0) return;
    
    triggers.push({
      triggerTag: mapping.triggerTag,
      supportingQuestionIds: [answer.questionId],
      dominantCharacterIds: answer.selectedCharacterIds,
      confidence: answer.confidence || 1.0,
    });
  });
  
  // Merge triggers with same tag
  const mergedTriggers = [];
  triggers.forEach(t => {
    const existing = mergedTriggers.find(m => m.triggerTag === t.triggerTag);
    if (existing) {
      existing.supportingQuestionIds.push(...t.supportingQuestionIds);
      existing.dominantCharacterIds = [...new Set([...existing.dominantCharacterIds, ...t.dominantCharacterIds])];
      existing.confidence = Math.max(existing.confidence, t.confidence);
    } else {
      mergedTriggers.push({ ...t });
    }
  });
  
  return mergedTriggers;
}

/**
 * Compute module weights based on coverage
 */
function computeModuleWeights(coverage) {
  const weights = {};
  
  Object.keys(ASSESSMENT_MODULES).forEach(moduleType => {
    // Weight increases with coverage (min 0.2, max 1.0)
    weights[moduleType] = Math.max(0.2, Math.min(1.0, 0.2 + coverage[moduleType] * 0.8));
  });
  
  return weights;
}

/**
 * Identify currently dominant characters (from Libidinal Charge)
 */
function identifyDominantNow(assessmentAnswers, profiles) {
  const lcAnswers = assessmentAnswers.filter(a => 
    a.assessmentType === 'LIBIDINAL_CHARGE' ||
    (a.questionId && a.questionId.startsWith('LC_'))
  );
  
  if (lcAnswers.length === 0) return [];
  
  // Count character appearances in LC answers
  const charCounts = {};
  lcAnswers.forEach(answer => {
    (answer.selectedCharacterIds || []).forEach(charId => {
      const profile = profiles.find(p => 
        p.canonicalId === charId || 
        p.name === charId ||
        p.name.toLowerCase() === charId.toLowerCase()
      );
      if (profile) {
        const key = profile.name;
        charCounts[key] = (charCounts[key] || 0) + 1;
      }
    });
  });
  
  // Sort by count and return top 2
  return Object.entries(charCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
}

/**
 * Identify eros need characters (from FF_Q4)
 */
function identifyErosNeedNow(assessmentAnswers, profiles) {
  const ffQ4 = assessmentAnswers.find(a => 
    a.questionId === 'FF_Q4_INTIMACY_NEED' ||
    (a.assessmentType === 'FEELING_FUNCTION' && a.selectedCharacterIds?.length)
  );
  
  if (!ffQ4?.selectedCharacterIds?.length) return [];
  
  return ffQ4.selectedCharacterIds.map(charId => {
    const profile = profiles.find(p => 
      p.canonicalId === charId || 
      p.name === charId ||
      p.name.toLowerCase() === charId.toLowerCase()
    );
    return profile?.name;
  }).filter(Boolean);
}

/**
 * Identify risk edge characters (from Shadow Proximity)
 */
function identifyRiskEdges(assessmentAnswers, profiles) {
  const spAnswers = assessmentAnswers.filter(a => 
    a.assessmentType === 'SHADOW_PROXIMITY' ||
    (a.questionId && a.questionId.startsWith('SP_'))
  );
  
  if (spAnswers.length === 0) return [];
  
  // Characters selected in SP represent risk edges
  const riskChars = new Set();
  spAnswers.forEach(answer => {
    (answer.selectedCharacterIds || []).forEach(charId => {
      const profile = profiles.find(p => 
        p.canonicalId === charId || 
        p.name === charId ||
        p.name.toLowerCase() === charId.toLowerCase()
      );
      if (profile) {
        riskChars.add(profile.name);
      }
    });
  });
  
  return [...riskChars].slice(0, 3);
}

/**
 * Compute surprise candidates (grounded insights)
 * Each surprise must have at least 1 trait signal AND 1 assessment ref
 */
function computeSurpriseCandidates(assessmentAnswers, profiles, characterSignalMatrix) {
  const surprises = [];
  
  // Look for unexpected high-signal characters
  Object.entries(characterSignalMatrix).forEach(([charId, signals]) => {
    const profile = profiles.find(p => p.canonicalId === charId || p.name === charId);
    if (!profile) return;
    
    // Check for surprising signal combinations
    const surprisingPatterns = [];
    
    // High shadow + high ego = integration opportunity
    if (signals.shadowBoost > 0.6 && signals.egoBoost > 0.4) {
      surprisingPatterns.push({
        pattern: 'shadow_ego_integration',
        description: `${profile.name} holds both light and shadow aspects of your identity`,
      });
    }
    
    // High feeling + low eros = blocked intimacy
    if (signals.feelingBoost > 0.6 && signals.erosBoost < 0.3) {
      surprisingPatterns.push({
        pattern: 'feeling_eros_disconnect',
        description: `Through ${profile.name}, you process emotions but may guard against deeper connection`,
      });
    }
    
    // High cost + high individuation = growth edge
    if (signals.costBoost > 0.5 && signals.individuationBoost > 0.5) {
      surprisingPatterns.push({
        pattern: 'cost_growth_edge',
        description: `${profile.name} represents both a cost pattern and your growth direction`,
      });
    }
    
    surprisingPatterns.forEach(sp => {
      // Find supporting assessment refs
      const supportingAnswers = assessmentAnswers.filter(a => 
        a.selectedCharacterIds?.includes(charId) ||
        a.selectedCharacterIds?.includes(profile.name)
      );
      
      if (supportingAnswers.length === 0) return;
      
      // Get trait signals
      const traitSignals = profile.archetypeSignals?.primaryArchetypes?.slice(0, 2) || [];
      if (traitSignals.length === 0 && profile.behavioralTraits?.strengths?.length) {
        traitSignals.push(profile.behavioralTraits.strengths[0]);
      }
      
      if (traitSignals.length === 0) return;
      
      surprises.push({
        characterRef: profile.name,
        pattern: sp.pattern,
        insight: sp.description,
        assessmentRefs: supportingAnswers.map(a => a.questionId || a.assessmentType).slice(0, 2),
        traitSignals: traitSignals.slice(0, 2),
        confidence: Math.min(signals.totalSignalStrength, 0.9),
      });
    });
  });
  
  // Sort by confidence and return top 3
  return surprises
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

/**
 * Get module type from question ID
 */
function getModuleTypeFromQuestionId(questionId) {
  if (!questionId) return null;
  
  const prefix = questionId.split('_')[0];
  const moduleMap = {
    'LC': 'LIBIDINAL_CHARGE',
    'EG': 'EGO_POSITION',
    'PF': 'PERSONA_FORMATION',
    'SP': 'SHADOW_PROXIMITY',
    'FF': 'FEELING_FUNCTION',
    'CC': 'COST_COMPENSATION',
    'ID': 'INDIVIDUATION_DIRECTION',
  };
  
  return moduleMap[prefix] || null;
}

/**
 * Get default mapping for assessment type (when questionId not in mapping table)
 */
function getDefaultMappingForAssessmentType(assessmentType) {
  const defaults = {
    'LIBIDINAL_CHARGE': { targetComponents: ['ego', 'energyNow'], signalType: 'energyNow', weight: 0.2 },
    'EGO_POSITION': { targetComponents: ['ego'], signalType: 'egoBoost', weight: 0.25 },
    'PERSONA_FORMATION': { targetComponents: ['persona'], signalType: 'personaBoost', weight: 0.25 },
    'SHADOW_PROXIMITY': { targetComponents: ['shadow'], signalType: 'shadowBoost', weight: 0.25 },
    'FEELING_FUNCTION': { targetComponents: ['feelingFunction'], signalType: 'feelingBoost', weight: 0.25 },
    'COST_COMPENSATION': { targetComponents: ['cost'], signalType: 'costBoost', weight: 0.3 },
    'INDIVIDUATION_DIRECTION': { targetComponents: ['individuation'], signalType: 'individuationBoost', weight: 0.3 },
  };
  
  return defaults[assessmentType] || null;
}

/**
 * Compute stability smoothing alpha based on coverage
 * Prevents chaotic identity flipping from partial answers
 */
export function computeStabilityAlpha(coverage) {
  const overallCoverage = coverage?.overall || 0;
  // alpha = clamp(0.15 + overallCoverage*0.85, 0.15, 1.0)
  return Math.max(0.15, Math.min(1.0, 0.15 + overallCoverage * 0.85));
}

/**
 * Check if ego center can change based on coverage threshold
 */
export function canEgoCenterChange(coverage) {
  // Ego center may change only if EGO_POSITION coverage >= 0.67
  return (coverage?.EGO_POSITION || 0) >= 0.67;
}
