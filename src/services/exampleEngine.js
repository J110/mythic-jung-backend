/**
 * Example Engine
 * Generates concrete examples from characters' real works (films/series/books/events)
 * that support and illustrate the narrative vision.
 * 
 * Runs AFTER Narrative Engine to align examples with generated insights.
 * Examples MUST match the characters and themes mentioned in each specific section.
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
 * Generate examples for the entire output
 * @param {Object} narrativeOutput - The generated narrative from Narrative Engine
 * @param {Array} profiles - Character profiles from Discovery Engine
 * @param {Object} selfModel - The synthesized self model
 */
export async function generateExamples(narrativeOutput, profiles, selfModel) {
  console.log('[Example Engine] Starting example generation...');
  
  const client = getOpenAIClient();
  if (!client) {
    console.warn('[Example Engine] No OpenAI client - returning empty examples');
    return createEmptyExamples();
  }

  try {
    // Extract all character and narrative mappings (including v2 dynamics)
    const mappings = extractAllMappings(narrativeOutput, selfModel);
    console.log('[Example Engine] Extracted mappings for all sections');
    
    // Check for identification_v2 dynamics
    const hasV2 = !!narrativeOutput.identification_v2;
    if (hasV2) {
      console.log('[Example Engine] Found identification_v2 - extracting orbit/compensation contexts');
      mappings.identificationV2 = extractV2Mappings(narrativeOutput.identification_v2, selfModel);
    }
    
    // === NEW: Extract assessment signals for example prioritization ===
    const assessmentState = selfModel.assessmentState || {};
    const assessmentPriorities = {
      dominantNow: assessmentState.dominantNow || [],
      erosNeedNow: assessmentState.erosNeedNow || [],
      riskEdgesNow: assessmentState.riskEdgesNow || [],
      contextTriggers: assessmentState.contextTriggers || [],
    };
    mappings.assessmentPriorities = assessmentPriorities;
    
    if (assessmentPriorities.dominantNow.length > 0) {
      console.log('[Example Engine] Assessment priorities - dominant:', assessmentPriorities.dominantNow.join(', '));
    }
    
    const examples = await generateAllExamplesWithAI(narrativeOutput, profiles, selfModel, mappings, client);
    
    // === NEW: Ensure assessment-aligned examples are included ===
    const enhancedExamples = ensureAssessmentAlignedExamples(examples, assessmentPriorities, profiles);
    
    console.log('[Example Engine] Generated examples successfully');
    return enhancedExamples;
  } catch (error) {
    console.error('[Example Engine] Error:', error.message);
    return createEmptyExamples();
  }
}

/**
 * Ensure assessment-aligned examples are prioritized
 * Guarantees at least 1 example from dominant/eros/risk characters where applicable
 */
function ensureAssessmentAlignedExamples(examples, priorities, profiles) {
  // Story: At least 1 example from dominantNow character (if answered)
  if (priorities.dominantNow.length > 0 && examples.story) {
    const dominantChar = priorities.dominantNow[0];
    const storyKeys = ['mythSummary', 'centralTension', 'guidingSentence', 'northStarScene', 'currentChapter'];
    
    storyKeys.forEach(key => {
      if (examples.story[key]?.length > 0) {
        // Check if dominant character is already represented
        const hasDominant = examples.story[key].some(ex => 
          characterMatches(ex.characterName, dominantChar)
        );
        
        if (!hasDominant) {
          // Move any dominant character example to front
          const allStoryExamples = storyKeys.flatMap(k => examples.story[k] || []);
          const dominantExample = allStoryExamples.find(ex => 
            characterMatches(ex.characterName, dominantChar)
          );
          if (dominantExample) {
            examples.story[key].unshift({
              ...dominantExample,
              assessmentAligned: true,
              alignmentReason: 'Current psychic energy (LC)',
            });
          }
        }
      }
    });
  }
  
  // Intimacy domain: At least 1 example from erosNeedNow character (if answered)
  if (priorities.erosNeedNow.length > 0 && examples.lifeDomains?.intimacy) {
    const erosChar = priorities.erosNeedNow[0];
    const hasEros = examples.lifeDomains.intimacy.some(ex => 
      characterMatches(ex.characterName, erosChar)
    );
    
    if (!hasEros) {
      // Find any example from this character in other domains
      const allDomainExamples = Object.values(examples.lifeDomains || {}).flat();
      const erosExample = allDomainExamples.find(ex => 
        characterMatches(ex.characterName, erosChar)
      );
      if (erosExample) {
        examples.lifeDomains.intimacy.unshift({
          ...erosExample,
          assessmentAligned: true,
          alignmentReason: 'Intimacy/connection need (FF)',
        });
      }
    }
  }
  
  // Actions: At least 1 warning example from riskEdgesNow character (if answered)
  if (priorities.riskEdgesNow.length > 0 && examples.actions?.length > 0) {
    const riskChar = priorities.riskEdgesNow[0];
    const hasRisk = examples.actions.some(ex => 
      characterMatches(ex.characterName, riskChar)
    );
    
    if (!hasRisk) {
      // Find any example from this character
      const allExamples = [
        ...Object.values(examples.identification || {}).flat(),
        ...Object.values(examples.functioning || {}).flat(),
      ];
      const riskExample = allExamples.find(ex => 
        characterMatches(ex.characterName, riskChar)
      );
      if (riskExample) {
        examples.actions.unshift({
          ...riskExample,
          assessmentAligned: true,
          alignmentReason: 'Shadow risk edge (SP)',
        });
      }
    }
  }
  
  return examples;
}

/**
 * Extract mappings from identification_v2 (Center/Orbit/Compensation)
 */
function extractV2Mappings(v2, selfModel) {
  const mappings = {};
  const archetypes = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis'];
  
  archetypes.forEach(archetype => {
    const dynamics = v2[archetype];
    if (!dynamics) return;
    
    mappings[archetype] = {
      center: {
        characters: dynamics.center?.characters || [],
        summary: dynamics.center?.summary?.substring(0, 150) || '',
      },
      orbit: (dynamics.orbit || []).map(o => ({
        trigger: o.trigger?.name || '',
        characters: o.characters || [],
        pattern: o.pattern?.substring(0, 100) || '',
      })),
      compensations: (dynamics.compensations || []).map(c => ({
        name: c.name || '',
        characters: c.characters || [],
        expression: c.expression?.slice(0, 2) || [],
      })),
    };
  });
  
  return mappings;
}

/**
 * Extract character and theme mappings from ALL narrative sections
 */
function extractAllMappings(narrativeOutput, selfModel) {
  const mappings = {
    // Identification section character mappings
    identification: {},
    // Story section themes
    story: {},
    // Actions situation themes
    actions: [],
    // Life domains themes
    lifeDomains: {},
    // Functioning themes
    functioning: {},
  };
  
  // === IDENTIFICATION MAPPINGS ===
  const identification = narrativeOutput.identification || {};
  const idSections = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis'];
  
  idSections.forEach(section => {
    // Get character from narrative (most accurate)
    if (identification[section]?.characters?.length > 0) {
      mappings.identification[section] = {
        character: identification[section].characters[0],
        theme: identification[section].summary?.substring(0, 200) || '',
        title: identification[section].title || '',
      };
    } else if (selfModel?.coreMappings?.[section]?.characterRefs?.length > 0) {
      mappings.identification[section] = {
        character: selfModel.coreMappings[section].characterRefs[0],
        theme: identification[section]?.summary?.substring(0, 200) || '',
        title: identification[section]?.title || '',
      };
    }
    
    // Also try to extract character from title
    if (identification[section]?.title) {
      const match = identification[section].title.match(/–\s*(?:Embodied by|Worn Like|Hidden in|Glimpsed in|Expressed Through|Seeking Like)?\s*(.+?)(?:\s*$)/i);
      if (match && match[1]) {
        mappings.identification[section] = {
          ...mappings.identification[section],
          character: match[1].trim(),
        };
      }
    }
  });
  
  // === STORY MAPPINGS ===
  const story = narrativeOutput.story || {};
  mappings.story = {
    mythSummary: {
      theme: 'mythic origin story',
      content: story.mythSummary?.substring(0, 300) || '',
    },
    centralTension: {
      theme: 'inner conflict and opposing forces',
      content: story.centralTension || '',
    },
    guidingSentence: {
      theme: 'core life purpose and destiny',
      content: story.guidingSentence || '',
    },
    northStarScene: {
      theme: 'vision of highest potential',
      content: story.northStarScene || '',
    },
    currentChapter: {
      theme: 'present journey and current phase',
      content: story.currentChapter?.substring(0, 300) || '',
    },
  };
  
  // === ACTIONS MAPPINGS ===
  const actions = narrativeOutput.actions || {};
  if (actions.situationBlocks?.length) {
    mappings.actions = actions.situationBlocks.map((block, i) => ({
      title: block.title || `Situation ${i + 1}`,
      situation: block.situation || '',
      theme: block.alignedResponse?.slice(0, 2).join('; ') || '',
    }));
  }
  
  // === LIFE DOMAINS MAPPINGS ===
  const domains = narrativeOutput.lifeDomains || {};
  const domainKeys = ['work', 'leadership', 'truth', 'intimacy', 'social', 'innerLife'];
  domainKeys.forEach(key => {
    if (domains[key]) {
      mappings.lifeDomains[key] = {
        title: domains[key].title || key,
        theme: domains[key].selfDirection || '',
        iAm: domains[key].iAm?.slice(0, 2).join('; ') || '',
      };
    }
  });
  
  // === FUNCTIONING MAPPINGS ===
  const functioning = narrativeOutput.functioning || {};
  mappings.functioning = {
    coreTraits: {
      theme: 'character traits and defining qualities',
      content: functioning.coreTraits?.slice(0, 4).join(', ') || '',
    },
    symbolicEssence: {
      theme: 'mythic and symbolic identity',
      content: functioning.symbolicEssence?.substring(0, 200) || '',
    },
    narrativeArc: {
      theme: 'life journey and transformation',
      content: functioning.narrativeArc?.substring(0, 200) || '',
    },
    redemptionArc: {
      theme: 'path to wholeness and healing',
      content: functioning.redemptionArc?.substring(0, 200) || '',
    },
    costsAndCompensations: {
      theme: 'psychological costs and coping strategies',
      content: typeof functioning.costsAndCompensations === 'string' 
        ? functioning.costsAndCompensations.substring(0, 200) 
        : '',
    },
    alignmentIndicators: {
      theme: 'signs of authentic living vs misalignment',
      aligned: functioning.alignmentIndicators?.aligned?.slice(0, 3) || [],
      unaligned: functioning.alignmentIndicators?.unaligned?.slice(0, 3) || [],
    },
  };
  
  return mappings;
}

/**
 * Create empty examples structure
 */
function createEmptyExamples() {
  return {
    story: {
      mythSummary: [],
      centralTension: [],
      guidingSentence: [],
      northStarScene: [],
      currentChapter: [],
    },
    identification: {
      ego: [],
      persona: [],
      shadow: [],
      shadowVirtue: [],
      feelingFunction: [],
      erosAxis: [],
    },
    functioning: {
      coreTraits: [],
      symbolicEssence: [],
      narrativeArc: [],
      redemptionArc: [],
      costsAndCompensations: [],
      alignmentIndicators: [],
    },
    actions: [],
    lifeDomains: {
      work: [],
      leadership: [],
      truth: [],
      intimacy: [],
      social: [],
      innerLife: [],
    },
  };
}

/**
 * Generate all examples using AI with proper narrative alignment
 */
async function generateAllExamplesWithAI(narrativeOutput, profiles, selfModel, mappings, client) {
  const characterNames = profiles.map(p => p.name).join(', ');
  
  // Build detailed context for each section
  const prompt = buildComprehensivePrompt(profiles, mappings, characterNames);

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_EXAMPLE_MODEL || 'gpt-4o-mini', // Use faster model for examples
    messages: [
      {
        role: 'system',
        content: `You are a film/TV/book expert. Generate REAL examples from characters' actual works.
RULES: 1) Use ONLY assigned character per section 2) Examples must match section theme 3) ONLY real scenes 4) No invented content.
Respond with valid JSON only.`,
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 5000, // Reduced for speed
  });

  const content = response.choices[0].message.content.trim();
  const parsed = safeParseJSON(content, 'ExampleEngine.generateAllExamples');
  
  return validateAndStructureExamples(parsed, mappings);
}

/**
 * Build concise prompt for faster processing
 */
function buildComprehensivePrompt(profiles, mappings, characterNames) {
  // Build compact character-to-section mapping for identification
  const idMap = Object.entries(mappings.identification)
    .filter(([_, v]) => v?.character)
    .map(([k, v]) => `${k}:${v.character}`)
    .join(', ');

  // Build compact action list
  const actionList = mappings.actions
    .map((a, i) => `${i+1}."${a.title?.substring(0, 40) || 'Situation'}"`)
    .join(', ');

  // Build V2 context if available (for orbit/compensation examples)
  let v2Context = '';
  if (mappings.identificationV2) {
    const v2Lines = [];
    Object.entries(mappings.identificationV2).forEach(([archetype, data]) => {
      if (data.orbit?.length) {
        v2Lines.push(`${archetype} ORBIT shifts: ${data.orbit.map(o => `"${o.trigger}" -> ${o.characters.join(',')}`).join('; ')}`);
      }
      if (data.compensations?.length) {
        v2Lines.push(`${archetype} COMPENSATIONS: ${data.compensations.map(c => `"${c.name}" via ${c.characters.join(',')}`).join('; ')}`);
      }
    });
    if (v2Lines.length) {
      v2Context = `\n\nIDENTIFICATION V2 DYNAMICS (use these for richer examples):\n${v2Lines.join('\n')}`;
    }
  }
  
  // === NEW: Build assessment priority context ===
  let assessmentContext = '';
  if (mappings.assessmentPriorities) {
    const priorities = mappings.assessmentPriorities;
    const priorityLines = [];
    
    if (priorities.dominantNow?.length > 0) {
      priorityLines.push(`PRIORITY - Current Energy (must have examples in Story): ${priorities.dominantNow.join(', ')}`);
    }
    if (priorities.erosNeedNow?.length > 0) {
      priorityLines.push(`PRIORITY - Intimacy Need (must have example in intimacy domain): ${priorities.erosNeedNow.join(', ')}`);
    }
    if (priorities.riskEdgesNow?.length > 0) {
      priorityLines.push(`PRIORITY - Shadow Risk (must have warning example in Actions): ${priorities.riskEdgesNow.join(', ')}`);
    }
    
    if (priorityLines.length > 0) {
      assessmentContext = `\n\nASSESSMENT-DRIVEN PRIORITIES:\n${priorityLines.join('\n')}`;
    }
  }

  return `Characters: ${characterNames}

IDENTIFICATION CHARACTER ASSIGNMENTS: ${idMap}${v2Context}${assessmentContext}

Generate JSON with real film/TV/book examples:
{
  "story": {
    "mythSummary": [2 examples about identity/origin],
    "centralTension": [2 examples about conflict],
    "guidingSentence": [1 example about purpose],
    "northStarScene": [1 example about potential],
    "currentChapter": [1 example about present transition]
  },
  "identification": {
    "ego": [{"characterName":"${mappings.identification.ego?.character || ''}", "reference":{"title":"","year":"","medium":"film"}, "situation":"", "actions":[""], "outcomeAndCost":[""], "tier":"A"}],
    "persona": [use ${mappings.identification.persona?.character || 'persona char'} ONLY],
    "shadow": [use ${mappings.identification.shadow?.character || 'shadow char'} ONLY],
    "shadowVirtue": [use ${mappings.identification.shadowVirtue?.character || 'virtue char'} ONLY],
    "feelingFunction": [use ${mappings.identification.feelingFunction?.character || 'feeling char'} ONLY],
    "erosAxis": [use ${mappings.identification.erosAxis?.character || 'eros char'} ONLY]
  },
  "functioning": {
    "coreTraits": [1-2 trait examples],
    "symbolicEssence": [1 mythic example],
    "narrativeArc": [1 transformation example],
    "redemptionArc": [1 redemption example],
    "costsAndCompensations": [1 cost example],
    "alignmentIndicators": [1 alignment example]
  },
  "actions": [${actionList.length} examples matching: ${actionList}],
  "lifeDomains": {
    "work": [1-2 career examples],
    "leadership": [1-2 authority examples],
    "truth": [1 integrity example],
    "intimacy": [1-2 relationship examples],
    "social": [1 friendship example],
    "innerLife": [1 introspection example]
  }
}

RULES: Use ONLY real scenes. Each identification section uses ONLY its assigned character. Each example needs: characterName, reference{title,year,medium}, situation, actions[], outcomeAndCost[], tier:"A".`;
}

/**
 * Validate and structure examples, ensuring character alignment
 */
function validateAndStructureExamples(parsed, mappings) {
  const result = createEmptyExamples();
  
  // === STORY EXAMPLES ===
  if (parsed.story) {
    const storyKeys = ['mythSummary', 'centralTension', 'guidingSentence', 'northStarScene', 'currentChapter'];
    storyKeys.forEach(key => {
      if (Array.isArray(parsed.story[key])) {
        result.story[key] = parsed.story[key].filter(isValidExample);
      } else if (Array.isArray(parsed.story)) {
        // Old format - distribute across sections
        const perSection = Math.ceil(parsed.story.length / 4);
        const idx = storyKeys.indexOf(key);
        result.story[key] = parsed.story.slice(idx * perSection, (idx + 1) * perSection).filter(isValidExample);
      }
    });
  }
  
  // === IDENTIFICATION EXAMPLES - Validate character matching ===
  if (parsed.identification) {
    const idKeys = ['ego', 'persona', 'shadow', 'shadowVirtue', 'feelingFunction', 'erosAxis'];
    idKeys.forEach(key => {
      if (Array.isArray(parsed.identification[key])) {
        const expectedChar = mappings.identification[key]?.character;
        result.identification[key] = parsed.identification[key]
          .filter(ex => {
            if (!isValidExample(ex)) return false;
            if (expectedChar) {
              const charMatch = characterMatches(ex.characterName, expectedChar);
              if (!charMatch) {
                console.warn(`[Example Engine] ${key}: Expected ${expectedChar}, got ${ex.characterName} - filtering out`);
                return false;
              }
            }
            return true;
          });
      }
    });
  }
  
  // === FUNCTIONING EXAMPLES ===
  if (parsed.functioning) {
    if (typeof parsed.functioning === 'object' && !Array.isArray(parsed.functioning)) {
      const funcKeys = ['coreTraits', 'symbolicEssence', 'narrativeArc', 'redemptionArc', 'costsAndCompensations', 'alignmentIndicators'];
      funcKeys.forEach(key => {
        if (Array.isArray(parsed.functioning[key])) {
          result.functioning[key] = parsed.functioning[key].filter(isValidExample);
        }
      });
    } else if (Array.isArray(parsed.functioning)) {
      // Distribute flat array across subsections
      const validExamples = parsed.functioning.filter(isValidExample);
      const perSection = Math.max(1, Math.ceil(validExamples.length / 6));
      let idx = 0;
      ['coreTraits', 'symbolicEssence', 'narrativeArc', 'redemptionArc', 'costsAndCompensations', 'alignmentIndicators'].forEach(key => {
        result.functioning[key] = validExamples.slice(idx, idx + perSection);
        idx += perSection;
      });
    }
  }
  
  // === ACTIONS EXAMPLES ===
  if (Array.isArray(parsed.actions)) {
    result.actions = parsed.actions.filter(isValidExample);
  }
  
  // === LIFE DOMAINS EXAMPLES ===
  if (parsed.lifeDomains) {
    const domainKeys = ['work', 'leadership', 'truth', 'intimacy', 'social', 'innerLife'];
    domainKeys.forEach(key => {
      if (Array.isArray(parsed.lifeDomains[key])) {
        result.lifeDomains[key] = parsed.lifeDomains[key].filter(isValidExample);
      }
    });
  }
  
  return result;
}

/**
 * Check if character names match (fuzzy matching)
 */
function characterMatches(actual, expected) {
  if (!actual || !expected) return true; // No expected = allow any
  const actualLower = actual.toLowerCase().trim();
  const expectedLower = expected.toLowerCase().trim();
  
  // Exact match
  if (actualLower === expectedLower) return true;
  
  // Partial match (one contains the other)
  if (actualLower.includes(expectedLower) || expectedLower.includes(actualLower)) return true;
  
  // First name match
  const actualFirst = actualLower.split(' ')[0];
  const expectedFirst = expectedLower.split(' ')[0];
  if (actualFirst === expectedFirst && actualFirst.length > 2) return true;
  
  // Last name match
  const actualParts = actualLower.split(' ');
  const expectedParts = expectedLower.split(' ');
  if (actualParts.length > 1 && expectedParts.length > 1) {
    if (actualParts[actualParts.length - 1] === expectedParts[expectedParts.length - 1]) return true;
  }
  
  return false;
}

/**
 * Check if an example is valid and normalize types
 */
function isValidExample(ex) {
  if (!ex || typeof ex !== 'object') return false;
  if (!ex.characterName) return false;
  if (!ex.reference || !ex.reference.title) return false;
  if (!ex.situation) return false;
  if (!Array.isArray(ex.actions) || ex.actions.length === 0) return false;
  if (!Array.isArray(ex.outcomeAndCost) || ex.outcomeAndCost.length === 0) return false;
  
  // Ensure year is always a string (AI sometimes returns int like 2012)
  if (ex.reference.year !== undefined) {
    ex.reference.year = String(ex.reference.year);
  }
  
  return true;
}
