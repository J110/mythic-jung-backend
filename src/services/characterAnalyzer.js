/**
 * Character Analysis Engine
 * Analyzes characters deeply to understand their archetypal patterns,
 * psychological traits, and how they relate to Jungian concepts
 */

/**
 * Analyze a character's deep traits based on their name and context
 * This uses pattern recognition and archetypal analysis
 */
export function analyzeCharacter(characterName, allCharacters = []) {
  const name = characterName.toLowerCase().trim();
  
  // Deep archetypal analysis based on character patterns
  const analysis = {
    name: characterName,
    archetypalPatterns: [],
    psychologicalTraits: [],
    energyPattern: null,
    relationalStyle: null,
    decisionMaking: null,
    shadowAspects: [],
    virtues: [],
    costs: [],
    compensations: [],
    libidinalCharge: 0, // Will be updated by assessment answers
    egoPosition: 0,
    personaFit: 0,
    shadowProximity: 0,
    feelingFunction: 0,
    individuationPotential: 0,
  };

  // Analyze based on character name patterns and common archetypes
  // This is a placeholder - in production, this would use LLM or character database
  analyzeArchetypalPatterns(name, analysis);
  analyzePsychologicalTraits(name, analysis);
  analyzeEnergyPattern(name, analysis);
  analyzeRelationalStyle(name, analysis);
  analyzeDecisionMaking(name, analysis);
  analyzeShadowAndVirtue(name, analysis);
  analyzeCostsAndCompensations(name, analysis);

  return analysis;
}

function analyzeArchetypalPatterns(name, analysis) {
  // Hero archetype indicators
  if (matchesPattern(name, ['hero', 'warrior', 'fighter', 'protector', 'guardian'])) {
    analysis.archetypalPatterns.push('Hero');
    analysis.psychologicalTraits.push('Courage', 'Determination', 'Protective');
  }
  
  // Sage/Wise archetype
  if (matchesPattern(name, ['sage', 'wise', 'teacher', 'mentor', 'guide', 'philosopher'])) {
    analysis.archetypalPatterns.push('Sage');
    analysis.psychologicalTraits.push('Wisdom', 'Contemplation', 'Teaching');
  }
  
  // Lover/Eros archetype
  if (matchesPattern(name, ['lover', 'romantic', 'passionate', 'tender', 'caring', 'nurturing'])) {
    analysis.archetypalPatterns.push('Lover');
    analysis.psychologicalTraits.push('Emotional depth', 'Connection', 'Vulnerability');
  }
  
  // Rebel/Outlaw archetype
  if (matchesPattern(name, ['rebel', 'outlaw', 'rogue', 'maverick', 'independent'])) {
    analysis.archetypalPatterns.push('Rebel');
    analysis.psychologicalTraits.push('Independence', 'Non-conformity', 'Integrity');
  }
  
  // Magician archetype
  if (matchesPattern(name, ['magician', 'transformer', 'alchemist', 'shaman'])) {
    analysis.archetypalPatterns.push('Magician');
    analysis.psychologicalTraits.push('Transformation', 'Vision', 'Mastery');
  }
  
  // Innocent archetype
  if (matchesPattern(name, ['innocent', 'pure', 'naive', 'optimistic', 'hopeful'])) {
    analysis.archetypalPatterns.push('Innocent');
    analysis.psychologicalTraits.push('Optimism', 'Trust', 'Simplicity');
  }
  
  // Orphan archetype
  if (matchesPattern(name, ['orphan', 'wounded', 'abandoned', 'lonely', 'isolated'])) {
    analysis.archetypalPatterns.push('Orphan');
    analysis.psychologicalTraits.push('Resilience', 'Independence', 'Self-reliance');
  }
  
  // Explorer archetype
  if (matchesPattern(name, ['explorer', 'adventurer', 'wanderer', 'seeker', 'nomad'])) {
    analysis.archetypalPatterns.push('Explorer');
    analysis.psychologicalTraits.push('Curiosity', 'Freedom', 'Discovery');
  }
  
  // Creator archetype
  if (matchesPattern(name, ['creator', 'artist', 'maker', 'builder', 'innovator'])) {
    analysis.archetypalPatterns.push('Creator');
    analysis.psychologicalTraits.push('Creativity', 'Vision', 'Expression');
  }
  
  // Ruler archetype
  if (matchesPattern(name, ['ruler', 'leader', 'king', 'queen', 'commander', 'chief'])) {
    analysis.archetypalPatterns.push('Ruler');
    analysis.psychologicalTraits.push('Authority', 'Responsibility', 'Control');
  }
  
  // Caregiver archetype
  if (matchesPattern(name, ['caregiver', 'nurturer', 'healer', 'helper', 'mother', 'father'])) {
    analysis.archetypalPatterns.push('Caregiver');
    analysis.psychologicalTraits.push('Compassion', 'Service', 'Nurturing');
  }
  
  // Jester archetype
  if (matchesPattern(name, ['jester', 'fool', 'trickster', 'humor', 'playful', 'comedian'])) {
    analysis.archetypalPatterns.push('Jester');
    analysis.psychologicalTraits.push('Humor', 'Lightness', 'Perspective');
  }
  
  // Default: analyze based on name length and common patterns
  if (analysis.archetypalPatterns.length === 0) {
    // Generic analysis for unknown characters
    analysis.archetypalPatterns.push('Complex');
    analysis.psychologicalTraits.push('Multi-faceted', 'Evolving', 'Unique');
  }
}

function analyzePsychologicalTraits(name, analysis) {
  // Add traits based on name analysis
  // This is simplified - real analysis would be much deeper
  
  // Emotional traits
  if (matchesPattern(name, ['warm', 'kind', 'gentle', 'soft', 'tender'])) {
    analysis.psychologicalTraits.push('Emotional warmth', 'Empathy');
  }
  
  // Analytical traits
  if (matchesPattern(name, ['thinker', 'analyst', 'logical', 'rational', 'strategic'])) {
    analysis.psychologicalTraits.push('Analytical', 'Logical', 'Strategic');
  }
  
  // Action-oriented
  if (matchesPattern(name, ['action', 'doer', 'active', 'dynamic', 'energetic'])) {
    analysis.psychologicalTraits.push('Action-oriented', 'Dynamic', 'Energetic');
  }
  
  // Introverted
  if (matchesPattern(name, ['quiet', 'reserved', 'introverted', 'contemplative', 'reflective'])) {
    analysis.psychologicalTraits.push('Introverted', 'Contemplative', 'Reflective');
  }
  
  // Extroverted
  if (matchesPattern(name, ['social', 'outgoing', 'extroverted', 'charismatic', 'expressive'])) {
    analysis.psychologicalTraits.push('Extroverted', 'Charismatic', 'Expressive');
  }
}

function analyzeEnergyPattern(name, analysis) {
  // High energy
  if (matchesPattern(name, ['fire', 'storm', 'thunder', 'lightning', 'explosive', 'intense'])) {
    analysis.energyPattern = 'High intensity, explosive, passionate';
  }
  // Steady energy
  else if (matchesPattern(name, ['mountain', 'rock', 'steady', 'stable', 'grounded'])) {
    analysis.energyPattern = 'Steady, grounded, consistent';
  }
  // Flowing energy
  else if (matchesPattern(name, ['water', 'river', 'flow', 'fluid', 'graceful'])) {
    analysis.energyPattern = 'Flowing, adaptive, graceful';
  }
  // Contained energy
  else if (matchesPattern(name, ['contained', 'controlled', 'disciplined', 'focused'])) {
    analysis.energyPattern = 'Contained, focused, disciplined';
  }
  else {
    analysis.energyPattern = 'Variable, context-dependent';
  }
}

function analyzeRelationalStyle(name, analysis) {
  // Independent
  if (matchesPattern(name, ['independent', 'solo', 'alone', 'self-reliant', 'autonomous'])) {
    analysis.relationalStyle = 'Independent, self-reliant, autonomous';
  }
  // Interdependent
  else if (matchesPattern(name, ['connected', 'relational', 'interdependent', 'collaborative'])) {
    analysis.relationalStyle = 'Interdependent, collaborative, connected';
  }
  // Intimate
  else if (matchesPattern(name, ['intimate', 'close', 'deep', 'vulnerable', 'open'])) {
    analysis.relationalStyle = 'Intimate, vulnerable, deeply connected';
  }
  // Social
  else if (matchesPattern(name, ['social', 'communal', 'tribal', 'group', 'network'])) {
    analysis.relationalStyle = 'Social, communal, network-oriented';
  }
  else {
    analysis.relationalStyle = 'Context-dependent, adaptive';
  }
}

function analyzeDecisionMaking(name, analysis) {
  // Intuitive
  if (matchesPattern(name, ['intuitive', 'gut', 'feeling', 'instinct', 'sense'])) {
    analysis.decisionMaking = 'Intuitive, feeling-based, gut-driven';
  }
  // Rational
  else if (matchesPattern(name, ['rational', 'logical', 'analytical', 'reason', 'think'])) {
    analysis.decisionMaking = 'Rational, analytical, logic-driven';
  }
  // Values-based
  else if (matchesPattern(name, ['values', 'principles', 'moral', 'ethical', 'integrity'])) {
    analysis.decisionMaking = 'Values-based, principle-driven, integrity-focused';
  }
  // Pragmatic
  else if (matchesPattern(name, ['pragmatic', 'practical', 'realistic', 'practical', 'effective'])) {
    analysis.decisionMaking = 'Pragmatic, practical, effectiveness-focused';
  }
  else {
    analysis.decisionMaking = 'Integrated, context-adaptive';
  }
}

function analyzeShadowAndVirtue(name, analysis) {
  // Shadow aspects - what this character represses or denies
  if (matchesPattern(name, ['hero', 'warrior', 'strong'])) {
    analysis.shadowAspects.push('Vulnerability', 'Weakness', 'Dependency');
    analysis.virtues.push('Strength', 'Courage', 'Protection');
  }
  
  if (matchesPattern(name, ['caregiver', 'nurturer', 'helper'])) {
    analysis.shadowAspects.push('Selfishness', 'Boundaries', 'Independence');
    analysis.virtues.push('Compassion', 'Service', 'Nurturing');
  }
  
  if (matchesPattern(name, ['ruler', 'leader', 'authority'])) {
    analysis.shadowAspects.push('Vulnerability', 'Uncertainty', 'Equality');
    analysis.virtues.push('Leadership', 'Responsibility', 'Vision');
  }
  
  if (matchesPattern(name, ['rebel', 'outlaw', 'independent'])) {
    analysis.shadowAspects.push('Conformity', 'Dependency', 'Acceptance');
    analysis.virtues.push('Integrity', 'Independence', 'Authenticity');
  }
  
  // Default shadow/virtue analysis
  if (analysis.shadowAspects.length === 0) {
    analysis.shadowAspects.push('Unknown aspects', 'Repressed qualities');
    analysis.virtues.push('Hidden strengths', 'Potential gifts');
  }
}

function analyzeCostsAndCompensations(name, analysis) {
  // Costs - what this character pays for their way of being
  if (matchesPattern(name, ['hero', 'warrior', 'protector'])) {
    analysis.costs.push('Emotional suppression', 'Isolation', 'Burnout risk');
    analysis.compensations.push('Respect', 'Effectiveness', 'Protection');
  }
  
  if (matchesPattern(name, ['caregiver', 'nurturer', 'helper'])) {
    analysis.costs.push('Self-neglect', 'Boundary confusion', 'Exhaustion');
    analysis.compensations.push('Connection', 'Meaning', 'Love');
  }
  
  if (matchesPattern(name, ['ruler', 'leader', 'authority'])) {
    analysis.costs.push('Loneliness', 'Responsibility burden', 'Isolation');
    analysis.compensations.push('Power', 'Influence', 'Achievement');
  }
  
  if (matchesPattern(name, ['rebel', 'outlaw', 'independent'])) {
    analysis.costs.push('Social rejection', 'Isolation', 'Conflict');
    analysis.compensations.push('Authenticity', 'Freedom', 'Integrity');
  }
  
  // Default costs/compensations
  if (analysis.costs.length === 0) {
    analysis.costs.push('Unknown costs', 'Hidden prices');
    analysis.compensations.push('Unknown benefits', 'Hidden rewards');
  }
}

function matchesPattern(name, patterns) {
  return patterns.some(pattern => name.includes(pattern));
}

/**
 * Analyze all characters and determine best classification for each archetypal position
 */
export function classifyCharacters(characters, assessments = []) {
  const analyses = characters.map(char => analyzeCharacter(char.displayName || char.id, characters));
  
  // Update analyses based on assessment answers
  assessments.forEach(assessment => {
    const selectedChars = assessment.selectedCharacterIds || [];
    selectedChars.forEach(charId => {
      const analysis = analyses.find(a => 
        a.name === charId || 
        characters.find(c => c.id === charId)?.displayName === a.name
      );
      if (analysis) {
        // Update scores based on assessment type
        switch (assessment.assessmentType) {
          case 'LIBIDINAL_CHARGE':
            analysis.libidinalCharge += 1;
            break;
          case 'EGO_POSITION':
            analysis.egoPosition += 1;
            break;
          case 'PERSONA_FORMATION':
            analysis.personaFit += 1;
            break;
          case 'SHADOW_PROXIMITY':
            analysis.shadowProximity += 1;
            break;
          case 'FEELING_FUNCTION':
            analysis.feelingFunction += 1;
            break;
          case 'COST_COMPENSATION':
            // This affects which characters are draining vs restoring
            break;
          case 'INDIVIDUATION_DIRECTION':
            analysis.individuationPotential += 1;
            break;
        }
      }
    });
  });
  
  // Ensure we have character names for classification
  const characterNames = characters.map(c => c.displayName || c.id).filter(Boolean);
  
  // Classify based on scores and deep analysis
  const classification = {
    ego: findBestFit(analyses, 'egoPosition', characters) || [characterNames[0] || analyses[0]?.name].filter(Boolean),
    persona: findBestFit(analyses, 'personaFit', characters, 2) || [characterNames[1] || characterNames[0] || analyses[0]?.name].filter(Boolean).slice(0, 2),
    shadow: findBestFit(analyses, 'shadowProximity', characters, 2) || [characterNames[2] || characterNames[1] || analyses[0]?.name].filter(Boolean).slice(0, 2),
    shadowVirtue: findBestFit(analyses, 'shadowProximity', characters, 1, true) || [characterNames[2] || characterNames[1] || analyses[0]?.name].filter(Boolean).slice(0, 1),
    feelingFunction: findBestFit(analyses, 'feelingFunction', characters) || [characterNames[3] || characterNames[0] || analyses[0]?.name].filter(Boolean).slice(0, 1),
    erosAxis: findBestFit(analyses, 'feelingFunction', characters) || [characterNames[4] || characterNames[3] || analyses[0]?.name].filter(Boolean).slice(0, 1),
    libidinalCharge: findBestFit(analyses, 'libidinalCharge', characters) || [characterNames[0] || analyses[0]?.name].filter(Boolean),
  };
  
  return {
    analyses,
    classification,
  };
}

function findBestFit(analyses, scoreKey, characters, count = 1, inverse = false) {
  if (!analyses || analyses.length === 0) {
    return [];
  }
  
  // Sort by score
  const sorted = [...analyses].sort((a, b) => {
    const scoreA = a[scoreKey] || 0;
    const scoreB = b[scoreKey] || 0;
    return inverse ? scoreA - scoreB : scoreB - scoreA;
  });
  
  // If no scores, use archetypal analysis or return first available
  if (sorted[0] && sorted[0][scoreKey] === 0 && sorted.every(a => (a[scoreKey] || 0) === 0)) {
    // Fall back to archetypal pattern matching or just return first available
    return sorted.slice(0, count).map(a => a.name).filter(Boolean);
  }
  
  return sorted.slice(0, count).map(a => a.name).filter(Boolean);
}

/**
 * Get deep insights about a character for personalized generation
 */
export function getCharacterInsights(characterAnalysis, position) {
  if (!characterAnalysis) {
    // Return default insights if analysis is missing
    return {
      name: 'Unknown',
      archetypalPatterns: ['Complex'],
      psychologicalTraits: ['Multi-faceted'],
      energyPattern: 'Variable',
      relationalStyle: 'Context-dependent',
      decisionMaking: 'Integrated',
      shadowAspects: ['Unknown aspects'],
      virtues: ['Hidden strengths'],
      costs: ['Unknown costs'],
      compensations: ['Unknown benefits'],
      position: position,
    };
  }
  
  return {
    name: characterAnalysis.name || 'Unknown',
    archetypalPatterns: characterAnalysis.archetypalPatterns || [],
    psychologicalTraits: characterAnalysis.psychologicalTraits || [],
    energyPattern: characterAnalysis.energyPattern || 'Variable',
    relationalStyle: characterAnalysis.relationalStyle || 'Context-dependent',
    decisionMaking: characterAnalysis.decisionMaking || 'Integrated',
    shadowAspects: characterAnalysis.shadowAspects || [],
    virtues: characterAnalysis.virtues || [],
    costs: characterAnalysis.costs || [],
    compensations: characterAnalysis.compensations || [],
    position: position,
  };
}
