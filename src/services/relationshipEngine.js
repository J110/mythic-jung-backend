/**
 * Relationship Engine
 * 
 * Independent engine for relationship analysis. Works fully without Me data,
 * but can be enriched if Me data is available.
 * 
 * Pipeline:
 * 1. Recognize + Discover Other characters → OtherCharacterProfiles
 * 2. Build OtherSelfModel (like MeSelfModel but without assessments)
 * 3. Build RelationshipModel (deterministic from trait tags and signal weights)
 * 4. Generate RelationshipNarrative from RelationshipModel
 * 5. Generate RelationshipExamples
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { recognizeCharacters } from './characterRecognitionEngine.js';
import { discoverCharacterProfiles } from './characterDiscoveryEngine.js';
import { synthesizeSelfModel } from './synthesisEngine.js';

// Cache for relationship outputs
const relationshipCache = new Map();

/**
 * Main entry point - generates relationship output
 * 
 * @param {Object} relationshipSet - The relationship character set
 * @param {Object} meData - Optional Me data for enrichment
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} RelationshipOutput
 */
export async function generateRelationshipOutput(relationshipSet, meData = {}, options = {}) {
  console.log('[RelationshipEngine] Starting generation pipeline...');
  
  const { relationshipType, otherCharacterInputs } = relationshipSet;
  
  // Create cache key
  const inputHash = createRelationshipHash(relationshipSet, meData);
  console.log(`[RelationshipEngine] Input hash: ${inputHash}`);
  
  // Check cache
  if (!options.force && relationshipCache.has(inputHash)) {
    console.log('[RelationshipEngine] Returning cached result');
    return relationshipCache.get(inputHash);
  }
  
  // Step 1: Recognize Other characters
  console.log('[RelationshipEngine] Step 1: Character Recognition...');
  const recognitionResult = await recognizeCharacters(otherCharacterInputs);
  
  // recognizeCharacters returns { results: [...], overall: {...} }
  const validResults = recognitionResult.results.filter(r => r.status === 'RECOGNIZED');
  if (validResults.length < 4) {
    throw new Error(`Only ${validResults.length} characters recognized. Need at least 4.`);
  }
  
  // Extract canonical objects for discovery (discoverCharacterProfiles expects canonicals, not raw results)
  const canonicals = validResults.map(r => r.canonical);
  console.log(`[RelationshipEngine] Step 1 complete: ${validResults.length} recognized`);
  console.log(`[RelationshipEngine] Canonical names: ${canonicals.map(c => c.name).join(', ')}`);
  
  // Step 2: Discover character profiles
  console.log('[RelationshipEngine] Step 2: Character Discovery...');
  const otherProfiles = await discoverCharacterProfiles(canonicals);
  
  // Log character names for debugging
  const characterNames = otherProfiles.map(p => p.name || p.canonicalName || 'Unknown');
  console.log(`[RelationshipEngine] Step 2 complete: ${otherProfiles.length} profiles`);
  console.log(`[RelationshipEngine] Characters: ${characterNames.join(', ')}`);
  
  // Step 3: Build OtherSelfModel (synthesis without assessments)
  console.log('[RelationshipEngine] Step 3: Building OtherSelfModel...');
  const otherSelfModel = synthesizeSelfModel(otherProfiles, []);
  console.log('[RelationshipEngine] Step 3 complete');
  
  // Step 4: Build RelationshipModel (deterministic)
  console.log('[RelationshipEngine] Step 4: Building RelationshipModel...');
  const relationshipModel = buildRelationshipModel(
    otherSelfModel,
    otherProfiles,
    meData.selfModel,
    meData.profile?.characters || [],
    relationshipType
  );
  console.log('[RelationshipEngine] Step 4 complete');
  
  // Step 5: Generate RelationshipNarrative
  console.log('[RelationshipEngine] Step 5: Generating Narrative...');
  const narrative = await generateRelationshipNarrative(
    relationshipModel,
    otherProfiles,
    meData,
    relationshipType
  );
  console.log('[RelationshipEngine] Step 5 complete');
  
  // Step 6: Generate RelationshipExamples
  console.log('[RelationshipEngine] Step 6: Generating Examples...');
  const examples = await generateRelationshipExamples(
    relationshipModel,
    otherProfiles,
    meData,
    narrative
  );
  console.log('[RelationshipEngine] Step 6 complete');
  
  // Build final output
  const output = {
    myth: narrative.myth,
    relationshipModel,
    narrative,
    examples,
    meta: {
      generatedAt: new Date().toISOString(),
      modelVersion: 'relationship-v1',
      inputHash,
      relationshipType,
      hasMeData: !!meData.selfModel,
      otherCharacterCount: otherProfiles.length,
      characterNames,
    }
  };
  
  // Cache result
  relationshipCache.set(inputHash, output);
  
  console.log('[RelationshipEngine] Generation complete');
  return output;
}

/**
 * Helper to get character name from mapping
 */
function getCharacterName(mapping) {
  if (!mapping) return null;
  // coreMappings uses characterRefs array
  return mapping.characterRefs?.[0] || mapping.character || null;
}

/**
 * Build RelationshipModel deterministically from trait data
 */
function buildRelationshipModel(otherSelfModel, otherProfiles, meSelfModel, meCharacters, relationshipType) {
  const isRomantic = relationshipType === 'romantic';
  
  // Extract key patterns from Other
  const otherMappings = otherSelfModel.coreMappings || {};
  const otherTensions = otherSelfModel.tensions || [];
  
  // Get character names for all mappings
  const characterNameMap = {
    ego: getCharacterName(otherMappings.ego),
    persona: getCharacterName(otherMappings.persona),
    shadow: getCharacterName(otherMappings.shadow),
    shadowVirtue: getCharacterName(otherMappings.shadowVirtue),
    feelingFunction: getCharacterName(otherMappings.feelingFunction),
    eros: getCharacterName(otherMappings.erosAxis),
  };
  
  console.log('[RelationshipEngine] Character mappings:', characterNameMap);
  
  // Calculate relational dynamics
  const field = calculateRelationalField(otherSelfModel, meSelfModel, otherProfiles, characterNameMap);
  const bondingAxis = calculateBondingAxis(otherSelfModel, meSelfModel, isRomantic, characterNameMap);
  const projectionShadow = calculateProjectionShadow(otherSelfModel, meSelfModel, characterNameMap);
  const egoPersonaMismatch = calculateEgoPersonaMismatch(otherSelfModel, meSelfModel, characterNameMap);
  const communicationConflict = calculateCommunicationConflict(otherSelfModel, meSelfModel, otherProfiles, characterNameMap);
  const needsBoundaries = calculateNeedsBoundaries(otherSelfModel, meSelfModel, isRomantic, characterNameMap);
  const growthPath = calculateGrowthPath(otherSelfModel, meSelfModel, otherTensions, characterNameMap);
  const redFlagsRepair = calculateRedFlagsRepair(otherSelfModel, meSelfModel, otherTensions, characterNameMap);
  
  // Generate situational guidance
  const nextStepsSituations = generateNextStepsSituations(
    field,
    bondingAxis,
    communicationConflict,
    isRomantic,
    characterNameMap
  );
  
  return {
    type: relationshipType,
    characterNames: characterNameMap,
    field,
    bondingAxis,
    projectionShadow,
    egoPersonaMismatch,
    communicationConflict,
    needsBoundaries,
    growthPath,
    redFlagsRepair,
    nextStepsSituations,
    _internal: {
      otherMappings,
      otherTensionCount: otherTensions.length,
      hasMeData: !!meSelfModel,
    }
  };
}

/**
 * Calculate the relational field between two people
 */
function calculateRelationalField(otherSelfModel, meSelfModel, otherProfiles, charNames) {
  const egoChar = charNames.ego;
  const personaChar = charNames.persona;
  const shadowChar = charNames.shadow;
  
  // Calculate polarity and resonance
  let polarityScore = 0;
  let resonanceScore = 0;
  
  // If Me data exists, calculate actual polarity
  if (meSelfModel) {
    const meMappings = meSelfModel.coreMappings || {};
    const meEgo = getCharacterName(meMappings.ego);
    const meShadow = getCharacterName(meMappings.shadow);
    const mePersona = getCharacterName(meMappings.persona);
    
    if (meEgo !== egoChar) polarityScore += 0.3;
    if (meShadow === egoChar) polarityScore += 0.4; // Projection potential
    if (mePersona === personaChar) resonanceScore += 0.3;
  }
  
  return {
    type: polarityScore > 0.5 ? 'complementary' : 'resonant',
    polarityScore,
    resonanceScore,
    primaryDynamic: egoChar,
    secondaryDynamic: personaChar,
    shadowElement: shadowChar,
    analysisBullets: [
      `Primary relational axis through ${egoChar || 'core identity'}`,
      `Social interface mediated by ${personaChar || 'adaptive self'}`,
      `Hidden tensions around ${shadowChar || 'shadow aspects'}`
    ]
  };
}

/**
 * Calculate attraction and bonding dynamics
 */
function calculateBondingAxis(otherSelfModel, meSelfModel, isRomantic, charNames) {
  const erosChar = charNames.eros;
  const feelingChar = charNames.feelingFunction;
  
  const bondingType = isRomantic ? 'eros-driven' : 'trust-driven';
  
  return {
    type: bondingType,
    primaryAxis: isRomantic ? erosChar : feelingChar,
    secondaryAxis: isRomantic ? feelingChar : erosChar,
    intimacyStyle: isRomantic ? 'vulnerability-based' : 'collaboration-based',
    analysisBullets: [
      `${isRomantic ? 'Attraction' : 'Trust'} anchored in ${(isRomantic ? erosChar : feelingChar) || 'relational center'}`,
      `Emotional connection through ${feelingChar || 'feeling function'}`,
      isRomantic ? 'Intimacy requires safe vulnerability' : 'Bond strengthens through shared challenges'
    ]
  };
}

/**
 * Calculate projection and shadow triggers
 */
function calculateProjectionShadow(otherSelfModel, meSelfModel, charNames) {
  const shadowChar = charNames.shadow;
  const shadowVirtueChar = charNames.shadowVirtue;
  
  const triggers = [];
  
  if (shadowChar) {
    triggers.push({
      name: `${shadowChar} activation`,
      description: `Behaviors reminiscent of ${shadowChar} may trigger defensive reactions`,
      severity: 'moderate'
    });
  }
  
  if (meSelfModel) {
    const meShadow = getCharacterName(meSelfModel.coreMappings?.shadow);
    if (meShadow && meShadow !== shadowChar) {
      triggers.push({
        name: 'Cross-shadow projection',
        description: `Your shadow (${meShadow}) may project onto their patterns`,
        severity: 'high'
      });
    }
  }
  
  return {
    shadowCharacter: shadowChar,
    shadowVirtue: shadowVirtueChar,
    triggers,
    analysisBullets: [
      `Shadow energy concentrated around ${shadowChar || 'unconscious patterns'}`,
      `Shadow virtue (what they suppress but value): ${shadowVirtueChar || 'hidden strength'}`,
      triggers.length > 0 ? `${triggers.length} identified projection triggers` : 'Low projection risk'
    ]
  };
}

/**
 * Calculate ego-persona mismatch
 */
function calculateEgoPersonaMismatch(otherSelfModel, meSelfModel, charNames) {
  const egoChar = charNames.ego;
  const personaChar = charNames.persona;
  
  const mismatchLevel = egoChar === personaChar ? 'low' : 'moderate';
  
  return {
    egoCharacter: egoChar,
    personaCharacter: personaChar,
    mismatchLevel,
    publicVsPrivate: egoChar !== personaChar 
      ? `Public ${personaChar} masks private ${egoChar}`
      : 'Relatively integrated public/private self',
    analysisBullets: [
      `Core identity: ${egoChar || 'central self'}`,
      `Social presentation: ${personaChar || 'adaptive face'}`,
      mismatchLevel === 'low' ? 'Low mask complexity' : 'Noticeable gap between public and private self'
    ]
  };
}

/**
 * Calculate communication and conflict style
 */
function calculateCommunicationConflict(otherSelfModel, meSelfModel, otherProfiles, charNames) {
  const tensions = otherSelfModel.tensions || [];
  const feelingChar = charNames.feelingFunction;
  
  const conflictTendency = tensions.length > 10 ? 'avoidant' : tensions.length > 5 ? 'confrontational' : 'balanced';
  
  return {
    style: conflictTendency,
    primaryMode: feelingChar,
    tensionCount: tensions.length,
    repairStrategy: conflictTendency === 'avoidant' ? 'needs space before repair' : 'needs direct conversation',
    analysisBullets: [
      `Communication anchored in ${feelingChar || 'feeling function'} energy`,
      `Conflict tendency: ${conflictTendency}`,
      tensions.length > 5 ? 'Multiple internal tensions affect external communication' : 'Relatively clear communication patterns'
    ]
  };
}

/**
 * Calculate needs, boundaries, and deal-breakers
 */
function calculateNeedsBoundaries(otherSelfModel, meSelfModel, isRomantic, charNames) {
  const needs = [];
  const boundaries = [];
  const dealBreakers = [];
  
  needs.push(`Recognition of ${charNames.ego || 'core'} identity`);
  needs.push(`Space for ${charNames.shadow || 'shadow'} integration`);
  
  if (isRomantic) {
    needs.push(`Emotional safety through ${charNames.eros || 'eros'} dynamics`);
    boundaries.push('Vulnerability requires earned trust');
    dealBreakers.push('Betrayal of intimate trust');
  } else {
    needs.push('Mutual respect and collaboration');
    boundaries.push('Clear role definitions');
    dealBreakers.push('Repeated boundary violations');
  }
  
  return {
    needs,
    boundaries,
    dealBreakers,
    analysisBullets: [
      `${needs.length} core relational needs identified`,
      `${boundaries.length} key boundaries`,
      `${dealBreakers.length} potential deal-breakers`
    ]
  };
}

/**
 * Calculate growth path together
 */
function calculateGrowthPath(otherSelfModel, meSelfModel, tensions, charNames) {
  const direction = otherSelfModel.individuationDirection || {};
  
  const growthAreas = [];
  
  if (charNames.shadow) {
    growthAreas.push({
      area: 'Shadow integration',
      description: `Supporting integration of ${charNames.shadow} qualities`,
      priority: 'high'
    });
  }
  
  if (tensions.length > 5) {
    growthAreas.push({
      area: 'Tension harmonization',
      description: 'Working through internal conflicts together',
      priority: 'medium'
    });
  }
  
  growthAreas.push({
    area: 'Mutual individuation',
    description: 'Supporting each other\'s authentic development',
    priority: 'high'
  });
  
  return {
    direction: direction.primaryVector || 'integration',
    growthAreas,
    timeframe: tensions.length > 10 ? 'long-term' : 'medium-term',
    analysisBullets: [
      `${growthAreas.length} growth opportunities identified`,
      `Primary direction: ${direction.primaryVector || 'integration'}`,
      'Growth requires mutual patience and support'
    ]
  };
}

/**
 * Calculate red flags and repair signals
 */
function calculateRedFlagsRepair(otherSelfModel, meSelfModel, tensions, charNames) {
  const redFlags = [];
  const repairSignals = [];
  
  if (charNames.shadow) {
    redFlags.push({
      signal: `Persistent ${charNames.shadow} acting out`,
      severity: 'warning',
      action: 'Address underlying need'
    });
  }
  
  redFlags.push({
    signal: 'Persona rigidity or collapse',
    severity: 'caution',
    action: 'Create safe space for authentic expression'
  });
  
  repairSignals.push({
    signal: 'Return to authentic communication',
    meaning: 'Ready for reconnection'
  });
  
  repairSignals.push({
    signal: 'Vulnerability gestures',
    meaning: 'Trust rebuilding attempt'
  });
  
  return {
    redFlags,
    repairSignals,
    overallRisk: tensions.length > 15 ? 'elevated' : tensions.length > 8 ? 'moderate' : 'low',
    analysisBullets: [
      `${redFlags.length} warning patterns identified`,
      `${repairSignals.length} repair opportunities`,
      `Overall relational risk: ${tensions.length > 15 ? 'elevated' : 'manageable'}`
    ]
  };
}

/**
 * Generate situational guidance
 */
function generateNextStepsSituations(field, bondingAxis, communicationConflict, isRomantic, charNames) {
  const situations = [];
  
  situations.push({
    title: isRomantic ? 'Deepening Intimacy' : 'Building Trust',
    context: `When ready to deepen the ${isRomantic ? 'romantic' : 'platonic'} connection`,
    guidance: isRomantic 
      ? `Honor ${bondingAxis.primaryAxis || 'eros'} energy while maintaining ${field.primaryDynamic || 'authentic'} presence`
      : `Share vulnerably while respecting ${communicationConflict.style} communication style`
  });
  
  situations.push({
    title: 'Navigating Disagreement',
    context: 'During moments of tension or conflict',
    guidance: communicationConflict.repairStrategy
  });
  
  situations.push({
    title: 'Supporting Growth',
    context: 'When partner/friend is going through change',
    guidance: `Honor their ${field.primaryDynamic || 'core'} nature while encouraging shadow integration`
  });
  
  return situations;
}

/**
 * Generate narrative content using LLM
 */
async function generateRelationshipNarrative(relationshipModel, otherProfiles, meData, relationshipType) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const isRomantic = relationshipType === 'romantic';
  const hasMeData = !!meData.selfModel;
  
  // Get actual character names from profiles
  const characterNames = otherProfiles.map(p => p.name || p.canonicalName).filter(Boolean).join(', ');
  const charMap = relationshipModel.characterNames || {};
  
  const systemPrompt = `You are a Jungian relationship analyst creating mystical yet accessible narratives about relational dynamics.

IMPORTANT: Use the ACTUAL character names provided, NOT generic labels like "Character 1" or "Character 4".

Characters in this analysis: ${characterNames}

Write in a style that is:
- Evocative and archetypal, not clinical
- Specific to the characters mentioned BY NAME
- ${isRomantic ? 'Sensitive to romantic/intimate dynamics' : 'Focused on friendship and collaboration'}
- Never prescriptive or advice-giving, only descriptive

${hasMeData ? 'The user has provided their own character profile, so you can describe bidirectional dynamics.' : 'Focus only on describing the other person\'s patterns and likely relational dynamics.'}`;

  const userPrompt = `Generate a relationship narrative based on this analysis:

RELATIONSHIP TYPE: ${relationshipType}
CHARACTER NAMES: ${characterNames}
${hasMeData ? 'USER HAS PROVIDED THEIR OWN PROFILE (describe bidirectional dynamics)' : 'USER HAS NOT PROVIDED THEIR OWN PROFILE (focus on their patterns)'}

CHARACTER MAPPINGS (use these EXACT names):
- Ego (core identity): ${charMap.ego || 'Not assigned'}
- Persona (social self): ${charMap.persona || 'Not assigned'}
- Shadow (hidden aspects): ${charMap.shadow || 'Not assigned'}
- Shadow Virtue: ${charMap.shadowVirtue || 'Not assigned'}
- Feeling Function: ${charMap.feelingFunction || 'Not assigned'}  
- Eros Axis: ${charMap.eros || 'Not assigned'}

RELATIONSHIP MODEL:
- Field type: ${relationshipModel.field.type}
- Primary dynamic: ${relationshipModel.field.primaryDynamic}
- Shadow element: ${relationshipModel.field.shadowElement}
- Bonding style: ${relationshipModel.bondingAxis.type}
- Communication style: ${relationshipModel.communicationConflict.style}
- Tension count: ${relationshipModel._internal.otherTensionCount}

Generate JSON using the ACTUAL character names (${characterNames}), with this structure:
{
  "myth": {
    "title": "A 4-6 word mythic title for this relationship",
    "summary": "2-3 sentence poetic summary using character names",
    "story": "4-6 paragraphs telling the mythic story referencing ${characterNames} by name",
    "themes": ["theme1", "theme2", "theme3"]
  },
  "relationalField": {
    "summary": "2-3 sentences about how ${charMap.ego || characterNames.split(',')[0]} and others interact",
    "story": "2-3 paragraphs about how these character energies interact"
  },
  "attractionBonding": {
    "summary": "2-3 sentences about ${isRomantic ? 'attraction/eros' : 'trust/connection'} through ${charMap.eros || characterNames.split(',')[0]}",
    "story": "2-3 paragraphs about bonding dynamics"
  },
  "projectionShadow": {
    "summary": "2-3 sentences about projection patterns around ${charMap.shadow || 'shadow'}",
    "story": "2-3 paragraphs about shadow triggers between them"
  },
  "egoPersonaMismatch": {
    "summary": "2-3 sentences about ${charMap.ego || 'ego'} vs ${charMap.persona || 'persona'}",
    "story": "2-3 paragraphs about authenticity dynamics"
  },
  "communicationConflict": {
    "summary": "2-3 sentences about communication through ${charMap.feelingFunction || 'feeling'}",
    "story": "2-3 paragraphs about how they handle conflict"
  },
  "needsBoundaries": {
    "summary": "2-3 sentences about needs",
    "story": "2-3 paragraphs about boundaries and deal-breakers"
  },
  "growthPath": {
    "summary": "2-3 sentences about growth potential",
    "story": "2-3 paragraphs about how they can grow together"
  },
  "redFlagsRepair": {
    "summary": "2-3 sentences about warning signs",
    "story": "2-3 paragraphs about repair and resilience"
  },
  "nextSteps": [
    {"situation": "situation name", "guidance": "1-2 sentences"},
    {"situation": "situation name", "guidance": "1-2 sentences"},
    {"situation": "situation name", "guidance": "1-2 sentences"}
  ]
}

CRITICAL: Reference characters BY NAME (${characterNames}), not as "Character 1", "Character 4", etc.`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_RELATIONSHIP_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4000,
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('[RelationshipEngine] Narrative generation error:', error);
    throw error;
  }
}

/**
 * Generate examples for relationship modules
 */
async function generateRelationshipExamples(relationshipModel, otherProfiles, meData, narrative) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const characterNames = otherProfiles.map(p => p.name || p.canonicalName).filter(Boolean).join(', ');
  const hasMeData = !!meData.profile?.characters?.length;
  const charMap = relationshipModel.characterNames || {};
  
  const prompt = `Generate relationship examples from the works of these characters: ${characterNames}

Character mappings:
- Ego: ${charMap.ego}
- Persona: ${charMap.persona}  
- Shadow: ${charMap.shadow}
- Feeling Function: ${charMap.feelingFunction}
- Eros: ${charMap.eros}

For each relationship module, provide 2-3 concrete examples from their ACTUAL films/books/stories that illustrate the dynamic. Use the character's real name in each example.

Return JSON:
{
  "relationalField": [
    {
      "characterName": "${charMap.ego || otherProfiles[0]?.name}",
      "fromSide": "other",
      "reference": {"title": "Actual film/book title", "year": "year as string", "medium": "film|book|series"},
      "situation": "Describe a specific scene",
      "actions": ["Action 1", "Action 2"],
      "outcomeAndCost": ["Outcome 1", "Cost 1"],
      "tier": "A"
    }
  ],
  "attractionBonding": [...similar structure with ${charMap.eros || 'eros character'}],
  "projectionShadow": [...with ${charMap.shadow || 'shadow character'}],
  "egoPersonaMismatch": [...],
  "communicationConflict": [...with ${charMap.feelingFunction || 'feeling character'}],
  "needsBoundaries": [...],
  "growthPath": [...],
  "redFlagsRepair": [...],
  "nextSteps": [...]
}

RULES:
- Use ONLY real scenes from real works
- Each example must use a character name from: ${characterNames}
- Reference actual titles, years, and media types
- tier should be "A" for verified scenes, "B" for likely scenes`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Generate concrete examples from real films/books/stories. Use actual character names and real scenes.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 3000,
    });
    
    const content = response.choices[0].message.content;
    const examples = JSON.parse(content);
    
    // Ensure year is string
    Object.values(examples).forEach(exampleList => {
      if (Array.isArray(exampleList)) {
        exampleList.forEach(ex => {
          if (ex.reference?.year && typeof ex.reference.year !== 'string') {
            ex.reference.year = String(ex.reference.year);
          }
        });
      }
    });
    
    return examples;
  } catch (error) {
    console.error('[RelationshipEngine] Example generation error:', error);
    return {
      relationalField: [],
      attractionBonding: [],
      projectionShadow: [],
      egoPersonaMismatch: [],
      communicationConflict: [],
      needsBoundaries: [],
      growthPath: [],
      redFlagsRepair: [],
      nextSteps: []
    };
  }
}

/**
 * Create hash for caching
 */
function createRelationshipHash(relationshipSet, meData) {
  const data = {
    type: relationshipSet.relationshipType,
    others: relationshipSet.otherCharacterInputs?.sort().join(','),
    meChars: meData.profile?.characters?.map(c => c.displayName).sort().join(',') || '',
  };
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}
