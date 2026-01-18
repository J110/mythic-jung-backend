/**
 * Narrative Engine
 * Generates fully dynamic, mystical Jungian narratives from SelfModel + CharacterProfiles.
 * NO HARDCODING - everything is generated fresh for each user.
 */

import OpenAI from 'openai';
import { safeParseJSON } from '../utils/jsonParser.js';

let openai = null;

function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Generate narrative output from SelfModel and CharacterProfiles
 */
export async function generateNarrative(selfModel, profiles, options = {}) {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI API key required for narrative generation');
  }

  console.log('[Narrative Engine] Starting fully dynamic generation...');
  
  // Generate the complete narrative using a detailed, character-specific prompt
  const output = await generateFullNarrative(selfModel, profiles, client);
  
  // Generate identification_v2 if dynamics are available
  if (selfModel.identificationDynamics) {
    console.log('[Narrative Engine] Generating identification_v2 (Center/Orbit)...');
    try {
      output.identification_v2 = await generateIdentificationV2(selfModel, profiles, client);
      console.log('[Narrative Engine] identification_v2 generated successfully');
    } catch (v2Error) {
      console.error('[Narrative Engine] Error generating identification_v2:', v2Error.message);
    }
  }
  
  // Add meta (no evidence - examples will be added by Example Engine)
  output.meta = {
    generatedAt: new Date().toISOString(),
    modelVersion: process.env.OPENAI_NARRATIVE_MODEL || 'gpt-4o',
    promptVersion: 'v2-dynamic',
    schemaVersion: 1,
    identificationVersion: selfModel.identificationDynamics ? '2.0' : '1.0',
  };
  
  console.log('[Narrative Engine] Generation complete');
  return output;
}

/**
 * Generate full narrative with detailed, dynamic prompts
 */
async function generateFullNarrative(selfModel, profiles, client) {
  // Build rich character context
  const characterContext = buildCharacterContext(profiles, selfModel);
  
  // === NEW: Build assessment-aware context ===
  const assessmentContext = buildAssessmentContext(selfModel);
  
  // Optimized concise system prompt with assessment awareness
  const systemPrompt = `You are a Jungian storyteller. Create mythical, deeply personal narratives.
STYLE: Joseph Campbell + Carl Jung. Vivid imagery. Character-specific references. Poetic language.
AVOID: Generic phrases, psychology jargon, vague advice.
INCLUDE: Specific character scenes, archetypal metaphors, mythic tension.
${assessmentContext.emphasis ? `CURRENT EMPHASIS: ${assessmentContext.emphasis}` : ''}`;

  // Build assessment-specific instructions
  const assessmentInstructions = buildAssessmentInstructions(selfModel);

  const userPrompt = `Create a complete Jungian psychological profile for someone whose inner world is mapped by these characters:

${characterContext}

SELF MODEL ANALYSIS:
- Core Wound Pattern: ${selfModel.tensions.map(t => t.recurringConflict).filter(Boolean).join('; ') || 'Exploring the depths'}
- Life Phase: ${selfModel.coreMappings.lifePhase?.characterRefs?.[0] || 'Transformation'}
- Missing Qualities: ${selfModel.individuationDirection.missingQualities.join(', ')}
- Next Chapter Theme: ${selfModel.individuationDirection.nextChapterTheme}
${assessmentContext.dominantNow ? `- Current Psychic Energy: Strongly expressed through ${assessmentContext.dominantNow.join(' and ')}` : ''}
${assessmentContext.erosNeedNow ? `- Intimacy/Connection Need: Seeking through ${assessmentContext.erosNeedNow.join(' and ')}` : ''}
${assessmentContext.riskEdgesNow ? `- Shadow Risk Edges: Watch for ${assessmentContext.riskEdgesNow.join(', ')}` : ''}

${assessmentInstructions}

=== CRITICAL: ROLE ASSIGNMENTS (USE EXACTLY THESE CHARACTERS) ===
In the "identification" section, you MUST use these EXACT character assignments:
- EGO section: Use ONLY "${selfModel.coreMappings.ego?.characterRefs?.[0] || 'the ego character'}"
- PERSONA section: Use ONLY "${selfModel.coreMappings.persona?.characterRefs?.[0] || 'the persona character'}"
- SHADOW section: Use ONLY "${selfModel.coreMappings.shadow?.characterRefs?.[0] || 'the shadow character'}"
- SHADOWVIRTUE section: Use ONLY "${selfModel.coreMappings.shadowVirtue?.characterRefs?.[0] || 'the shadow virtue character'}"
- FEELINGFUNCTION section: Use ONLY "${selfModel.coreMappings.feelingFunction?.characterRefs?.[0] || 'the feeling character'}"
- EROSAXIS section: Use ONLY "${selfModel.coreMappings.erosAxis?.characterRefs?.[0] || 'the eros character'}"

DO NOT mix up characters between sections. Each section's "characters" array MUST contain ONLY the assigned character.

Generate a JSON response with this EXACT structure (all fields required):

{
  "story": {
    "mythSummary": "A 4-6 paragraph narrative that reads like a mythical origin story. Start with an evocative opening that names the Ego character. Weave in how Persona, Shadow, and other characters represent different soul aspects. Make it feel like discovering an ancient prophecy about oneself. Reference specific character moments and arcs.",
    "centralTension": "2-4 sentences describing the core inner conflict, using specific character dynamics. Example: 'Like [Character A] torn between mission and loyalty, and [Character B] hiding vulnerability beneath control, you live in the space where...'",
    "guidingSentence": "One powerful, memorable sentence that captures the essence of this person's mythic journey. Make it feel like destiny.",
    "northStarScene": "A vivid 2-3 sentence description of an imagined scene that represents their highest potential, drawing from character imagery.",
    "currentChapter": "2-4 paragraphs describing the current phase of their psychological journey. Where are they NOW in their myth? What patterns are active? What is being shed and what is emerging? Reference current character dynamics and the transition they're navigating. Make it feel present and alive, not abstract."
  },
  "identification": {
    "ego": {
      "title": "The [Archetype] – Embodied by [Character Name]",
      "summary": "5-7 sentences exploring how this character represents the conscious self. Reference specific character traits, decisions, and moments.",
      "characters": ["character name"],
      "details": "4-6 sentences going deeper into the psychological meaning. What does this ego structure seek? Fear? How does it navigate the world?"
    },
    "persona": {
      "title": "The [Mask Type] – Worn Like [Character Name]",
      "summary": "5-7 sentences on the social mask, referencing how the character presents to the world vs their inner truth.",
      "characters": ["character name"],
      "details": "4-6 sentences on the gap between persona and authentic self, using character examples."
    },
    "shadow": {
      "title": "The [Shadow Type] – Hidden in [Character Name]",
      "summary": "5-7 sentences on what this person represses or denies, mirrored by the shadow character's own darkness.",
      "characters": ["character name"],
      "details": "4-6 sentences on what the shadow holds and how it might be integrated."
    },
    "shadowVirtue": {
      "title": "The [Hidden Gift] – Glimpsed in [Character Name]",
      "summary": "4-6 sentences on the gold hidden in the shadow, referencing character redemption arcs.",
      "characters": ["character name"],
      "details": "3-5 sentences on how to access this shadow virtue."
    },
    "feelingFunction": {
      "title": "The [Feeling Mode] – Expressed Through [Character Name]",
      "summary": "5-7 sentences on how emotions are processed, using character emotional patterns.",
      "characters": ["character name"],
      "details": "4-6 sentences on emotional strengths and growth edges."
    },
    "erosAxis": {
      "title": "The [Connection Style] – Seeking Like [Character Name]",
      "summary": "4-6 sentences on relationship patterns and intimacy styles.",
      "characters": ["character name"],
      "details": "3-5 sentences on what this person truly seeks in connection."
    }
  },
  "functioning": {
    "coreTraits": ["8-12 specific character-derived traits, not generic adjectives"],
    "symbolicEssence": "4-6 sentences describing the mythic core of this person, using rich imagery and character references.",
    "narrativeArc": "2-3 paragraphs telling the story pattern of their life, with character parallels.",
    "redemptionArc": "2-3 paragraphs on their path to wholeness, referencing character transformations.",
    "costsAndCompensations": {
      "costs": [{"cost": "specific cost derived from character liabilities", "characterRef": "character name"}],
      "compensators": [{"compensation": "specific compensation strategy", "characterRef": "character name"}]
    },
    "alignmentIndicators": {
      "aligned": ["4-6 signs they're living authentically, drawn from character strengths"],
      "unaligned": ["4-6 signs they're out of alignment, drawn from character shadow aspects"]
    }
  },
  "actions": {
    "situationBlocks": [
      {
        "title": "Compelling Situation Title (like 'When Authority Tests You')",
        "situation": "2-3 sentence scenario description relevant to their character mix",
        "alignedResponse": ["5-7 specific actions drawing from character wisdom"],
        "beWaryOf": ["4-6 pitfalls based on character shadow patterns"]
      }
    ],
    "guidingQuestion": "One profound question for ongoing self-reflection, specific to their journey."
  },
  "lifeDomains": {
    "work": {
      "title": "Work & Purpose",
      "iAm": ["3-4 identity statements in work context, character-informed"],
      "iTendTo": ["3-4 behavioral patterns in work"],
      "typicalSituations": ["3-4 common work scenarios"],
      "watchOuts": ["3-4 work pitfalls from shadow"],
      "toRealizePotential": ["3-4 growth actions for work"],
      "selfDirection": "1-2 sentence guidance for work domain"
    },
    "leadership": {
      "title": "Leadership & Authority",
      "iAm": ["3-4 leadership identity statements"],
      "iTendTo": ["3-4 leadership patterns"],
      "typicalSituations": ["3-4 leadership scenarios"],
      "watchOuts": ["3-4 leadership shadows"],
      "toRealizePotential": ["3-4 leadership growth edges"],
      "selfDirection": "1-2 sentence leadership guidance"
    },
    "truth": {
      "title": "Truth & Moral Courage",
      "iAm": ["3-4 truth-related identity statements"],
      "iTendTo": ["3-4 patterns around truth/ethics"],
      "typicalSituations": ["3-4 moral dilemma scenarios"],
      "watchOuts": ["3-4 ethical blind spots"],
      "toRealizePotential": ["3-4 truth-telling growth edges"],
      "selfDirection": "1-2 sentence truth guidance"
    },
    "intimacy": {
      "title": "Relationships & Intimacy",
      "iAm": ["3-4 relationship identity statements"],
      "iTendTo": ["3-4 intimacy patterns"],
      "typicalSituations": ["3-4 relationship scenarios"],
      "watchOuts": ["3-4 intimacy shadows"],
      "toRealizePotential": ["3-4 relationship growth edges"],
      "selfDirection": "1-2 sentence intimacy guidance"
    },
    "social": {
      "title": "Friendships & Social Life",
      "iAm": ["3-4 social identity statements"],
      "iTendTo": ["3-4 social patterns"],
      "typicalSituations": ["3-4 social scenarios"],
      "watchOuts": ["3-4 social shadows"],
      "toRealizePotential": ["3-4 social growth edges"],
      "selfDirection": "1-2 sentence social guidance"
    },
    "innerLife": {
      "title": "Emotional & Inner Life",
      "iAm": ["3-4 inner life identity statements"],
      "iTendTo": ["3-4 inner life patterns"],
      "typicalSituations": ["3-4 inner life scenarios"],
      "watchOuts": ["3-4 inner shadows"],
      "toRealizePotential": ["3-4 inner growth edges"],
      "selfDirection": "1-2 sentence inner life guidance"
    }
  }
}

Generate 4-5 situationBlocks. All text must be specific to these characters.`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_NARRATIVE_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75,
      max_tokens: 6000, // Optimized for speed while maintaining quality
    });

    const content = response.choices[0].message.content.trim();
    const parsed = safeParseJSON(content, 'NarrativeEngine.generateFullNarrative');
    
    // Validate and ensure completeness
    return validateOutput(parsed, selfModel, profiles);
  } catch (error) {
    console.error('[Narrative Engine] Error:', error.message);
    throw new Error(`Failed to generate narrative: ${error.message}`);
  }
}

/**
 * Generate identification_v2 with Center/Orbit/Compensation narratives
 * V3: Now supports primary + secondary format and dominant archetype
 */
async function generateIdentificationV2(selfModel, profiles, client) {
  const dynamics = selfModel.identificationDynamics;
  const dominantArchetype = dynamics._dominantArchetype;
  
  // Build a compact context for the AI with V3 format
  const archetypeContext = Object.entries(dynamics)
    .filter(([key, data]) => key !== '_dominantArchetype' && (data?.center || data?.primary))
    .map(([archetype, data]) => {
      // V3 format has primary/secondary, V2 format has center
      const primaryChar = data.primary?.character || data.center?.characters?.[0];
      const secondaryChars = data.secondary?.map(s => s.character) || [];
      const orbitCount = data.orbit?.length || 0;
      const compCount = data.compensations?.length || 0;
      const confidence = data.primary?.confidence || data.center?.confidence || 0;
      const evidenceFlags = data.primary?.evidenceFlags || [];
      
      let line = `${archetype}: primary=${primaryChar} (conf: ${confidence.toFixed(2)})`;
      if (secondaryChars.length > 0) line += `, secondary=[${secondaryChars.join(', ')}]`;
      if (evidenceFlags.length > 0) line += `, evidence=[${evidenceFlags.slice(0,3).join(', ')}]`;
      line += `, orbits=${orbitCount}`;
      
      return line;
    })
    .join('\n');
  
  // Add dominant archetype info if present
  const dominantContext = dominantArchetype?.enabled 
    ? `\n\nDOMINANT ARCHETYPE DETECTED: ${dominantArchetype.characterName} appears in ${dominantArchetype.roles.length} roles (${dominantArchetype.roles.join(', ')}). This means ONE character is doing multiple psychological jobs - the narrative should acknowledge this.`
    : '';
  
  const characterContext = profiles.map(p => 
    `${p.name}: ${p.archetypeSignals?.primaryArchetypes?.slice(0,2).join(', ') || 'Hero'}`
  ).join('; ');

  const systemPrompt = `You are a Jungian analyst generating rich, descriptive narratives for psychological positions.
STYLE: Descriptive, character-specific, mythic but accessible. NO therapy-speak, NO generic advice.
OUTPUT: Pure JSON. All text fields must be substantive and specific to the characters.
IMPORTANT: Do NOT show numeric scores or confidence numbers in the narrative. Use descriptive language only.`;

  const userPrompt = `Generate identification_v2 narratives for this person's psychological structure:${dominantContext}

ARCHETYPE MAPPINGS:
${archetypeContext}

CHARACTERS: ${characterContext}

For EACH archetype (ego, persona, shadow, shadowVirtue, feelingFunction, erosAxis), generate:

{
  "version": "2.0",
  "ego": {
    "center": {
      "summary": "3-6 sentences describing their stable ego position, referencing the specific character. How they typically show up, what drives them, their core way of being.",
      "details": "4-8 sentences going deeper into the psychological meaning. What does this ego structure seek? What does it fear? How does it navigate?"
    },
    "orbit": [
      {
        "pattern": "1-3 sentences describing the shift pattern (descriptive, not advice). Reference character behavior.",
        "stabilizer": "1 sentence on what naturally helps return to center (observed pattern, not advice)"
      }
    ],
    "compensations": [
      {
        "expression": ["2-4 bullet behaviors observed when this compensation activates"],
        "risk": "1-2 sentences describing the cost if this continues (descriptive)",
        "returnPath": "1-2 sentences describing what restores balance (observed pattern)"
      }
    ]
  },
  "persona": { /* same structure */ },
  "shadow": { /* same structure */ },
  "shadowVirtue": { /* same structure - can have fewer orbits/compensations */ },
  "feelingFunction": { /* same structure */ },
  "erosAxis": { /* same structure - can have fewer orbits/compensations */ }
}

RULES:
- All summaries/details MUST reference specific character names and their traits
- Orbit patterns should match the number of orbit entries provided
- Keep language mythic but accessible to laypeople
- No diagnosis language, no advice tone
- Do NOT include numeric scores or confidence percentages in the narrative text
${dominantArchetype?.enabled ? `
DOMINANT ARCHETYPE HANDLING:
Since ${dominantArchetype.characterName} appears in multiple roles (${dominantArchetype.roles.join(', ')}):
1. Acknowledge that one archetype is "doing multiple jobs"
2. Describe ONE strength of this pattern
3. Describe ONE cost/risk of this pattern  
4. Suggest ONE integration action (not advice, but an observed path)
` : ''}`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_NARRATIVE_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = response.choices[0].message.content.trim();
    const parsed = safeParseJSON(content, 'NarrativeEngine.generateIdentificationV2');
    
    // Merge AI-generated narratives with deterministic data from dynamics
    return mergeIdentificationV2(parsed, dynamics, profiles);
  } catch (error) {
    console.error('[Narrative Engine] Error generating identification_v2:', error.message);
    // Return a minimal v2 structure on error
    return createMinimalIdentificationV2(dynamics, profiles);
  }
}

/**
 * Merge AI narratives with deterministic synthesis data
 * V3: Now supports primary + secondary format
 */
function mergeIdentificationV2(aiGenerated, dynamics, profiles) {
  const result = {
    version: '2.0',
  };
  
  const archetypes = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis'];
  
  archetypes.forEach(archetype => {
    const dynamicData = dynamics[archetype];
    const aiData = aiGenerated[archetype];
    
    // V3 format check: primary/secondary or center
    const hasV3Format = dynamicData?.primary;
    const hasCenter = dynamicData?.center;
    
    if (!hasV3Format && !hasCenter) {
      result[archetype] = null;
      return;
    }
    
    // Build center from V3 primary or legacy center
    const primaryChar = hasV3Format ? dynamicData.primary.character : dynamicData.center?.characters?.[0];
    const centerCharacters = hasV3Format 
      ? [dynamicData.primary.character, ...(dynamicData.secondary || []).map(s => s.character)]
      : dynamicData.center?.characters || [];
    const confidence = hasV3Format ? dynamicData.primary.confidence : dynamicData.center?.confidence;
    const evidenceFlags = hasV3Format ? dynamicData.primary.evidenceFlags : [];
    
    // === FIX: Replace wrong character names in AI-generated text ===
    // The AI might ignore instructions and mention a different character in the narrative.
    // We fix this by replacing any wrong character name with the correct one (primaryChar).
    let aiSummary = aiData?.center?.summary || `Your ${archetype} is embodied by ${centerCharacters.join(' and ')}.`;
    let aiDetails = aiData?.center?.details || '';
    
    // Get AI's characters (might be wrong)
    const aiChars = aiData?.center?.characters || [];
    if (primaryChar && aiChars.length > 0 && aiChars[0] && aiChars[0] !== primaryChar) {
      console.log(`[NarrativeEngine] Fixing character mismatch in ${archetype} V2: "${aiChars[0]}" -> "${primaryChar}"`);
      // Replace wrong character name in summary and details
      const wrongChar = aiChars[0];
      aiSummary = aiSummary.replace(new RegExp(wrongChar, 'gi'), primaryChar);
      aiDetails = aiDetails.replace(new RegExp(wrongChar, 'gi'), primaryChar);
    }
    
    result[archetype] = {
      // PRIMARY + SECONDARY (V3 format)
      primary: hasV3Format ? {
        characterId: dynamicData.primary.characterId,
        character: dynamicData.primary.character,
        confidence: dynamicData.primary.confidence,
        evidenceFlags: dynamicData.primary.evidenceFlags,
      } : null,
      
      secondary: hasV3Format ? dynamicData.secondary : [],
      
      // CENTER: deterministic data + AI narrative (backwards compatible)
      center: {
        label: hasCenter ? dynamicData.center.label : `Primary ${archetype} Position`,
        characters: centerCharacters,
        summary: aiSummary,
        details: aiDetails,
        confidence: confidence,
        rationale: {
          ...(hasCenter ? dynamicData.center.rationale : {}),
          evidenceFlags, // V3: Include evidence flags
        },
      },
      
      // ORBIT: deterministic triggers + AI patterns
      // IMPORTANT: trigger must be an object { name, tags }, not a string
      orbit: (dynamicData.orbit || []).map((orbitEntry, idx) => ({
        trigger: typeof orbitEntry.trigger === 'object' 
          ? orbitEntry.trigger 
          : { 
              name: orbitEntry.trigger || orbitEntry.triggerName || 'Contextual Shift',
              tags: orbitEntry.tags || [],
            },
        characters: orbitEntry.characters || [orbitEntry.character].filter(Boolean),
        character: orbitEntry.character,
        pattern: aiData?.orbit?.[idx]?.pattern || '',
        costRisk: orbitEntry.costRisk,
        stabilizer: aiData?.orbit?.[idx]?.stabilizer || '',
        rationale: orbitEntry.rationale,
        confidence: orbitEntry.confidence,
        evidenceFlags: orbitEntry.evidenceFlags,
      })),
      
      // COMPENSATIONS: deterministic structure + AI descriptions
      compensations: (dynamicData.compensations || []).map((comp, idx) => ({
        name: comp.name,
        when: comp.when,
        expression: aiData?.compensations?.[idx]?.expression || comp.expression,
        risk: aiData?.compensations?.[idx]?.risk || comp.risk,
        returnPath: aiData?.compensations?.[idx]?.returnPath || comp.returnPath,
        characters: comp.characters,
        rationale: comp.rationale,
      })),
      
      // V3: Role confidence
      roleConfidence: dynamicData.roleConfidence,
    };
  });
  
  // V3: Add dominant archetype info
  if (dynamics._dominantArchetype?.enabled) {
    result._dominantArchetype = dynamics._dominantArchetype;
  }
  
  return result;
}

/**
 * Create minimal identification_v2 when AI generation fails
 */
function createMinimalIdentificationV2(dynamics, profiles) {
  const result = {
    version: '2.0',
  };
  
  const archetypes = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis'];
  
  archetypes.forEach(archetype => {
    const dynamicData = dynamics[archetype];
    
    if (!dynamicData?.center) {
      result[archetype] = null;
      return;
    }
    
    const primaryChar = dynamicData.center.characters[0];
    const profile = profiles.find(p => p.name === primaryChar);
    
    result[archetype] = {
      center: {
        label: dynamicData.center.label,
        characters: dynamicData.center.characters,
        summary: `Your ${archetype} finds its expression through ${primaryChar}${profile?.archetypeSignals?.primaryArchetypes?.[0] ? `, carrying the ${profile.archetypeSignals.primaryArchetypes[0]} archetype` : ''}.`,
        details: '',
        confidence: dynamicData.center.confidence,
        rationale: dynamicData.center.rationale,
      },
      orbit: (dynamicData.orbit || []).map(orbitEntry => ({
        trigger: orbitEntry.trigger,
        characters: orbitEntry.characters,
        pattern: '',
        costRisk: orbitEntry.costRisk,
        stabilizer: '',
        rationale: orbitEntry.rationale,
      })),
      compensations: (dynamicData.compensations || []).map(comp => ({
        name: comp.name,
        when: comp.when,
        expression: comp.expression,
        risk: comp.risk,
        returnPath: comp.returnPath,
        characters: comp.characters,
        rationale: comp.rationale,
      })),
    };
  });
  
  return result;
}

/**
 * Build assessment-aware context for narrative generation
 */
function buildAssessmentContext(selfModel) {
  const state = selfModel.assessmentState || {};
  const signals = selfModel.assessmentSignals || {};
  
  let emphasis = '';
  
  // Determine narrative emphasis based on assessment signals
  if (state.dominantNow?.length > 0) {
    emphasis = `Focus current energy descriptions on ${state.dominantNow.join(' and ')}`;
  }
  
  // Add surprise insight if available
  const surprises = state.surpriseCandidates || signals.surpriseCandidates || [];
  if (surprises.length > 0) {
    const topSurprise = surprises[0];
    emphasis += emphasis ? '. ' : '';
    emphasis += `Include this grounded insight: "${topSurprise.insight}"`;
  }
  
  return {
    dominantNow: state.dominantNow?.length > 0 ? state.dominantNow : null,
    erosNeedNow: state.erosNeedNow?.length > 0 ? state.erosNeedNow : null,
    riskEdgesNow: state.riskEdgesNow?.length > 0 ? state.riskEdgesNow : null,
    contextTriggers: state.contextTriggers || signals.contextTriggers || [],
    surprises,
    emphasis,
    coverage: state.coverage || signals.coverage || {},
  };
}

/**
 * Build assessment-specific generation instructions
 */
function buildAssessmentInstructions(selfModel) {
  const state = selfModel.assessmentState || {};
  const triggers = state.contextTriggers || selfModel.assessmentSignals?.contextTriggers || [];
  const surprises = state.surpriseCandidates || selfModel.assessmentSignals?.surpriseCandidates || [];
  
  const instructions = [];
  
  // Felt-emphasis alignment: Libidinal Charge characters in Story + Functioning
  if (state.dominantNow?.length > 0) {
    instructions.push(`FELT ALIGNMENT: In Story mythSummary and Functioning symbolicEssence, emphasize ${state.dominantNow.join(' and ')} as the current foreground energy. They should feel present and active.`);
  }
  
  // Persona cost realism from PF_Q3
  const costlyMaskTrigger = triggers.find(t => t.triggerTag === 'costly_mask');
  if (costlyMaskTrigger) {
    instructions.push(`PERSONA COST: In Actions warnings, reference the cost of the ${costlyMaskTrigger.dominantCharacterIds?.[0] || 'persona'} mask. Be specific about what maintaining this costs.`);
  }
  
  // Shadow nuance from SP_Q4
  const shadowVirtueTrigger = triggers.find(t => t.triggerTag === 'shadow_virtue');
  if (shadowVirtueTrigger) {
    instructions.push(`SHADOW VIRTUE: In shadowVirtue identification, show how ${shadowVirtueTrigger.dominantCharacterIds?.[0] || 'the shadow'} offers a borrowed virtue in specific contexts.`);
  }
  
  // Eros/intimacy anchoring from FF_Q4
  if (state.erosNeedNow?.length > 0) {
    instructions.push(`EROS ANCHORING: In intimacy lifeDomain and erosAxis, strongly feature ${state.erosNeedNow.join(' and ')} as the primary intimacy/connection pattern.`);
  }
  
  // Cost/Compensation grounding from CC
  const exhaustionTrigger = triggers.find(t => t.triggerTag === 'exhaustion');
  const restoreTrigger = triggers.find(t => t.triggerTag === 'restore_ritual');
  if (exhaustionTrigger || restoreTrigger) {
    const ccInstructions = [];
    if (exhaustionTrigger) {
      ccInstructions.push(`burnout pattern through ${exhaustionTrigger.dominantCharacterIds?.[0] || 'cost character'}`);
    }
    if (restoreTrigger) {
      ccInstructions.push(`restore ritual through ${restoreTrigger.dominantCharacterIds?.[0] || 'restore character'}`);
    }
    instructions.push(`COST GROUNDING: In Functioning costsAndCompensations and Actions warnings, include ${ccInstructions.join(' and ')}.`);
  }
  
  // Surprise insight (grounded, not hallucinated)
  if (surprises.length > 0) {
    const topSurprise = surprises[0];
    instructions.push(`GROUNDED INSIGHT: Include this surprising but grounded observation in the narrative: "${topSurprise.insight}" (supported by ${topSurprise.assessmentRefs?.join(', ') || 'assessment'} and ${topSurprise.traitSignals?.join(', ') || 'character traits'}). Do NOT introduce new characters or factual claims.`);
  }
  
  if (instructions.length === 0) {
    return '';
  }
  
  return `
ASSESSMENT-DRIVEN PERSONALIZATION:
${instructions.map((inst, i) => `${i + 1}. ${inst}`).join('\n')}
`;
}

/**
 * Build concise character context for the prompt
 */
function buildCharacterContext(profiles, selfModel) {
  const roleMap = {
    ego: selfModel.coreMappings.ego?.characterRefs?.[0],
    persona: selfModel.coreMappings.persona?.characterRefs?.[0],
    shadow: selfModel.coreMappings.shadow?.characterRefs?.[0],
    feelingFunction: selfModel.coreMappings.feelingFunction?.characterRefs?.[0],
    shadowVirtue: selfModel.coreMappings.shadowVirtue?.characterRefs?.[0],
    erosAxis: selfModel.coreMappings.erosAxis?.characterRefs?.[0],
  };
  
  return profiles.map(profile => {
    const roles = Object.entries(roleMap)
      .filter(([_, name]) => name === profile.name)
      .map(([role]) => role.toUpperCase());
    
    return `
### ${profile.name} ${roles.length ? `[${roles.join(',')}]` : ''}
Archetypes: ${profile.archetypeSignals?.primaryArchetypes?.slice(0,2).join(', ') || 'Hero'}
Wound: ${profile.narrativeArc?.wound || 'Unknown'} | Desire: ${profile.narrativeArc?.desire || 'Purpose'} | Fear: ${profile.narrativeArc?.fear || 'Failure'}
Strengths: ${profile.behavioralTraits?.strengths?.slice(0,3).join(', ') || 'Resourceful'}
Liabilities: ${profile.behavioralTraits?.liabilities?.slice(0,3).join(', ') || 'Complex'}
Ego: ${profile.jungFunctions?.egoMode || 'Adaptive'} | Shadow: ${profile.jungFunctions?.shadowPattern || 'Hidden'}`;
  }).join('\n');
}

/**
 * Validate output and fill any missing required fields
 */
function validateOutput(output, selfModel, profiles) {
  // Ensure all required top-level keys exist
  if (!output.story) output.story = {};
  if (!output.identification) output.identification = {};
  if (!output.functioning) output.functioning = {};
  if (!output.actions) output.actions = {};
  if (!output.lifeDomains) output.lifeDomains = {};
  
  // === FIX CHARACTER ASSIGNMENTS FROM COREMAPPINGS (AUTHORITATIVE SOURCE) ===
  // The LLM sometimes ignores explicit instructions about which character to use.
  // We fix this by overriding the characters array with the authoritative source.
  const roleToMappingKey = {
    ego: 'ego',
    persona: 'persona',
    shadow: 'shadow',
    shadowVirtue: 'shadowVirtue',
    feelingFunction: 'feelingFunction',
    erosAxis: 'erosAxis',
  };
  
  Object.entries(roleToMappingKey).forEach(([idKey, mappingKey]) => {
    const correctChar = selfModel?.coreMappings?.[mappingKey]?.characterRefs?.[0];
    if (correctChar && output.identification[idKey]) {
      const block = output.identification[idKey];
      const originalChars = block.characters || [];
      
      // If the correct character is not already first, fix it
      if (originalChars[0] !== correctChar) {
        console.log(`[NarrativeEngine] Fixing character mismatch in ${idKey}: "${originalChars[0]}" -> "${correctChar}"`);
        
        // Replace character name in summary and details
        if (block.summary && originalChars[0]) {
          block.summary = block.summary.replace(new RegExp(originalChars[0], 'gi'), correctChar);
        }
        if (block.details && typeof block.details === 'string' && originalChars[0]) {
          block.details = block.details.replace(new RegExp(originalChars[0], 'gi'), correctChar);
        }
        
        // Also fix the characters array - keep correct char first, filter out duplicates
        const otherChars = originalChars
          .filter(c => c.toLowerCase() !== correctChar.toLowerCase())
          .filter((c, i, arr) => arr.findIndex(x => x.toLowerCase() === c.toLowerCase()) === i); // dedupe
        block.characters = [correctChar, ...otherChars];
      }
    }
  });
  
  // Convert any object details fields to strings
  const idBlocks = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis', 'moralOrientation'];
  idBlocks.forEach(key => {
    if (output.identification[key]?.details && typeof output.identification[key].details === 'object') {
      const d = output.identification[key].details;
      const parts = [];
      Object.entries(d).forEach(([k, v]) => {
        if (v && typeof v === 'string') parts.push(`${k}: ${v}`);
        else if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`);
      });
      output.identification[key].details = parts.join('. ');
    }
  });
  
  // Convert costsAndCompensations to string if needed
  if (output.functioning?.costsAndCompensations && typeof output.functioning.costsAndCompensations === 'object') {
    const cc = output.functioning.costsAndCompensations;
    const parts = [];
    if (cc.costs?.length) {
      parts.push('Costs: ' + cc.costs.map(c => typeof c === 'string' ? c : c.cost).join(', '));
    }
    if (cc.compensators?.length) {
      parts.push('Compensators: ' + cc.compensators.map(c => typeof c === 'string' ? c : c.compensation).join(', '));
    }
    output.functioning.costsAndCompensations = parts.join('. ');
  }
  
  // Ensure life domain arrays are arrays
  const arrayFields = ['iAm', 'iTendTo', 'typicalSituations', 'watchOuts', 'toRealizePotential'];
  const domains = ['work', 'leadership', 'truth', 'intimacy', 'social', 'innerLife'];
  domains.forEach(domain => {
    if (output.lifeDomains[domain]) {
      arrayFields.forEach(field => {
        const val = output.lifeDomains[domain][field];
        if (typeof val === 'string') {
          output.lifeDomains[domain][field] = [val];
        } else if (!val) {
          output.lifeDomains[domain][field] = [];
        }
      });
    }
  });
  
  // Ensure alignment indicators exist
  if (!output.functioning.alignmentIndicators) {
    output.functioning.alignmentIndicators = { aligned: [], unaligned: [] };
  }
  if (!output.functioning.alignmentIndicators.aligned?.length) {
    output.functioning.alignmentIndicators.aligned = profiles.flatMap(p => 
      (p.behavioralTraits?.strengths || []).slice(0, 2)
    ).slice(0, 5);
  }
  if (!output.functioning.alignmentIndicators.unaligned?.length) {
    output.functioning.alignmentIndicators.unaligned = profiles.flatMap(p => 
      (p.behavioralTraits?.liabilities || []).slice(0, 2)
    ).slice(0, 5);
  }
  
  // Ensure situation blocks have titles
  if (output.actions?.situationBlocks) {
    output.actions.situationBlocks.forEach((block, i) => {
      if (!block.title) {
        block.title = `Life Scenario ${i + 1}`;
      }
    });
  }
  
  // Add empty evidence array for backward compatibility
  if (!output.identification.evidence) {
    output.identification.evidence = [];
  }
  
  return output;
}
