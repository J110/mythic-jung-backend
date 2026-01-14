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
import { safeParseJSON } from '../utils/jsonParser.js';
import { computeConstellation, computeRelationshipConstellation } from './archetypeConstellationEngine.js';

// Cache for relationship outputs
const relationshipCache = new Map();

/**
 * Clear all relationship caches
 */
export function clearRelationshipCache() {
  relationshipCache.clear();
  console.log('[RelationshipEngine] Cache cleared');
}

/**
 * Main entry point - generates relationship output
 * 
 * @param {Object} relationshipSet - The relationship character set
 * @param {Object} meData - Optional Me data for enrichment
 * @param {Object} options - Generation options (includes preRecognizedCharacters, referenceHints)
 * @returns {Promise<Object>} RelationshipOutput
 */
export async function generateRelationshipOutput(relationshipSet, meData = {}, options = {}) {
  console.log('[RelationshipEngine] Starting generation pipeline...');
  
  const { onProgress } = options;
  const reportProgress = (step, label) => {
    console.log(`[RelationshipEngine] Step ${step}: ${label}`);
    if (onProgress) onProgress(step, label);
  };
  
  const { relationshipType, otherCharacterInputs } = relationshipSet;
  
  // Create cache key
  const inputHash = createRelationshipHash(relationshipSet, meData);
  console.log(`[RelationshipEngine] Input hash: ${inputHash}`);
  
  // Check cache
  if (!options.force && relationshipCache.has(inputHash)) {
    console.log('[RelationshipEngine] Returning cached result');
    return relationshipCache.get(inputHash);
  }
  
  let canonicals;
  
  // Step 1: Use pre-recognized characters if available (from resonance flow)
  // This prevents re-recognition which would lose reference information
  reportProgress(1, 'Recognizing partner characters...');
  if (options.preRecognizedCharacters && options.preRecognizedCharacters.length >= 4) {
    console.log('[RelationshipEngine] Step 1: Using pre-recognized characters (skipping re-recognition)');
    canonicals = options.preRecognizedCharacters.map(c => c.canonical || c);
    console.log(`[RelationshipEngine] Pre-recognized: ${canonicals.map(c => c.name).join(', ')}`);
  } else {
    // Fallback: Recognize with reference hints if provided
    console.log('[RelationshipEngine] Step 1: Character Recognition...');
    
    // Build reference hints from options if available
    const referenceHints = options.referenceHints || {};
    console.log(`[RelationshipEngine] Reference hints: ${Object.keys(referenceHints).length > 0 ? JSON.stringify(referenceHints) : 'none'}`);
    
    const recognitionResult = await recognizeCharacters(otherCharacterInputs, referenceHints);
    
    // recognizeCharacters returns { results: [...], overall: {...} }
    const validResults = recognitionResult.results.filter(r => r.status === 'RECOGNIZED');
    if (validResults.length < 4) {
      throw new Error(`Only ${validResults.length} characters recognized. Need at least 4.`);
    }
    
    // Extract canonical objects for discovery
    canonicals = validResults.map(r => r.canonical);
    console.log(`[RelationshipEngine] Recognition complete: ${validResults.length} recognized`);
  }
  
  console.log(`[RelationshipEngine] Step 1 complete: ${canonicals.length} characters`);
  console.log(`[RelationshipEngine] Canonical names: ${canonicals.map(c => c.name).join(', ')}`);
  
  // Step 2: Discover character profiles
  reportProgress(2, 'Discovering partner character profiles...');
  const otherProfiles = await discoverCharacterProfiles(canonicals);
  
  // Log character names for debugging
  const characterNames = otherProfiles.map(p => p.name || p.canonicalName || 'Unknown');
  console.log(`[RelationshipEngine] Step 2 complete: ${otherProfiles.length} profiles`);
  console.log(`[RelationshipEngine] Characters: ${characterNames.join(', ')}`);
  
  // Step 3: Build OtherSelfModel (synthesis without assessments)
  reportProgress(3, 'Building psychological model...');
  const otherSelfModel = synthesizeSelfModel(otherProfiles, []);
  console.log('[RelationshipEngine] Step 3 complete');
  
  // Step 4: Build RelationshipModel (deterministic)
  reportProgress(4, 'Analyzing relationship dynamics...');
  const relationshipModel = buildRelationshipModel(
    otherSelfModel,
    otherProfiles,
    meData.selfModel,
    meData.profile?.characters || [],
    relationshipType
  );
  console.log('[RelationshipEngine] Step 4 complete');
  
  // Step 5: Generate RelationshipNarrative
  reportProgress(5, 'Generating relationship narrative...');
  const narrative = await generateRelationshipNarrative(
    relationshipModel,
    otherProfiles,
    meData,
    relationshipType
  );
  console.log('[RelationshipEngine] Step 5 complete');
  
  // Step 6: Generate RelationshipExamples
  reportProgress(6, 'Finding relationship examples...');
  const examples = await generateRelationshipExamples(
    relationshipModel,
    otherProfiles,
    meData,
    narrative
  );
  console.log('[RelationshipEngine] Step 6 complete');
  
  // Step 7: Generate What-If Scenarios (NEW)
  reportProgress(7, 'Generating what-if scenarios...');
  const whatIfScenarios = await generateWhatIfScenarios(
    relationshipModel,
    otherProfiles,
    meData,
    relationshipType
  );
  console.log('[RelationshipEngine] Step 7 complete');
  
  // Step 8: Generate Ease Zones and Rupture Loops (now async with AI)
  reportProgress(8, 'Analyzing ease zones and rupture loops...');
  const [easeZones, ruptureLoops] = await Promise.all([
    calculateEaseZones(relationshipModel, otherProfiles, meData),
    calculateRuptureLoops(relationshipModel, otherProfiles, meData),
  ]);
  console.log('[RelationshipEngine] Step 8 complete');
  
  // Step 9: Compute archetype constellation (deterministic)
  reportProgress(9, 'Computing archetype constellations...');
  let constellation = null;
  try {
    // Compute partner constellation
    const partnerConstellation = computeConstellation(otherSelfModel, otherProfiles, {}, []);
    
    // Compute Me constellation if available
    let meConstellation = null;
    if (meData.selfModel && meData.profiles) {
      meConstellation = computeConstellation(meData.selfModel, meData.profiles, {}, []);
    }
    
    // Compute relationship constellation if both exist
    let relationshipConstellationData = null;
    if (meConstellation && partnerConstellation) {
      relationshipConstellationData = computeRelationshipConstellation(
        meConstellation,
        partnerConstellation,
        relationshipModel
      );
    }
    
    constellation = {
      meConstellation,
      partnerConstellation,
      relationshipConstellation: relationshipConstellationData,
      taxonomyVersion: '1.0.0',
      computedAt: new Date().toISOString(),
    };
    console.log('[RelationshipEngine] Step 9 complete');
  } catch (constError) {
    console.error('[RelationshipEngine] Constellation error:', constError.message);
    // Non-fatal - continue without constellation
  }
  
  // Build final output (relationship-centered v2)
  const output = {
    myth: narrative.myth,
    relationshipModel,
    narrative,
    examples,
    // NEW: Relationship-centered additions
    whatIfScenarios,
    easeZones,
    ruptureLoops,
    // NEW: Archetype constellation
    constellation,
    // Include models for archetypes route
    otherSelfModel,
    otherProfiles,
    meta: {
      generatedAt: new Date().toISOString(),
      modelVersion: 'relationship-v2',
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
  
  // Get ALL character names from profiles (not just role-mapped ones)
  const allCharacterNames = otherProfiles.map(p => p.name || p.canonicalName).filter(Boolean);
  
  // Get character names for role mappings (may not include all characters)
  const characterNameMap = {
    ego: getCharacterName(otherMappings.ego),
    persona: getCharacterName(otherMappings.persona),
    shadow: getCharacterName(otherMappings.shadow),
    shadowVirtue: getCharacterName(otherMappings.shadowVirtue),
    feelingFunction: getCharacterName(otherMappings.feelingFunction),
    eros: getCharacterName(otherMappings.erosAxis),
  };
  
  // Find characters NOT assigned to any role
  const assignedCharacters = new Set(Object.values(characterNameMap).filter(Boolean));
  const unassignedCharacters = allCharacterNames.filter(name => !assignedCharacters.has(name));
  
  console.log('[RelationshipEngine] ALL characters:', allCharacterNames.join(', '));
  console.log('[RelationshipEngine] Role mappings:', characterNameMap);
  if (unassignedCharacters.length > 0) {
    console.log('[RelationshipEngine] Characters without role assignment:', unassignedCharacters.join(', '));
  }
  
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
    allCharacters: allCharacterNames,  // NEW: All characters for comprehensive narrative
    unassignedCharacters,               // NEW: Characters not in core roles (still important!)
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
  
  // Get ALL character names - use relationshipModel.allCharacters which includes everyone
  const allCharacters = relationshipModel.allCharacters || otherProfiles.map(p => p.name || p.canonicalName).filter(Boolean);
  const characterNames = allCharacters.join(', ');
  const charMap = relationshipModel.characterNames || {};
  const unassignedCharacters = relationshipModel.unassignedCharacters || [];
  
  console.log(`[RelationshipEngine] Generating narrative for ALL characters: ${characterNames}`);
  
  const systemPrompt = `You are a Jungian relationship analyst creating mystical yet accessible narratives about relational dynamics.

CRITICAL: You MUST reference ALL these characters throughout the narrative: ${characterNames}
Do NOT leave any character out. Each character represents an important facet of this person's psyche.

Write in a style that is:
- Evocative and archetypal, not clinical
- Specific to EACH character mentioned BY NAME
- ${isRomantic ? 'Sensitive to romantic/intimate dynamics' : 'Focused on friendship and collaboration'}
- Never prescriptive or advice-giving, only descriptive

${hasMeData ? 'The user has provided their own character profile, so you can describe bidirectional dynamics.' : 'Focus only on describing the other person\'s patterns and likely relational dynamics.'}`;

  // Build character context with profiles
  const profileContext = otherProfiles.map(p => {
    const traits = p.archetypeSignals?.primaryArchetypes?.slice(0,2).join(', ') || 'complex';
    return `- ${p.name}: ${traits}`;
  }).join('\n');

  const userPrompt = `Generate a relationship narrative based on this analysis:

RELATIONSHIP TYPE: ${relationshipType}

==== ALL CHARACTERS (MUST include ALL of these throughout the narrative) ====
${profileContext}

==== CHARACTER ROLE MAPPINGS ====
- Ego (core identity): ${charMap.ego || 'Not assigned'}
- Persona (social self): ${charMap.persona || 'Not assigned'}
- Shadow (hidden aspects): ${charMap.shadow || 'Not assigned'}
- Shadow Virtue: ${charMap.shadowVirtue || 'Not assigned'}
- Feeling Function: ${charMap.feelingFunction || 'Not assigned'}  
- Eros Axis: ${charMap.eros || 'Not assigned'}
${unassignedCharacters.length > 0 ? `\n==== CHARACTERS NOT IN CORE ROLES (still important - include them!) ====\n${unassignedCharacters.join(', ')}\n\nThese characters add nuance and depth to the relational picture. Include them in Field, Ease, Growth, What-If sections.` : ''}

${hasMeData ? 'USER HAS PROVIDED THEIR OWN PROFILE (describe bidirectional dynamics)' : 'USER HAS NOT PROVIDED THEIR OWN PROFILE (focus on their patterns)'}

RELATIONSHIP MODEL:
- Field type: ${relationshipModel.field.type}
- Primary dynamic: ${relationshipModel.field.primaryDynamic}
- Shadow element: ${relationshipModel.field.shadowElement}
- Bonding style: ${relationshipModel.bondingAxis.type}
- Communication style: ${relationshipModel.communicationConflict.style}
- Tension count: ${relationshipModel._internal.otherTensionCount}

IMPORTANT PERSPECTIVE RULES:
- INSIGHTS about the partner/relationship: Write in 3rd person describing THEM and the dynamic
- ACTIONS for growth/repair/next steps: Write in 2nd person addressing YOU (the reader/user)

The USER is reading this to understand their partner AND to get actionable guidance for THEMSELVES.

Generate JSON using the ACTUAL character names (${characterNames}), with this structure:
{
  "myth": {
    "title": "A 4-6 word mythic title for this relationship",
    "summary": "2-3 sentence poetic summary using character names",
    "story": "4-6 paragraphs telling the mythic story referencing ${characterNames} by name",
    "themes": ["theme1", "theme2", "theme3"]
  },
  "relationalField": {
    "summary": "2-3 sentences about how these character energies interact (INSIGHT - 3rd person)",
    "story": "2-3 paragraphs about the relational field between you"
  },
  "attractionBonding": {
    "summary": "2-3 sentences about ${isRomantic ? 'attraction/eros' : 'trust/connection'} (INSIGHT - 3rd person)",
    "story": "2-3 paragraphs about bonding dynamics"
  },
  "projectionShadow": {
    "summary": "2-3 sentences about projection patterns (INSIGHT - 3rd person)",
    "story": "2-3 paragraphs about shadow triggers. End with what YOU can watch for."
  },
  "egoPersonaMismatch": {
    "summary": "2-3 sentences about authenticity gaps (INSIGHT - 3rd person)",
    "story": "2-3 paragraphs about authenticity dynamics"
  },
  "communicationConflict": {
    "summary": "2-3 sentences about communication patterns (INSIGHT - 3rd person)",
    "story": "2-3 paragraphs about how conflict shows up. Include what YOU can do differently."
  },
  "needsBoundaries": {
    "summary": "2-3 sentences about needs (INSIGHT - 3rd person)",
    "story": "2-3 paragraphs about boundaries. Include YOUR boundaries to honor."
  },
  "growthPath": {
    "summary": "2-3 sentences about YOUR growth potential (ACTION - 2nd person)",
    "story": "2-3 paragraphs about what YOU can do to grow - not what 'the relationship' needs, but YOUR specific actions"
  },
  "redFlagsRepair": {
    "summary": "2-3 sentences about warning signs to watch for (ACTION - 2nd person)",
    "story": "2-3 paragraphs about how YOU can recognize ruptures early and what YOU can do to repair"
  },
  "nextSteps": [
    {"situation": "A specific situation YOU might face", "guidance": "What YOU can do (2nd person, actionable)"},
    {"situation": "Another situation", "guidance": "YOUR action to take"},
    {"situation": "Another situation", "guidance": "YOUR action to take"}
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
    const parsed = safeParseJSON(content, 'RelationshipNarrative');
    
    // Validate essential fields
    if (!parsed.myth && !parsed.field && !parsed.shadow) {
      console.warn('[RelationshipEngine] Narrative missing essential fields, may be incomplete');
    }
    
    return parsed;
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
  
  // Get ALL characters
  const allCharacters = relationshipModel.allCharacters || otherProfiles.map(p => p.name || p.canonicalName).filter(Boolean);
  const characterNames = allCharacters.join(', ');
  const hasMeData = !!meData.profile?.characters?.length;
  const charMap = relationshipModel.characterNames || {};
  
  // Build profile context for ALL characters WITH FRANCHISE INFORMATION
  const profileContext = otherProfiles.map(p => {
    const traits = p.archetypeSignals?.primaryArchetypes?.slice(0,2).join(', ') || 'complex';
    const franchise = p.provenance?.sources?.[0] || p.franchise || 'Unknown';
    const medium = p.medium || 'film';
    return `- ${p.name} from "${franchise}" (${medium}): ${traits}`;
  }).join('\n');
  
  const prompt = `Generate relationship examples from the works of ALL these characters:
${profileContext}

CRITICAL: Use the EXACT franchise/medium shown above for each character.
DO NOT change or make up franchises. Use only what's listed above.

IMPORTANT: Include examples from EVERY character listed above, not just the ego/shadow.
Each character represents an important facet of this person's psyche.

For each relationship module, provide 2-3 concrete examples from their ACTUAL films/books/stories.
Spread examples across ALL characters (${characterNames}).

Return JSON:
{
  "relationalField": [
    {
      "characterName": "${charMap.ego || otherProfiles[0]?.name}",
      "fromSide": "other",
      "reference": {"title": "EXACT franchise from list above", "year": "year if known", "medium": "medium from list above"},
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
- Use the EXACT franchise name from the character list above
- Each example must use a character name from: ${characterNames}
- DO NOT make up or change franchise names
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
    const examples = safeParseJSON(content, 'RelationshipExamples');
    
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

/**
 * Generate What-If Scenarios using AI
 * These are character-to-character moment analyses for key relationship themes
 */
async function generateWhatIfScenarios(relationshipModel, otherProfiles, meData, relationshipType) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const isRomantic = relationshipType === 'romantic';
  
  // Define scenario themes based on relationship type
  const themes = isRomantic
    ? ['conflict', 'intimacy', 'trust', 'autonomy']
    : ['conflict', 'trust', 'loyalty', 'boundaries'];
  
  // Get ALL character names - include everyone
  const allCharacters = relationshipModel.allCharacters || otherProfiles.map(p => p.name).filter(Boolean);
  const otherNames = allCharacters.join(', ');
  const meNames = meData.profile?.characters?.map(c => c.displayName).join(', ') || 'You';
  const charMap = relationshipModel.characterNames || {};
  
  // Build profile context for ALL characters WITH FRANCHISE INFORMATION
  const profileContext = otherProfiles.map(p => {
    const traits = p.archetypeSignals?.primaryArchetypes?.slice(0,2).join(', ') || 'complex';
    const franchise = p.provenance?.sources?.[0] || p.franchise || 'Unknown';
    const medium = p.medium || 'film';
    return `- ${p.name} from "${franchise}" (${medium}): ${traits}`;
  }).join('\n');
  
  console.log(`[RelationshipEngine] Generating What-If scenarios for ALL characters: ${otherNames}`);
  
  const prompt = `Generate 4 What-If Scenarios for a ${relationshipType} relationship.

==== PARTNER'S/FRIEND'S CHARACTERS (These belong to the OTHER person, NOT the user) ====
${profileContext}

CRITICAL: These are the PARTNER'S/FRIEND'S characters, NOT the user's characters.
Use the EXACT franchise/medium shown above for each character.

==== PARTNER'S ROLE ASSIGNMENTS ====
- Partner's Ego: ${charMap.ego || 'varies'}
- Partner's Shadow: ${charMap.shadow || 'varies'}
- Partner's Persona: ${charMap.persona || 'varies'}

${meNames !== 'You' ? `==== USER'S (ME) CHARACTERS ====
The user identifies with: ${meNames}
These are SEPARATE from the partner's characters above.
` : ''}
==== WRITING PERSPECTIVE ====
You are writing FOR the user (Me) ABOUT their partner/friend.
- The USER is reading this to understand how to navigate their relationship
- When you mention ${otherNames}, these are the PARTNER'S character energies
- "unconsciousPath" describes what happens if the USER doesn't become aware
- "consciousPath" describes what happens when the USER engages consciously
- "actions" are things the USER (reader) can do
- "avoid" are things the USER should avoid doing

For EACH of these themes: ${themes.join(', ')}

Generate a scenario that describes how the PARTNER'S character energy (from ${otherNames}) affects the relationship.
Each scenario should mention 1-2 of the PARTNER'S specific characters to ground the dynamic.

Generate a scenario with ALL of these fields (REQUIRED - do not leave any empty):
{
  "theme": "theme name",
  "setup": "A specific real-life situation - reference the partner's character energy (2nd person to user)",
  "unconsciousPattern": "The projection/trigger dynamic - mention which PARTNER character energy activates (2-3 sentences)",
  "unconsciousPath": "What happens if YOU react unconsciously - YOUR spiral (2-3 sentences, 2nd person)",
  "consciousPath": "What happens if YOU engage consciously - YOUR path (2-3 sentences, 2nd person)",
  "actions": ["Action for YOU to take with their character energy", "Another action", "A third action"],
  "avoid": ["Something YOU should avoid", "Another thing to avoid"]
}

Return JSON: {"scenarios": [scenario1, scenario2, scenario3, scenario4]}

CRITICAL RULES:
1. BOTH unconsciousPath AND consciousPath must have substantive content (2-3 sentences each)
2. ALL actions and guidance must be in 2nd person (YOU/YOUR) - addressing the user
3. REFERENCE specific characters from ${otherNames} as the PARTNER'S energies, not the user's
4. DO NOT assign ${otherNames} characters to the user - these belong to the partner
5. Use concrete, specific language - not vague therapy-speak`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a relationship dynamics expert. Generate realistic, specific scenarios with BOTH unconscious and conscious paths filled in completely. Never leave consciousPath empty.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 3000,
    });
    
    const result = safeParseJSON(response.choices[0].message.content, 'WhatIfScenarios');
    const scenarios = result.scenarios || [];
    
    console.log(`[RelationshipEngine] Generated ${scenarios.length} what-if scenarios`);
    
    // Validate and ensure all fields are present (with 2nd person language)
    // IMPORTANT: Check for empty strings explicitly, not just null/undefined
    return scenarios.map((s, idx) => {
      // Get raw values
      const rawUnconsciousPath = s.unconsciousPath?.trim?.() || s.unconscious_path?.trim?.() || '';
      const rawConsciousPath = s.consciousPath?.trim?.() || s.conscious_path?.trim?.() || '';
      
      // Log if either path is empty
      if (!rawConsciousPath) {
        console.warn(`[RelationshipEngine] Scenario ${idx} (${s.theme}) missing consciousPath, using default`);
      }
      if (!rawUnconsciousPath) {
        console.warn(`[RelationshipEngine] Scenario ${idx} (${s.theme}) missing unconsciousPath, using default`);
      }
      
      // Default conscious path that's context-aware
      const defaultConsciousPath = `With awareness, you can pause before reacting. You notice your ${s.theme || 'emotional'} response and name it without blame. By staying present rather than defensive, you create space for genuine understanding. This moment of choice transforms potential conflict into deeper connection.`;
      
      // Default unconscious path that's context-aware
      const defaultUnconsciousPath = `Without awareness, your defenses activate around ${s.theme || 'this'}. You might withdraw, become critical, or try to control the outcome. They sense your tension and respond in kind, pulling you both into a familiar but painful dance.`;
      
      return {
        theme: s.theme || 'general',
        setup: s.setup?.trim() || 'A challenging moment arises between you.',
        unconsciousPattern: s.unconsciousPattern?.trim() || 'Old patterns get triggered between you.',
        unconsciousPath: rawUnconsciousPath || defaultUnconsciousPath,
        consciousPath: rawConsciousPath || defaultConsciousPath,
        actions: (s.actions && s.actions.length > 0) ? s.actions : ['You can pause before reacting', 'You can express your feelings without blame', 'You can listen to understand'],
        avoid: (s.avoid && s.avoid.length > 0) ? s.avoid : ['Attacking their character', 'Going silent without explanation'],
        examples: [],
      };
    });
  } catch (error) {
    console.error('[RelationshipEngine] What-If generation error:', error);
    // Return default scenarios with complete fields (user-focused)
    return themes.map(theme => ({
      theme,
      setup: `A ${theme} moment arises between you.`,
      unconsciousPattern: 'Shadow projections and unmet needs create a trigger between you.',
      unconsciousPath: 'Without awareness, your defenses activate. You might withdraw or attack, they respond in kind, and you spiral into a painful loop.',
      consciousPath: 'With awareness, you can pause. You name what you feel without blame, creating space for understanding. The rupture becomes your opportunity for deeper connection.',
      actions: ['You can pause before reacting', 'You can name your feeling without blame', 'You can ask what they need'],
      avoid: ['Attacking their character', 'Going silent without explanation', 'Bringing up old wounds as weapons'],
      examples: [],
    }));
  }
}

/**
 * Calculate Ease Zones - where the relationship works naturally (with AI enrichment)
 */
async function calculateEaseZones(relationshipModel, otherProfiles, meData) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Get ALL characters - not just role-mapped ones
  const allCharacters = relationshipModel.allCharacters || otherProfiles.map(p => p.name).filter(Boolean);
  const characterNames = allCharacters.join(', ');
  const charMap = relationshipModel.characterNames || {};
  
  // Build profile context WITH FRANCHISE INFORMATION (to prevent AI from making up wrong franchises)
  const profileContext = otherProfiles.map(p => {
    const traits = p.archetypeSignals?.primaryArchetypes?.slice(0,2).join(', ') || 'complex';
    const franchise = p.provenance?.sources?.[0] || p.franchise || 'Unknown';
    const medium = p.medium || 'film';
    return `- ${p.name} from "${franchise}" (${medium}): ${traits}`;
  }).join('\n');
  
  console.log(`[RelationshipEngine] Generating Ease Zones for ALL characters: ${characterNames}`);
  
  const prompt = `Based on ALL these characters representing your partner's psyche:
${profileContext}

Generate 4-5 "Ease Zones" - areas where this relationship naturally flows and works well.

CRITICAL: When providing examples, use the EXACT franchise/medium shown above for each character.
DO NOT change or make up franchises. Use only what's listed above.

IMPORTANT: Include examples from DIFFERENT characters across zones. Don't just use the ego character.
Each zone should reference a SPECIFIC character from: ${characterNames}

For each zone, provide ONE concrete example from that character's actual film/book/story.

Return JSON:
{
  "summary": "2-3 sentences about where this relationship naturally thrives, mentioning 2-3 character names",
  "zones": [
    {
      "zone": "Name of the ease zone (e.g., 'Shared Playfulness')",
      "description": "1-2 sentences about why this works, mentioning the specific character",
      "characterHighlight": "Which character from ${characterNames} embodies this",
      "example": {
        "characterName": "Character name",
        "reference": {"title": "EXACT franchise from list above", "year": "year if known", "medium": "medium from list above"},
        "scene": "Brief scene description showing this dynamic"
      }
    }
  ]
}

Ensure you reference multiple different characters across the zones, not just one.`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Generate relationship ease zones based on character archetypes.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 1500,
    });
    
    const result = safeParseJSON(response.choices[0].message.content, 'EaseZones');
    
    return {
      summary: result.summary || `Your relationship naturally flows in several key areas.`,
      zones: (result.zones || []).map(z => typeof z === 'string' ? z : (z.zone || z.description)),
      zonesWithExamples: result.zones || [],
      exampleRefs: (result.zones || []).filter(z => z.example).map(z => ({
        characterName: z.example?.characterName,
        reference: z.example?.reference,
        situation: z.example?.scene,
        tier: 'B',
      })),
    };
  } catch (error) {
    console.error('[RelationshipEngine] Ease Zones AI error:', error);
    
    // Fallback to computed zones
    const zones = [];
    const otherStrengths = new Set();
    otherProfiles.forEach(p => {
      p.behavioralTraits?.strengths?.forEach(s => otherStrengths.add(s.toLowerCase()));
    });
    
    if (otherStrengths.has('loyalty')) zones.push('Commitment and reliability');
    if (otherStrengths.has('humor') || otherStrengths.has('wit')) zones.push('Playfulness and shared laughter');
    if (otherStrengths.has('empathy') || otherStrengths.has('compassion')) zones.push('Emotional attunement');
    if (otherStrengths.has('intelligence') || otherStrengths.has('depth')) zones.push('Deep conversations');
    
    if (zones.length < 2) {
      zones.push('Shared values and mutual respect');
      zones.push('Supporting each other\'s growth');
    }
    
    return {
      summary: `Your relationship naturally flows in ${zones.length} key areas.`,
      zones: zones.slice(0, 5),
      zonesWithExamples: [], // Include empty array for compatibility
      exampleRefs: [],
    };
  }
}

/**
 * Calculate Rupture Loops - where the relationship breaks (with AI enrichment)
 */
async function calculateRuptureLoops(relationshipModel, otherProfiles, meData) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Get ALL characters - not just role-mapped ones
  const allCharacters = relationshipModel.allCharacters || otherProfiles.map(p => p.name).filter(Boolean);
  const characterNames = allCharacters.join(', ');
  const charMap = relationshipModel.characterNames || {};
  
  // Build profile context WITH FRANCHISE INFORMATION (to prevent AI from making up wrong franchises)
  const profileContext = otherProfiles.map(p => {
    const traits = p.archetypeSignals?.primaryArchetypes?.slice(0,2).join(', ') || 'complex';
    const liabilities = p.behavioralTraits?.liabilities?.slice(0,2).join(', ') || 'hidden';
    const franchise = p.provenance?.sources?.[0] || p.franchise || 'Unknown';
    const medium = p.medium || 'film';
    return `- ${p.name} from "${franchise}" (${medium}): ${traits} (risks: ${liabilities})`;
  }).join('\n');
  
  console.log(`[RelationshipEngine] Generating Rupture Loops for ALL characters: ${characterNames}`);
  
  const prompt = `Based on ALL these characters representing your partner's psyche:
${profileContext}

Generate 3-4 "Rupture Loops" - recurring conflict patterns that can derail this relationship.

CRITICAL: When providing examples, use the EXACT franchise/medium shown above for each character.
DO NOT change or make up franchises. Use only what's listed above.

IMPORTANT: 
1. Draw examples from DIFFERENT characters - don't just use the shadow character
2. The "repair" field should be written for YOU (the user reading this) - what YOU can do
3. Reference specific characters from ${characterNames} in each loop

For each loop, provide ONE concrete example from that character's actual film/book/story.

Return JSON:
{
  "summary": "1-2 sentences about key vulnerabilities, mentioning 2 character names",
  "loops": [
    {
      "name": "Name of the loop (e.g., 'The Control Spiral')",
      "trigger": "What sets it off - mention the character whose energy activates",
      "pattern": "The escalation pattern (e.g., 'Restriction → Rebellion → Resentment')",
      "characterSource": "Which character from ${characterNames} this loop originates from",
      "repair": "What YOU can do to break this loop (2nd person - 'You can...')",
      "example": {
        "characterName": "Character name",
        "reference": {"title": "EXACT franchise from list above", "year": "year if known", "medium": "medium from list above"},
        "scene": "Brief scene description showing this pattern"
      }
    }
  ]
}

Ensure you reference multiple different characters across the loops.`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Generate relationship rupture patterns based on character shadow dynamics.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 1500,
    });
    
    const result = safeParseJSON(response.choices[0].message.content, 'RuptureLoops');
    
    return {
      summary: result.summary || `Watch for these patterns that can derail your connection.`,
      loops: (result.loops || []).map(l => ({
        name: l.name,
        trigger: l.trigger,
        pattern: l.pattern,
        repair: l.repair,
      })),
      exampleRefs: (result.loops || []).filter(l => l.example).map(l => ({
        characterName: l.example?.characterName,
        reference: l.example?.reference,
        situation: l.example?.scene,
        tier: 'B',
      })),
    };
  } catch (error) {
    console.error('[RelationshipEngine] Rupture Loops AI error:', error);
    
    // Fallback to computed loops
    const loops = [];
    const otherLiabilities = new Set();
    const otherTriggers = new Set();
    
    otherProfiles.forEach(p => {
      p.behavioralTraits?.liabilities?.forEach(l => otherLiabilities.add(l.toLowerCase()));
      p.behavioralTraits?.triggers?.forEach(t => otherTriggers.add(t.toLowerCase()));
    });
    
    if (otherLiabilities.has('control') || otherTriggers.has('being controlled')) {
      loops.push({
        name: 'The Control Spiral',
        trigger: 'When one person feels their autonomy is threatened',
        pattern: 'Restriction → Rebellion → More restriction → Resentment',
        repair: 'You can renegotiate boundaries before resentment builds. Name what you need without demanding.',
      });
    }
    
    if (otherLiabilities.has('withdrawal') || otherTriggers.has('abandonment')) {
      loops.push({
        name: 'The Pursuit-Distance Dance',
        trigger: 'When one withdraws under stress',
        pattern: 'Withdrawal → Pursuit → More withdrawal → Panic',
        repair: 'You can signal your need for space while reassuring you\'ll return. Don\'t disappear without a word.',
      });
    }
    
    if (loops.length < 2) {
      loops.push({
        name: 'The Assumption Trap',
        trigger: 'When expectations go unspoken',
        pattern: 'Unmet expectation → Disappointment → Blame',
        repair: 'You can verbalize your needs before they become resentments. Ask rather than assume.',
      });
    }
    
    return {
      summary: `Watch for these patterns that can derail your connection.`,
      loops: loops.slice(0, 4),
      exampleRefs: [],
    };
  }
}
