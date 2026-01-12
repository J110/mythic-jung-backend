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
  const validCharacters = recognitionResult.results.filter(r => r.status === 'RECOGNIZED');
  if (validCharacters.length < 4) {
    throw new Error(`Only ${validCharacters.length} characters recognized. Need at least 4.`);
  }
  console.log(`[RelationshipEngine] Step 1 complete: ${validCharacters.length} recognized`);
  
  // Step 2: Discover character profiles
  console.log('[RelationshipEngine] Step 2: Character Discovery...');
  const otherProfiles = await discoverCharacterProfiles(validCharacters);
  console.log(`[RelationshipEngine] Step 2 complete: ${otherProfiles.length} profiles`);
  
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
    }
  };
  
  // Cache result
  relationshipCache.set(inputHash, output);
  
  console.log('[RelationshipEngine] Generation complete');
  return output;
}

/**
 * Build RelationshipModel deterministically from trait data
 */
function buildRelationshipModel(otherSelfModel, otherProfiles, meSelfModel, meCharacters, relationshipType) {
  const isRomantic = relationshipType === 'romantic';
  
  // Extract key patterns from Other
  const otherMappings = otherSelfModel.coreMappings;
  const otherTensions = otherSelfModel.tensions || [];
  
  // Calculate relational dynamics
  const field = calculateRelationalField(otherSelfModel, meSelfModel, otherProfiles);
  const bondingAxis = calculateBondingAxis(otherSelfModel, meSelfModel, isRomantic);
  const projectionShadow = calculateProjectionShadow(otherSelfModel, meSelfModel);
  const egoPersonaMismatch = calculateEgoPersonaMismatch(otherSelfModel, meSelfModel);
  const communicationConflict = calculateCommunicationConflict(otherSelfModel, meSelfModel, otherProfiles);
  const needsBoundaries = calculateNeedsBoundaries(otherSelfModel, meSelfModel, isRomantic);
  const growthPath = calculateGrowthPath(otherSelfModel, meSelfModel, otherTensions);
  const redFlagsRepair = calculateRedFlagsRepair(otherSelfModel, meSelfModel, otherTensions);
  
  // Generate situational guidance
  const nextStepsSituations = generateNextStepsSituations(
    field,
    bondingAxis,
    communicationConflict,
    isRomantic
  );
  
  return {
    type: relationshipType,
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
function calculateRelationalField(otherSelfModel, meSelfModel, otherProfiles) {
  const weights = otherSelfModel.weights?.perCharacterWeight || {};
  const mappings = otherSelfModel.coreMappings || {};
  
  // Determine field type based on ego/persona dynamics
  const egoChar = mappings.ego?.character;
  const personaChar = mappings.persona?.character;
  const shadowChar = mappings.shadow?.character;
  
  // Calculate polarity and resonance
  let polarityScore = 0;
  let resonanceScore = 0;
  
  // If Me data exists, calculate actual polarity
  if (meSelfModel) {
    const meMappings = meSelfModel.coreMappings || {};
    // Check for complementary vs similar patterns
    if (meMappings.ego?.character !== egoChar) polarityScore += 0.3;
    if (meMappings.shadow?.character === egoChar) polarityScore += 0.4; // Projection potential
    if (meMappings.persona?.character === personaChar) resonanceScore += 0.3;
  }
  
  return {
    type: polarityScore > 0.5 ? 'complementary' : 'resonant',
    polarityScore,
    resonanceScore,
    primaryDynamic: egoChar,
    secondaryDynamic: personaChar,
    shadowElement: shadowChar,
    analysisBullets: [
      `Primary relational axis through ${egoChar || 'unknown'}`,
      `Social interface mediated by ${personaChar || 'unknown'}`,
      `Hidden tensions around ${shadowChar || 'unknown'}`
    ]
  };
}

/**
 * Calculate attraction and bonding dynamics
 */
function calculateBondingAxis(otherSelfModel, meSelfModel, isRomantic) {
  const mappings = otherSelfModel.coreMappings || {};
  const erosChar = mappings.eros?.character;
  const feelingChar = mappings.feelingFunction?.character;
  
  // Different emphasis for romantic vs platonic
  const bondingType = isRomantic ? 'eros-driven' : 'trust-driven';
  
  return {
    type: bondingType,
    primaryAxis: isRomantic ? erosChar : feelingChar,
    secondaryAxis: isRomantic ? feelingChar : erosChar,
    intimacyStyle: isRomantic ? 'vulnerability-based' : 'collaboration-based',
    analysisBullets: [
      `${isRomantic ? 'Attraction' : 'Trust'} anchored in ${isRomantic ? erosChar : feelingChar}`,
      `Emotional connection through ${feelingChar}`,
      isRomantic ? 'Intimacy requires safe vulnerability' : 'Bond strengthens through shared challenges'
    ]
  };
}

/**
 * Calculate projection and shadow triggers
 */
function calculateProjectionShadow(otherSelfModel, meSelfModel) {
  const mappings = otherSelfModel.coreMappings || {};
  const shadowChar = mappings.shadow?.character;
  const shadowVirtueChar = mappings.shadowVirtue?.character;
  
  const triggers = [];
  
  // Shadow triggers
  if (shadowChar) {
    triggers.push({
      name: `${shadowChar} activation`,
      description: `Behaviors reminiscent of ${shadowChar} may trigger defensive reactions`,
      severity: 'moderate'
    });
  }
  
  // If Me data exists, check for cross-projections
  if (meSelfModel) {
    const meShadow = meSelfModel.coreMappings?.shadow?.character;
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
      `Shadow energy concentrated around ${shadowChar}`,
      `Shadow virtue (what they suppress but value): ${shadowVirtueChar}`,
      triggers.length > 0 ? `${triggers.length} identified projection triggers` : 'Low projection risk'
    ]
  };
}

/**
 * Calculate ego-persona mismatch
 */
function calculateEgoPersonaMismatch(otherSelfModel, meSelfModel) {
  const mappings = otherSelfModel.coreMappings || {};
  const egoChar = mappings.ego?.character;
  const personaChar = mappings.persona?.character;
  
  const mismatchLevel = egoChar === personaChar ? 'low' : 'moderate';
  
  return {
    egoCharacter: egoChar,
    personaCharacter: personaChar,
    mismatchLevel,
    publicVsPrivate: egoChar !== personaChar 
      ? `Public ${personaChar} masks private ${egoChar}`
      : 'Relatively integrated public/private self',
    analysisBullets: [
      `Core identity: ${egoChar}`,
      `Social presentation: ${personaChar}`,
      mismatchLevel === 'low' ? 'Low mask complexity' : 'Noticeable gap between public and private self'
    ]
  };
}

/**
 * Calculate communication and conflict style
 */
function calculateCommunicationConflict(otherSelfModel, meSelfModel, otherProfiles) {
  const mappings = otherSelfModel.coreMappings || {};
  const tensions = otherSelfModel.tensions || [];
  
  // Determine conflict style from profiles
  const egoProfile = otherProfiles.find(p => p.name === mappings.ego?.character);
  const conflictTendency = tensions.length > 10 ? 'avoidant' : tensions.length > 5 ? 'confrontational' : 'balanced';
  
  return {
    style: conflictTendency,
    primaryMode: mappings.feelingFunction?.character || 'unknown',
    tensionCount: tensions.length,
    repairStrategy: conflictTendency === 'avoidant' ? 'needs space before repair' : 'needs direct conversation',
    analysisBullets: [
      `Communication anchored in ${mappings.feelingFunction?.character || 'unknown'} energy`,
      `Conflict tendency: ${conflictTendency}`,
      tensions.length > 5 ? 'Multiple internal tensions affect external communication' : 'Relatively clear communication patterns'
    ]
  };
}

/**
 * Calculate needs, boundaries, and deal-breakers
 */
function calculateNeedsBoundaries(otherSelfModel, meSelfModel, isRomantic) {
  const mappings = otherSelfModel.coreMappings || {};
  const costs = otherSelfModel.costsAndCompensations || {};
  
  const needs = [];
  const boundaries = [];
  const dealBreakers = [];
  
  // Core needs based on ego/persona
  needs.push(`Recognition of ${mappings.ego?.character} core identity`);
  needs.push(`Space for ${mappings.shadow?.character} integration`);
  
  if (isRomantic) {
    needs.push(`Emotional safety through ${mappings.eros?.character} dynamics`);
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
function calculateGrowthPath(otherSelfModel, meSelfModel, tensions) {
  const direction = otherSelfModel.individuationDirection || {};
  const mappings = otherSelfModel.coreMappings || {};
  
  const growthAreas = [];
  
  // Shadow integration
  if (mappings.shadow?.character) {
    growthAreas.push({
      area: 'Shadow integration',
      description: `Supporting integration of ${mappings.shadow?.character} qualities`,
      priority: 'high'
    });
  }
  
  // Tension resolution
  if (tensions.length > 5) {
    growthAreas.push({
      area: 'Tension harmonization',
      description: 'Working through internal conflicts together',
      priority: 'medium'
    });
  }
  
  // Individuation support
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
function calculateRedFlagsRepair(otherSelfModel, meSelfModel, tensions) {
  const mappings = otherSelfModel.coreMappings || {};
  
  const redFlags = [];
  const repairSignals = [];
  
  // Shadow-based red flags
  if (mappings.shadow?.character) {
    redFlags.push({
      signal: `Persistent ${mappings.shadow?.character} acting out`,
      severity: 'warning',
      action: 'Address underlying need'
    });
  }
  
  // Persona collapse
  redFlags.push({
    signal: 'Persona rigidity or collapse',
    severity: 'caution',
    action: 'Create safe space for authentic expression'
  });
  
  // Repair signals
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
function generateNextStepsSituations(field, bondingAxis, communicationConflict, isRomantic) {
  const situations = [];
  
  // Situation 1: Initial deepening
  situations.push({
    title: isRomantic ? 'Deepening Intimacy' : 'Building Trust',
    context: `When ready to deepen the ${isRomantic ? 'romantic' : 'platonic'} connection`,
    guidance: isRomantic 
      ? `Honor ${bondingAxis.primaryAxis} energy while maintaining ${field.primaryDynamic} authenticity`
      : `Share vulnerably while respecting ${communicationConflict.style} communication style`
  });
  
  // Situation 2: Conflict navigation
  situations.push({
    title: 'Navigating Disagreement',
    context: 'During moments of tension or conflict',
    guidance: communicationConflict.repairStrategy
  });
  
  // Situation 3: Growth support
  situations.push({
    title: 'Supporting Growth',
    context: 'When partner/friend is going through change',
    guidance: `Honor their ${field.primaryDynamic} nature while encouraging shadow integration`
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
  
  const characterNames = otherProfiles.map(p => p.name).join(', ');
  
  const systemPrompt = `You are a Jungian relationship analyst creating mystical yet accessible narratives about relational dynamics.

Write in a style that is:
- Evocative and archetypal, not clinical
- Specific to the characters mentioned
- ${isRomantic ? 'Sensitive to romantic/intimate dynamics' : 'Focused on friendship and collaboration'}
- Never prescriptive or advice-giving, only descriptive

${hasMeData ? 'The user has provided their own character profile, so you can describe bidirectional dynamics.' : 'Focus only on describing the other person\'s patterns and likely relational dynamics.'}`;

  const userPrompt = `Generate a relationship narrative based on this analysis:

RELATIONSHIP TYPE: ${relationshipType}
OTHER PERSON'S CHARACTERS: ${characterNames}
${hasMeData ? 'USER HAS PROVIDED THEIR OWN PROFILE (describe bidirectional dynamics)' : 'USER HAS NOT PROVIDED THEIR OWN PROFILE (focus on their patterns)'}

RELATIONSHIP MODEL:
- Field type: ${relationshipModel.field.type}
- Primary dynamic: ${relationshipModel.field.primaryDynamic}
- Shadow element: ${relationshipModel.field.shadowElement}
- Bonding style: ${relationshipModel.bondingAxis.type}
- Communication style: ${relationshipModel.communicationConflict.style}
- Tension count: ${relationshipModel._internal.otherTensionCount}

Generate JSON with this structure:
{
  "myth": {
    "title": "A 4-6 word mythic title for this relationship",
    "summary": "2-3 sentence poetic summary",
    "story": "4-6 paragraphs telling the mythic story of this relationship dynamic",
    "themes": ["theme1", "theme2", "theme3"]
  },
  "relationalField": {
    "summary": "2-3 sentences",
    "story": "2-3 paragraphs about how these two fields interact"
  },
  "attractionBonding": {
    "summary": "2-3 sentences about ${isRomantic ? 'attraction/eros' : 'trust/connection'}",
    "story": "2-3 paragraphs about bonding dynamics"
  },
  "projectionShadow": {
    "summary": "2-3 sentences about projection patterns",
    "story": "2-3 paragraphs about shadow triggers between them"
  },
  "egoPersonaMismatch": {
    "summary": "2-3 sentences about public vs private self",
    "story": "2-3 paragraphs about authenticity dynamics"
  },
  "communicationConflict": {
    "summary": "2-3 sentences about communication patterns",
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

Be specific to ${characterNames}. Use their actual stories and traits.`;

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
  
  const characterNames = otherProfiles.map(p => p.name).join(', ');
  const hasMeData = !!meData.profile?.characters?.length;
  
  const prompt = `Generate relationship examples from the works of: ${characterNames}
${hasMeData ? 'Also include examples from user\'s characters if they exist in the profiles.' : ''}

For each relationship module, provide 2-3 concrete examples from their actual films/books/stories that illustrate the dynamic.

Return JSON:
{
  "relationalField": [{"characterName": "...", "fromSide": "other", "reference": {"title": "...", "year": "...", "medium": "film"}, "situation": "...", "actions": ["..."], "outcomeAndCost": ["..."], "tier": "A"}],
  "attractionBonding": [...],
  "projectionShadow": [...],
  "egoPersonaMismatch": [...],
  "communicationConflict": [...],
  "needsBoundaries": [...],
  "growthPath": [...],
  "redFlagsRepair": [...],
  "nextSteps": [...]
}

Use ONLY real scenes from their works. fromSide should be "other" for their characters, "me" for user's characters if applicable.`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Generate concrete examples from real films/books/stories. Always use real scenes.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 3000,
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('[RelationshipEngine] Example generation error:', error);
    // Return empty examples on error
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
