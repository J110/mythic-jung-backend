/**
 * Narrative Engine
 * Renders SelfModel into user-facing content: Story, Identification, Functioning, Actions, Life Domains, Evidence
 * Based on: 04_NARRATIVE_ENGINE_SPEC.md
 * 
 * No hardcoding. Everything is generated from SelfModel + CharacterProfiles.
 */

import OpenAI from 'openai';

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Generate narrative output from SelfModel and CharacterProfiles
 * @param {SelfModel} selfModel - Synthesized self model
 * @param {CharacterProfile[]} profiles - Character profiles
 * @param {Object} options - Generation options
 * @returns {Promise<GeneratedOutput>}
 */
export async function generateNarrative(selfModel, profiles, options = {}) {
  if (!openai) {
    throw new Error('OpenAI API key required for narrative generation');
  }

  // Step A: Build outline (deterministic from SelfModel)
  const outline = buildOutline(selfModel, profiles);
  
  // Step B: Generate text (LLM structured output)
  const output = await generateTextFromOutline(outline, selfModel, profiles);
  
  // Step C: Validate and repair
  const validated = validateAndRepair(output, selfModel, profiles);
  
  // Step D: Generate evidence
  validated.identification.evidence = generateEvidence(selfModel, profiles, validated);
  
  return validated;
}

/**
 * Build outline from SelfModel (deterministic)
 */
function buildOutline(selfModel, profiles) {
  const egoProfile = findProfileByName(profiles, selfModel.coreMappings.ego?.characterRefs[0]);
  const personaProfile = findProfileByName(profiles, selfModel.coreMappings.persona?.characterRefs[0]);
  const shadowProfile = findProfileByName(profiles, selfModel.coreMappings.shadow?.characterRefs[0]);
  const feelingProfile = findProfileByName(profiles, selfModel.coreMappings.feelingFunction?.characterRefs[0]);

  return {
    story: {
      keyThemes: [
        `Ego: ${egoProfile?.name || 'Unknown'} as ${egoProfile?.archetypeSignals?.primaryArchetypes?.[0] || 'archetype'}`,
        `Persona: ${personaProfile?.name || 'Unknown'} as social adaptation`,
        `Shadow: ${shadowProfile?.name || 'Unknown'} as repressed aspects`,
        `Individuation: ${selfModel.individuationDirection.nextChapterTheme}`,
      ],
      characterSupports: {
        ego: egoProfile?.name,
        persona: personaProfile?.name,
        shadow: shadowProfile?.name,
        feeling: feelingProfile?.name,
      },
      tensions: selfModel.tensions,
    },
    identification: {
      required: ['ego', 'persona', 'shadow', 'feelingFunction'],
      optional: ['shadowVirtue', 'erosAxis', 'moralOrientation'],
      characterSupports: selfModel.coreMappings,
    },
    functioning: {
      coreTraits: extractCoreTraits(profiles, selfModel.weights.perCharacterWeight),
      tensions: selfModel.tensions,
      costsAndCompensations: selfModel.costsAndCompensations,
    },
    actions: {
      scenarios: [
        'work/power',
        'intimacy/commitment',
        'family crisis',
        'moral conflict',
      ],
      tensions: selfModel.tensions,
    },
    lifeDomains: {
      domains: ['work', 'leadership', 'truth', 'intimacy', 'social', 'innerLife'],
      characterSupports: profiles.map(p => p.name),
    },
  };
}

/**
 * Generate text from outline using LLM
 */
async function generateTextFromOutline(outline, selfModel, profiles) {
  const prompt = buildGenerationPrompt(outline, selfModel, profiles);
  
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_NARRATIVE_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a Jungian narrative expert. Generate personalized, dynamic, comprehensive, insightful, and surprising narratives based on the SelfModel and CharacterProfiles. 
          
Follow these constraints:
- No hardcoded text - everything must be specific to the provided SelfModel
- At least 6 motif/arc references (not just name spam)
- Avoid generic "balance/integration" unless tied to a named tension
- Avoid adjective-only lists
- Be mythic, profound, psychologically accurate
- No diagnosis language, no self-harm encouragement, no hate/harassment, no explicit sexual content

Generate valid JSON matching the GeneratedOutput schema.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    const content = response.choices[0].message.content.trim();
    let parsed = JSON.parse(content);
    
    // Ensure all required fields exist
    return ensureSchemaCompliance(parsed);
  } catch (error) {
    console.error('[Narrative] Error generating text:', error);
    throw new Error(`Failed to generate narrative: ${error.message}`);
  }
}

/**
 * Build generation prompt
 */
function buildGenerationPrompt(outline, selfModel, profiles) {
  const egoProfile = findProfileByName(profiles, selfModel.coreMappings.ego?.characterRefs[0]);
  const personaProfile = findProfileByName(profiles, selfModel.coreMappings.persona?.characterRefs[0]);
  const shadowProfile = findProfileByName(profiles, selfModel.coreMappings.shadow?.characterRefs[0]);
  const feelingProfile = findProfileByName(profiles, selfModel.coreMappings.feelingFunction?.characterRefs[0]);

  return `Generate a complete Jungian narrative profile based on this SelfModel:

CORE MAPPINGS:
- Ego: ${egoProfile?.name || 'Unknown'} (${egoProfile?.archetypeSignals?.primaryArchetypes?.[0] || 'archetype'})
- Persona: ${personaProfile?.name || 'Unknown'} (${personaProfile?.jungFunctions?.personaMode || 'persona mode'})
- Shadow: ${shadowProfile?.name || 'Unknown'} (${shadowProfile?.archetypeSignals?.shadowArchetypes?.[0] || 'shadow'})
- Feeling Function: ${feelingProfile?.name || 'Unknown'} (${feelingProfile?.jungFunctions?.feelingChannel || 'feeling'})

TENSIONS:
${selfModel.tensions.map(t => `- ${t.recurringConflict || t.polarityPair?.join(' vs ')}`).join('\n')}

COSTS AND COMPENSATIONS:
- Costs: ${selfModel.costsAndCompensations.costs.slice(0, 3).map(c => c.cost).join(', ')}
- Compensators: ${selfModel.costsAndCompensations.compensators.slice(0, 3).map(c => c.compensation).join(', ')}

INDIVIDUATION DIRECTION:
- Missing Qualities: ${selfModel.individuationDirection.missingQualities.join(', ')}
- Next Chapter: ${selfModel.individuationDirection.nextChapterTheme}

CHARACTER PROFILES (key details):
${profiles.map(p => `
${p.name}:
- Archetypes: ${p.archetypeSignals?.primaryArchetypes?.join(', ') || 'Unknown'}
- Wound: ${p.narrativeArc?.wound || 'Unknown'}
- Desire: ${p.narrativeArc?.desire || 'Unknown'}
- Fear: ${p.narrativeArc?.fear || 'Unknown'}
- Strengths: ${p.behavioralTraits?.strengths?.slice(0, 3).join(', ') || 'Unknown'}
- Liabilities: ${p.behavioralTraits?.liabilities?.slice(0, 3).join(', ') || 'Unknown'}
`).join('\n')}

OUTLINE:
${JSON.stringify(outline, null, 2)}

Generate complete GeneratedOutput JSON with:
- story: mythSummary (3-6 paragraphs), centralTension (1-3 sentences), guidingSentence (1 line), optional northStarScene
- identification: ego, persona, shadow, shadowVirtue, feelingFunction, optional erosAxis, moralOrientation (each with title, summary 3-6 sentences, characters, details)
- functioning: coreTraits (6-12 items), symbolicEssence (3-6 sentences), narrativeArc (1-3 paragraphs), redemptionArc (1-3 paragraphs), costsAndCompensations, alignmentIndicators (aligned vs unaligned lists)
- actions: situationBlocks (4-8 blocks, each with situation, alignedResponse 4-8 items, beWaryOf 4-8 items), guidingQuestion
- lifeDomains: work, leadership, truth, intimacy, social, innerLife (each with title, iAm, iTendTo, typicalSituations, watchOuts, toRealizePotential, selfDirection)

Make it deeply personal, dynamic, comprehensive, insightful, surprising, and action-oriented. Reference specific character arcs, motifs, and tensions.`;
}

/**
 * Validate and repair output
 */
function validateAndRepair(output, selfModel, profiles) {
  // Ensure required fields
  if (!output.story) output.story = {};
  if (!output.identification) output.identification = {};
  if (!output.functioning) output.functioning = {};
  if (!output.actions) output.actions = {};
  if (!output.lifeDomains) output.lifeDomains = {};
  if (!output.meta) output.meta = {};

  // Validate story
  if (!output.story.mythSummary || output.story.mythSummary.length < 200) {
    output.story.mythSummary = generateFallbackMythSummary(selfModel, profiles);
  }
  if (!output.story.centralTension) {
    output.story.centralTension = generateFallbackCentralTension(selfModel);
  }
  if (!output.story.guidingSentence) {
    output.story.guidingSentence = generateFallbackGuidingSentence(selfModel);
  }

  // Validate identification
  const requiredIds = ['ego', 'persona', 'shadow', 'feelingFunction'];
  requiredIds.forEach(key => {
    if (!output.identification[key]) {
      output.identification[key] = generateFallbackArchetypeBlock(key, selfModel, profiles);
    }
  });

  // Validate functioning
  if (!output.functioning.coreTraits || output.functioning.coreTraits.length < 6) {
    output.functioning.coreTraits = extractCoreTraits(profiles, selfModel.weights.perCharacterWeight);
  }

  // Validate actions
  if (!output.actions.situationBlocks || output.actions.situationBlocks.length < 4) {
    output.actions.situationBlocks = generateFallbackSituationBlocks(selfModel, profiles);
  }

  // Validate life domains
  const requiredDomains = ['work', 'leadership', 'truth', 'intimacy', 'social', 'innerLife'];
  requiredDomains.forEach(domain => {
    if (!output.lifeDomains[domain]) {
      output.lifeDomains[domain] = generateFallbackDomainBlock(domain, selfModel, profiles);
    }
  });

  // Add meta
  output.meta = {
    generatedAt: new Date().toISOString(),
    modelVersion: process.env.OPENAI_NARRATIVE_MODEL || 'gpt-4o',
    promptVersion: 'v1',
    schemaVersion: 1,
  };

  return output;
}

/**
 * Generate evidence
 */
function generateEvidence(selfModel, profiles, output) {
  const evidence = [];

  // Evidence for identification blocks
  const idBlocks = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis', 'moralOrientation'];
  idBlocks.forEach(block => {
    if (output.identification[block]) {
      const mapping = selfModel.coreMappings[block] || selfModel.coreMappings[block === 'moralOrientation' ? 'truthOrientation' : block];
      if (mapping) {
        evidence.push({
          targetPath: `identification.${block}`,
          characterRefs: mapping.characterRefs || [],
          assessmentRefs: mapping.rationaleSignals?.assessmentRefs || [],
        });
      }
    }
  });

  // Evidence for functioning sections
  if (output.functioning.costsAndCompensations) {
    evidence.push({
      targetPath: 'functioning.costsAndCompensations',
      characterRefs: selfModel.costsAndCompensations.costs.map(c => c.characterRef).filter(Boolean),
      assessmentRefs: [],
    });
  }

  // Evidence for life domains
  const domains = ['work', 'leadership', 'truth', 'intimacy', 'social', 'innerLife'];
  domains.forEach(domain => {
    if (output.lifeDomains[domain]) {
      evidence.push({
        targetPath: `lifeDomains.${domain}`,
        characterRefs: profiles.map(p => p.name),
        assessmentRefs: [],
      });
    }
  });

  return evidence;
}

// Helper functions
function findProfileByName(profiles, name) {
  if (!name) return null;
  return profiles.find(p => p.name === name || p.canonicalId === name) || null;
}

function extractCoreTraits(profiles, weights) {
  const traits = [];
  profiles.forEach((profile, index) => {
    const weight = weights[index];
    const strengths = profile.behavioralTraits?.strengths || [];
    strengths.slice(0, Math.ceil(weight * 3)).forEach(strength => {
      if (!traits.includes(strength)) {
        traits.push(strength);
      }
    });
  });
  return traits.length >= 6 ? traits.slice(0, 12) : [...traits, ...Array(6 - traits.length).fill('Trait to be discovered')];
}

function ensureSchemaCompliance(output) {
  // Ensure all required top-level keys exist
  const required = ['story', 'identification', 'functioning', 'actions', 'lifeDomains'];
  required.forEach(key => {
    if (!output[key]) {
      output[key] = {};
    }
  });
  return output;
}

// Fallback generators (used if LLM output is incomplete)
function generateFallbackMythSummary(selfModel, profiles) {
  const ego = selfModel.coreMappings.ego?.characterRefs[0] || 'Your ego';
  const shadow = selfModel.coreMappings.shadow?.characterRefs[0] || 'Your shadow';
  return `In the depths of the collective unconscious, your personal myth begins to take shape. ${ego} stands at the threshold of consciousness, representing your ego—the center of your conscious identity. Yet in the depths of the unconscious, ${shadow} dwells—your shadow, holding what you have repressed. This is your individuation journey—the process of becoming whole by integrating all aspects of yourself.`;
}

function generateFallbackCentralTension(selfModel) {
  const tensions = selfModel.tensions;
  if (tensions.length > 0) {
    return tensions[0].recurringConflict || 'The tension between conscious and unconscious aspects creates the central dynamic of your psychological journey.';
  }
  return 'The tension between ego and shadow creates the central dynamic of your psychological journey.';
}

function generateFallbackGuidingSentence(selfModel) {
  return `Let your ego guide your conscious choices while allowing your shadow's wisdom to emerge from the depths, moving toward wholeness through individuation.`;
}

function generateFallbackArchetypeBlock(key, selfModel, profiles) {
  const mapping = selfModel.coreMappings[key];
  const characterName = mapping?.characterRefs[0] || 'Unknown';
  const profile = findProfileByName(profiles, characterName);
  
  return {
    title: `${key.charAt(0).toUpperCase() + key.slice(1)} — ${characterName}`,
    summary: `${characterName} represents your ${key} in the Jungian framework.`,
    characters: [characterName],
    details: profile?.jungFunctions?.[key] || `Details about ${characterName} as ${key}.`,
  };
}

function generateFallbackSituationBlocks(selfModel, profiles) {
  return [
    {
      title: 'Facing the Shadow',
      situation: 'When confronted with situations that trigger your shadow, you face the essential work of shadow integration.',
      alignedResponse: ['Acknowledge shadow presence', 'Explore what it teaches', 'Integrate shadow wisdom'],
      beWaryOf: ['Complete rejection of shadow', 'Over-identification with persona'],
    },
    {
      title: 'Individuation Process',
      situation: 'The integration of ego and shadow represents the individuation process—becoming whole.',
      alignedResponse: ['Recognize ego and shadow as parts of whole', 'Engage in individuation process', 'Embrace wholeness'],
      beWaryOf: ['Forcing integration too quickly', 'Seeking perfection instead of wholeness'],
    },
  ];
}

function generateFallbackDomainBlock(domain, selfModel, profiles) {
  return {
    title: domain.charAt(0).toUpperCase() + domain.slice(1),
    iAm: [`Navigator of ${domain}`],
    iTendTo: [`Seek ${domain} that aligns with your values`],
    typicalSituations: [`${domain} challenges`, `${domain} opportunities`],
    watchOuts: [`Avoiding ${domain}`, `Over-identifying with ${domain}`],
    toRealizePotential: [`Find ${domain} that aligns with your archetype`, `Integrate shadow gifts into ${domain}`],
    selfDirection: `Engage in ${domain} from your authentic self.`,
  };
}
