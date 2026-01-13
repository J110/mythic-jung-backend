/**
 * Archetype Constellation Engine
 * 
 * Computes:
 * 1. Structural archetype assignments (reuses existing synthesis)
 * 2. Motif scores (deterministic, weighted by resonance & phase)
 * 3. Relationship constellation (shared, complementary, tension)
 * 
 * DETERMINISTIC: LLM is only used for phrasing, not motif selection.
 */

import {
  TAXONOMY_VERSION,
  StructuralArchetype,
  MotifArchetype,
  MOTIF_ARCHETYPES,
  MOTIF_LABELS,
  MOTIF_DESCRIPTIONS,
  TENSION_PAIRS,
  TENSION_THEME_LABELS,
  SHADOW_LIKELY_MOTIFS,
  TRAIT_TO_MOTIF_MAP,
  SCORING,
  FIELD_LABELS,
  STRUCTURAL_LABELS,
} from '../config/archetypeTaxonomy.js';

// ============================================================================
// MAIN EXPORTS
// ============================================================================

/**
 * Compute constellation for a single subject (Me or Partner)
 * 
 * @param {Object} selfModel - SelfModel from synthesis
 * @param {Array} profiles - CharacterProfile array
 * @param {Object} resonanceData - Optional resonance signals
 * @param {Array} assessmentAnswers - Optional assessment data
 * @returns {Object} ConstellationSummary
 */
export function computeConstellation(selfModel, profiles, resonanceData = null, assessmentAnswers = []) {
  console.log('[ConstellationEngine] Computing constellation...');
  
  // 1. Extract structural archetypes from existing synthesis
  const structural = extractStructuralFromSynthesis(selfModel, profiles);
  
  // 2. Compute motif scores (deterministic)
  const motifScores = computeMotifScores(profiles, resonanceData, assessmentAnswers, selfModel);
  
  // 3. Select top and shadow motifs
  const topMotifs = selectTopMotifs(motifScores);
  const shadowMotifs = selectShadowMotifs(motifScores, resonanceData);
  
  console.log('[ConstellationEngine] Top motifs:', topMotifs.map(m => m.motif).join(', '));
  console.log('[ConstellationEngine] Shadow motifs:', shadowMotifs.map(m => m.motif).join(', '));
  
  return {
    structural,
    motifs: {
      top: topMotifs,
      shadow: shadowMotifs,
      distribution: motifScores,
    },
    meta: {
      taxonomyVersion: TAXONOMY_VERSION,
      computedAt: new Date().toISOString(),
    },
  };
}

/**
 * Compute relationship constellation between Me and Partner
 * 
 * @param {Object} meConstellation - Me constellation
 * @param {Object} partnerConstellation - Partner constellation
 * @param {Object} relationshipModel - Optional relationship model for field tensions
 * @returns {Object} RelationshipConstellation
 */
export function computeRelationshipConstellation(meConstellation, partnerConstellation, relationshipModel = null) {
  console.log('[ConstellationEngine] Computing relationship constellation...');
  
  const meMotifs = meConstellation.motifs.distribution;
  const partnerMotifs = partnerConstellation.motifs.distribution;
  
  // 1. Find shared motifs
  const shared = findSharedMotifs(meMotifs, partnerMotifs);
  
  // 2. Find complementary motifs
  const complementary = findComplementaryMotifs(meMotifs, partnerMotifs);
  
  // 3. Find tension pairs
  const tensions = findTensionPairs(meMotifs, partnerMotifs, relationshipModel);
  
  // 4. Determine field label
  const field = determineFieldLabel(shared, complementary, tensions);
  
  console.log('[ConstellationEngine] Shared:', shared.map(s => s.motif).join(', '));
  console.log('[ConstellationEngine] Complementary:', complementary.map(c => c.motif).join(', '));
  console.log('[ConstellationEngine] Tensions:', tensions.map(t => t.pair.join('-')).join(', '));
  console.log('[ConstellationEngine] Field:', field.label);
  
  return {
    shared,
    complementary,
    tensions,
    field,
    meta: {
      taxonomyVersion: TAXONOMY_VERSION,
      computedAt: new Date().toISOString(),
    },
  };
}

// ============================================================================
// STRUCTURAL ARCHETYPE EXTRACTION
// ============================================================================

/**
 * Extract structural archetypes from existing synthesis
 */
function extractStructuralFromSynthesis(selfModel, profiles) {
  const mappings = selfModel?.coreMappings || {};
  const dynamics = selfModel?.identificationDynamics || {};
  
  // Helper to get character info from mapping
  const getCharacterInfo = (mapping, dynamicsKey) => {
    const dynData = dynamics[dynamicsKey];
    const charName = mapping?.characterRefs?.[0] || dynData?.center?.characters?.[0];
    const secondary = mapping?.characterRefs?.slice(1) || dynData?.center?.secondary?.map(s => s.characterId) || [];
    const confidence = dynData?.center?.confidence || mapping?.confidence || 0.5;
    
    return {
      primary: charName || null,
      secondary,
      confidence,
    };
  };
  
  // Build structural summary
  const structural = {
    [StructuralArchetype.EGO]: getCharacterInfo(mappings.ego, 'ego'),
    [StructuralArchetype.PERSONA]: getCharacterInfo(mappings.persona, 'persona'),
    [StructuralArchetype.SHADOW]: getCharacterInfo(mappings.shadow, 'shadow'),
    [StructuralArchetype.ANIMA_ANIMUS]: getCharacterInfo(mappings.feelingFunction, 'feelingFunction'),
    [StructuralArchetype.SELF_DIRECTION]: {
      vector: extractSelfDirectionVector(selfModel, profiles),
      confidence: mappings.individuationDirection?.confidence || 0.5,
    },
  };
  
  return structural;
}

/**
 * Extract self-direction vector from individuation and tensions
 */
function extractSelfDirectionVector(selfModel, profiles) {
  const vectors = [];
  
  // From individuation direction
  const individuation = selfModel?.individuationDirection;
  if (individuation?.theme) {
    vectors.push(individuation.theme.toLowerCase());
  }
  if (individuation?.challenge) {
    vectors.push(individuation.challenge.toLowerCase());
  }
  
  // From top tensions
  const tensions = selfModel?.tensions || [];
  tensions.slice(0, 2).forEach(t => {
    if (t.recurringConflict) {
      // Extract key theme words
      const words = t.recurringConflict.toLowerCase().split(/\s+/);
      const themeWords = words.filter(w => 
        ['integration', 'softening', 'intimacy', 'power', 'freedom', 'control', 'growth', 'balance'].includes(w)
      );
      vectors.push(...themeWords);
    }
  });
  
  // Default vectors if none found
  if (vectors.length === 0) {
    vectors.push('integration', 'growth');
  }
  
  // Return unique vectors (max 4)
  return [...new Set(vectors)].slice(0, 4);
}

// ============================================================================
// MOTIF SCORING (DETERMINISTIC)
// ============================================================================

/**
 * Compute motif scores across all characters
 * 
 * motifScore(m) = Σ over characters c:
 *   baseMotifWeight(c,m) * phaseMultiplier(c) * resonanceMultiplier(c) * assessmentMultiplier(c)
 */
function computeMotifScores(profiles, resonanceData, assessmentAnswers, selfModel) {
  // Initialize all motif scores to 0
  const scores = {};
  MOTIF_ARCHETYPES.forEach(motif => {
    scores[motif] = 0;
  });
  
  // Process each character profile
  profiles.forEach((profile, idx) => {
    const charName = profile.name || profile.canonicalName;
    
    // Get base motif weights from profile (or compute from traits)
    const baseMotifs = getBaseMotifWeights(profile);
    
    // Get multipliers
    const phaseMultiplier = computePhaseMultiplier(profile, resonanceData);
    const resonanceMultiplier = computeResonanceMultiplier(profile, resonanceData);
    const assessmentMultiplier = computeAssessmentMultiplier(profile, assessmentAnswers, selfModel);
    
    // Aggregate scores
    Object.entries(baseMotifs).forEach(([motif, baseWeight]) => {
      const contribution = baseWeight * phaseMultiplier * resonanceMultiplier * assessmentMultiplier;
      scores[motif] = (scores[motif] || 0) + contribution;
    });
  });
  
  // Normalize scores to 0..1
  const maxScore = Math.max(...Object.values(scores), 0.01);
  const normalized = {};
  Object.entries(scores).forEach(([motif, score]) => {
    normalized[motif] = Math.min(1, score / maxScore);
  });
  
  // Return as sorted array
  return Object.entries(normalized)
    .map(([motif, score]) => ({ motif, score: Math.round(score * 100) / 100 }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get base motif weights from a character profile
 * Uses profile.motifs if available, otherwise computes from traits
 */
function getBaseMotifWeights(profile) {
  // If profile already has motif weights, use them
  if (profile.motifs && Array.isArray(profile.motifs)) {
    const weights = {};
    profile.motifs.forEach(m => {
      weights[m.motif] = m.weight;
    });
    return weights;
  }
  
  // Otherwise, compute from traits
  const weights = {};
  MOTIF_ARCHETYPES.forEach(motif => {
    weights[motif] = 0;
  });
  
  // Extract traits from profile
  const allTraits = extractAllTraits(profile);
  
  // Map traits to motifs
  allTraits.forEach(trait => {
    const traitLower = trait.toLowerCase().trim();
    const mapping = TRAIT_TO_MOTIF_MAP[traitLower];
    if (mapping) {
      weights[mapping.motif] = Math.max(weights[mapping.motif] || 0, mapping.weight);
    }
  });
  
  // Also check archetype signals
  const archetypes = profile.archetypeSignals?.primaryArchetypes || [];
  archetypes.forEach(arch => {
    const archLower = arch.toLowerCase().trim();
    const mapping = TRAIT_TO_MOTIF_MAP[archLower];
    if (mapping) {
      weights[mapping.motif] = Math.max(weights[mapping.motif] || 0, mapping.weight);
    }
  });
  
  return weights;
}

/**
 * Extract all traits from a character profile
 */
function extractAllTraits(profile) {
  const traits = [];
  
  // Primary archetypes
  if (profile.archetypeSignals?.primaryArchetypes) {
    traits.push(...profile.archetypeSignals.primaryArchetypes);
  }
  
  // Behavioral traits
  if (profile.behavioralTraits) {
    if (profile.behavioralTraits.strengths) traits.push(...profile.behavioralTraits.strengths);
    if (profile.behavioralTraits.liabilities) traits.push(...profile.behavioralTraits.liabilities);
    if (profile.behavioralTraits.unconsciousDrivers) traits.push(...profile.behavioralTraits.unconsciousDrivers);
  }
  
  // Shadow elements
  if (profile.shadowElements?.elements) {
    traits.push(...profile.shadowElements.elements);
  }
  
  // Core drives
  if (profile.coreDrives) {
    traits.push(...profile.coreDrives);
  }
  
  return traits;
}

/**
 * Compute phase multiplier based on phase selection/exclusion
 */
function computePhaseMultiplier(profile, resonanceData) {
  if (!resonanceData) return 1.0;
  
  const charName = profile.name || profile.canonicalName;
  const charRef = resonanceData.characterReferences?.find(r => 
    r.characterName === charName || r.canonicalId?.includes(charName.toLowerCase())
  );
  
  if (!charRef) return 1.0;
  
  // Check if phase is excluded
  const excludedPhases = charRef.excludedPhaseIds || [];
  const selectedPhase = charRef.phaseId;
  
  // If profile has phase data
  if (profile.arcPhases && selectedPhase) {
    const matchingPhase = profile.arcPhases.find(p => p.phaseId === selectedPhase);
    if (matchingPhase) {
      return SCORING.PHASE_MATCH_MULTIPLIER; // 1.2
    }
  }
  
  // Check exclusions against profile traits
  if (excludedPhases.length > 0) {
    // If this character's traits align with excluded phases, reduce weight
    const profileTraits = extractAllTraits(profile).map(t => t.toLowerCase());
    const hasExcludedTrait = excludedPhases.some(phase => 
      profileTraits.some(trait => trait.includes(phase.toLowerCase()))
    );
    if (hasExcludedTrait) {
      return SCORING.PHASE_EXCLUDE_MULTIPLIER; // 0
    }
  }
  
  return 1.0;
}

/**
 * Compute resonance multiplier from resonance signals
 */
function computeResonanceMultiplier(profile, resonanceData) {
  if (!resonanceData) return 1.0;
  
  let multiplier = 1.0;
  const charName = profile.name || profile.canonicalName;
  
  // Context matching
  const contexts = resonanceData.contexts || [];
  const profileTraits = extractAllTraits(profile).map(t => t.toLowerCase());
  let contextBoost = 0;
  contexts.forEach(ctx => {
    const ctxLower = (ctx.situation || ctx).toLowerCase();
    if (profileTraits.some(t => ctxLower.includes(t))) {
      contextBoost += SCORING.CONTEXT_BOOST;
    }
  });
  multiplier += Math.min(contextBoost, SCORING.CONTEXT_CAP);
  
  // Emotion signals
  const emotions = resonanceData.emotions || [];
  const positiveEmotions = ['energized', 'seen', 'challenged', 'inspired'];
  if (emotions.some(e => positiveEmotions.includes(e.toLowerCase()))) {
    multiplier += SCORING.EMOTION_BOOST;
  }
  
  // Negative text penalty
  const negativeText = resonanceData.negativeText || '';
  if (negativeText && profileTraits.some(t => negativeText.toLowerCase().includes(t))) {
    multiplier += Math.max(SCORING.NEGATIVE_PENALTY, SCORING.NEGATIVE_CAP);
  }
  
  // Admiration boost
  const admiration = resonanceData.admiration || resonanceData.positiveText || '';
  if (admiration && profileTraits.some(t => admiration.toLowerCase().includes(t))) {
    multiplier += Math.min(SCORING.ADMIRATION_BOOST, SCORING.ADMIRATION_CAP);
  }
  
  return Math.max(0, multiplier);
}

/**
 * Compute assessment multiplier based on role alignment
 */
function computeAssessmentMultiplier(profile, assessmentAnswers, selfModel) {
  if (!assessmentAnswers || assessmentAnswers.length === 0) return 1.0;
  
  let adjustment = 0;
  const charName = profile.name || profile.canonicalName;
  const profileMotifs = Object.entries(getBaseMotifWeights(profile))
    .filter(([_, w]) => w > 0.3)
    .map(([m, _]) => m);
  
  // Check if character is assigned to roles
  assessmentAnswers.forEach(answer => {
    const selectedChars = answer.selectedCharacterIds || [];
    if (selectedChars.includes(charName)) {
      // Character is used in this assessment role
      const roleType = answer.assessmentType;
      
      // Check role-motif alignment
      if (roleType === 'SHADOW_PROXIMITY') {
        // Shadow role
        if (profileMotifs.some(m => SHADOW_LIKELY_MOTIFS.includes(m))) {
          adjustment += SCORING.SHADOW_ROLE_SHADOW_MOTIF;
        } else {
          adjustment += SCORING.SHADOW_ROLE_OTHER_MOTIF;
        }
      } else {
        // Other roles - general boost
        adjustment += SCORING.ROLE_ALIGN_BOOST;
      }
    }
  });
  
  // Cap adjustment
  adjustment = Math.max(-SCORING.ASSESSMENT_CAP, Math.min(SCORING.ASSESSMENT_CAP, adjustment));
  
  return 1.0 + adjustment;
}

// ============================================================================
// MOTIF SELECTION
// ============================================================================

/**
 * Select top motifs above threshold
 */
function selectTopMotifs(motifScores) {
  return motifScores
    .filter(m => m.score >= SCORING.MIN_MOTIF_SCORE)
    .slice(0, SCORING.TOP_MOTIFS_COUNT);
}

/**
 * Select shadow motifs (high score but associated with shadow/rejection)
 */
function selectShadowMotifs(motifScores, resonanceData) {
  const shadowCandidates = motifScores.filter(m => 
    SHADOW_LIKELY_MOTIFS.includes(m.motif) && m.score >= SCORING.MIN_MOTIF_SCORE * 0.8
  );
  
  // Also include motifs that appear in boundary markers
  if (resonanceData?.boundaryMarkers) {
    const boundaries = resonanceData.boundaryMarkers;
    motifScores.forEach(m => {
      if (m.score >= SCORING.MIN_MOTIF_SCORE * 0.8) {
        const motifDesc = MOTIF_DESCRIPTIONS[m.motif]?.toLowerCase() || '';
        if (boundaries.some(b => motifDesc.includes(b.toLowerCase()))) {
          if (!shadowCandidates.find(sc => sc.motif === m.motif)) {
            shadowCandidates.push(m);
          }
        }
      }
    });
  }
  
  return shadowCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, SCORING.SHADOW_MOTIFS_COUNT);
}

// ============================================================================
// RELATIONSHIP CONSTELLATION
// ============================================================================

/**
 * Find shared motifs between Me and Partner
 */
function findSharedMotifs(meMotifs, partnerMotifs) {
  const shared = [];
  const partnerMap = new Map(partnerMotifs.map(m => [m.motif, m.score]));
  
  meMotifs.forEach(me => {
    const partnerScore = partnerMap.get(me.motif);
    if (
      me.score >= SCORING.SHARED_THRESHOLD &&
      partnerScore !== undefined &&
      partnerScore >= SCORING.SHARED_THRESHOLD
    ) {
      shared.push({
        motif: me.motif,
        meScore: me.score,
        partnerScore,
        label: MOTIF_LABELS[me.motif]?.plain || me.motif,
        description: MOTIF_DESCRIPTIONS[me.motif] || '',
      });
    }
  });
  
  return shared.sort((a, b) => (b.meScore + b.partnerScore) - (a.meScore + a.partnerScore));
}

/**
 * Find complementary motifs (one high, other low)
 */
function findComplementaryMotifs(meMotifs, partnerMotifs) {
  const complementary = [];
  const partnerMap = new Map(partnerMotifs.map(m => [m.motif, m.score]));
  const meMap = new Map(meMotifs.map(m => [m.motif, m.score]));
  
  // Check Me > Partner
  meMotifs.forEach(me => {
    const partnerScore = partnerMap.get(me.motif) || 0;
    const delta = me.score - partnerScore;
    if (
      delta >= SCORING.COMPLEMENTARY_DELTA &&
      me.score >= SCORING.COMPLEMENTARY_MIN
    ) {
      complementary.push({
        motif: me.motif,
        highSide: 'me',
        delta,
        meScore: me.score,
        partnerScore,
        label: MOTIF_LABELS[me.motif]?.plain || me.motif,
        description: MOTIF_DESCRIPTIONS[me.motif] || '',
      });
    }
  });
  
  // Check Partner > Me
  partnerMotifs.forEach(partner => {
    const meScore = meMap.get(partner.motif) || 0;
    const delta = partner.score - meScore;
    if (
      delta >= SCORING.COMPLEMENTARY_DELTA &&
      partner.score >= SCORING.COMPLEMENTARY_MIN
    ) {
      // Avoid duplicates
      if (!complementary.find(c => c.motif === partner.motif)) {
        complementary.push({
          motif: partner.motif,
          highSide: 'partner',
          delta,
          meScore,
          partnerScore: partner.score,
          label: MOTIF_LABELS[partner.motif]?.plain || partner.motif,
          description: MOTIF_DESCRIPTIONS[partner.motif] || '',
        });
      }
    }
  });
  
  return complementary.sort((a, b) => b.delta - a.delta);
}

/**
 * Find tension pairs from the static tension map
 */
function findTensionPairs(meMotifs, partnerMotifs, relationshipModel) {
  const tensions = [];
  const meMap = new Map(meMotifs.map(m => [m.motif, m.score]));
  const partnerMap = new Map(partnerMotifs.map(m => [m.motif, m.score]));
  
  TENSION_PAIRS.forEach(pair => {
    const meA = meMap.get(pair.a) || 0;
    const meB = meMap.get(pair.b) || 0;
    const partnerA = partnerMap.get(pair.a) || 0;
    const partnerB = partnerMap.get(pair.b) || 0;
    
    // Check Me=A, Partner=B
    if (meA >= SCORING.TENSION_MIN_SCORE && partnerB >= SCORING.TENSION_MIN_SCORE) {
      tensions.push({
        pair: [pair.a, pair.b],
        direction: 'me_vs_partner',
        theme: pair.theme,
        themeLabel: TENSION_THEME_LABELS[pair.theme]?.plain || pair.theme,
        strength: (meA + partnerB) / 2,
        labels: [MOTIF_LABELS[pair.a]?.plain, MOTIF_LABELS[pair.b]?.plain],
      });
    }
    
    // Check Partner=A, Me=B
    if (partnerA >= SCORING.TENSION_MIN_SCORE && meB >= SCORING.TENSION_MIN_SCORE) {
      // Avoid duplicate if same pair in opposite direction
      if (!tensions.find(t => t.pair[0] === pair.a && t.pair[1] === pair.b)) {
        tensions.push({
          pair: [pair.a, pair.b],
          direction: 'partner_vs_me',
          theme: pair.theme,
          themeLabel: TENSION_THEME_LABELS[pair.theme]?.plain || pair.theme,
          strength: (partnerA + meB) / 2,
          labels: [MOTIF_LABELS[pair.a]?.plain, MOTIF_LABELS[pair.b]?.plain],
        });
      }
    }
  });
  
  // Boost tensions that match relationshipModel field tensions
  if (relationshipModel?.communicationConflict?.tensions) {
    const fieldTensions = relationshipModel.communicationConflict.tensions;
    tensions.forEach(t => {
      if (fieldTensions.some(ft => ft.toLowerCase().includes(t.theme.replace('_vs_', ' ')))) {
        t.strength = Math.min(1, t.strength + 0.1);
        t.boostedByField = true;
      }
    });
  }
  
  return tensions.sort((a, b) => b.strength - a.strength);
}

/**
 * Determine field label based on shared, complementary, and tensions
 */
function determineFieldLabel(shared, complementary, tensions) {
  let label = '';
  let primaryThemes = [];
  let riskLoops = [];
  
  // Priority 1: Strong shared motif
  if (shared.length > 0 && shared[0].meScore >= 0.5 && shared[0].partnerScore >= 0.5) {
    const topShared = shared[0].motif;
    const fieldInfo = FIELD_LABELS[topShared] || FIELD_LABELS.COMPLEMENTARY;
    label = fieldInfo.plain;
    primaryThemes = [MOTIF_DESCRIPTIONS[topShared]?.split(',')[0].trim() || 'shared energy'];
  }
  // Priority 2: Strong tension pair
  else if (tensions.length > 0 && tensions[0].strength >= 0.5) {
    const topTension = tensions[0];
    label = `${topTension.labels[0]}–${topTension.labels[1]} Field`;
    primaryThemes = [topTension.themeLabel];
    riskLoops = [topTension.theme];
  }
  // Priority 3: Complementary
  else if (complementary.length > 0) {
    label = FIELD_LABELS.COMPLEMENTARY.plain;
    primaryThemes = complementary.slice(0, 2).map(c => c.label);
  }
  // Default
  else {
    label = 'Dynamic Field';
    primaryThemes = ['growth', 'exploration'];
  }
  
  // Add risk loops from all tensions
  tensions.forEach(t => {
    if (!riskLoops.includes(t.theme)) {
      riskLoops.push(t.theme);
    }
  });
  
  return {
    label,
    primaryThemes: primaryThemes.slice(0, 3),
    riskLoops: riskLoops.slice(0, 3),
  };
}

// ============================================================================
// EXPORTS FOR LABELS
// ============================================================================

export function getMotifLabel(motif, tone = 'plain') {
  return MOTIF_LABELS[motif]?.[tone] || MOTIF_LABELS[motif]?.plain || motif;
}

export function getStructuralLabel(archetype, tone = 'plain') {
  return STRUCTURAL_LABELS[archetype]?.[tone] || STRUCTURAL_LABELS[archetype]?.plain || archetype;
}

export function getTensionLabel(theme, tone = 'plain') {
  return TENSION_THEME_LABELS[theme]?.[tone] || TENSION_THEME_LABELS[theme]?.plain || theme;
}

export { TAXONOMY_VERSION, MOTIF_ARCHETYPES, MOTIF_DESCRIPTIONS };
