/**
 * Narrative Engine
 * Generates fully dynamic, mystical Jungian narratives from SelfModel + CharacterProfiles.
 * NO HARDCODING - everything is generated fresh for each user.
 */

import OpenAI from 'openai';

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
  
  // Add meta (no evidence - examples will be added by Example Engine)
  output.meta = {
    generatedAt: new Date().toISOString(),
    modelVersion: process.env.OPENAI_NARRATIVE_MODEL || 'gpt-4o',
    promptVersion: 'v2-dynamic',
    schemaVersion: 1,
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
  
  // Optimized concise system prompt
  const systemPrompt = `You are a Jungian storyteller. Create mythical, deeply personal narratives.
STYLE: Joseph Campbell + Carl Jung. Vivid imagery. Character-specific references. Poetic language.
AVOID: Generic phrases, psychology jargon, vague advice.
INCLUDE: Specific character scenes, archetypal metaphors, mythic tension.`;

  const userPrompt = `Create a complete Jungian psychological profile for someone whose inner world is mapped by these characters:

${characterContext}

SELF MODEL ANALYSIS:
- Core Wound Pattern: ${selfModel.tensions.map(t => t.recurringConflict).filter(Boolean).join('; ') || 'Exploring the depths'}
- Life Phase: ${selfModel.coreMappings.lifePhase?.characterRefs?.[0] || 'Transformation'}
- Missing Qualities: ${selfModel.individuationDirection.missingQualities.join(', ')}
- Next Chapter Theme: ${selfModel.individuationDirection.nextChapterTheme}

Generate a JSON response with this EXACT structure (all fields required):

{
  "story": {
    "mythSummary": "A 4-6 paragraph narrative that reads like a mythical origin story. Start with an evocative opening that names the Ego character. Weave in how Persona, Shadow, and other characters represent different soul aspects. Make it feel like discovering an ancient prophecy about oneself. Reference specific character moments and arcs.",
    "centralTension": "2-4 sentences describing the core inner conflict, using specific character dynamics. Example: 'Like [Character A] torn between mission and loyalty, and [Character B] hiding vulnerability beneath control, you live in the space where...'",
    "guidingSentence": "One powerful, memorable sentence that captures the essence of this person's mythic journey. Make it feel like destiny.",
    "northStarScene": "A vivid 2-3 sentence description of an imagined scene that represents their highest potential, drawing from character imagery."
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
    const parsed = JSON.parse(content);
    
    // Validate and ensure completeness
    return validateOutput(parsed, selfModel, profiles);
  } catch (error) {
    console.error('[Narrative Engine] Error:', error.message);
    throw new Error(`Failed to generate narrative: ${error.message}`);
  }
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
