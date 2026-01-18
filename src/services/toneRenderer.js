/**
 * Tone Renderer Service
 * 
 * Transforms canonical narrative into tone-specific rendered output.
 * 
 * THREE NARRATIVE TONES:
 * - MINIMAL: Action-oriented, no story form, characters only in Psyche & Examples
 * - MODERN: Contemporary language, story form with recognized characters
 * - MYTHICAL: Magical/fairy-tale style with recognized characters, accessible language
 */

import OpenAI from 'openai';

// Supported tones - simplified to 3 distinct styles
export const NarrativeTone = {
  MINIMAL: 'MINIMAL',
  MODERN: 'MODERN',
  MYTHICAL: 'MYTHICAL',
};

// Default tone
export const DEFAULT_TONE = NarrativeTone.MODERN;

// Tone style instructions - dramatically different outputs
const TONE_INSTRUCTIONS = {
  [NarrativeTone.MINIMAL]: `TONE: MINIMAL (Direct & Action-Oriented)
Style requirements:
- ZERO storytelling or narrative form
- SHORT, direct sentences. Maximum 15 words per sentence.
- Focus on ACTIONS and INSIGHTS only
- Use bullet points and numbered lists wherever possible
- DO NOT mention characters except in:
  * Psyche/Identity identification sections (who represents what)
  * Specific examples where characters illustrate a point
- NO metaphors, NO poetic language, NO symbolic imagery
- Write like a practical guide or executive summary
- Structure: "What it means:", "What to do:", "Watch out for:"
- Think: actionable checklist, not a story`,

  [NarrativeTone.MODERN]: `TONE: MODERN (Contemporary Story)
Style requirements:
- Write in a STORY FORM using contemporary, relatable language
- WEAVE the user's recognized characters throughout the narrative
- Reference characters by name: "Like [Character Name], you..."
- Use modern, everyday language - no archaic or overly formal terms
- Create a coherent personal narrative arc
- Include character comparisons: "Your inner [Character] emerges when..."
- Conversational but meaningful tone
- Structure insights as discoveries in the user's personal story
- Think: a thoughtful friend explaining your patterns through your favorite characters`,

  [NarrativeTone.MYTHICAL]: `TONE: MYTHICAL (Enchanting & Epic)
Style requirements:
- Write like a FAIRY TALE or EPIC MYTH
- Use MAGICAL, enchanting language but keep it ACCESSIBLE (no obscure words)
- Transform the user's journey into a quest or adventure
- Characters become heroes, guides, and shadows in the story
- Use phrases like: "Once upon a time...", "In the kingdom of your soul...", "The hero within you..."
- Create a sense of WONDER and DESTINY
- Include magical imagery: quests, enchanted forests, hidden treasures, wise guides
- Make patterns feel like ancient prophecies being revealed
- IMPORTANT: Keep language simple enough for anyone to understand
- Avoid: complex vocabulary, Jungian jargon, academic terms
- Think: Disney meets Joseph Campbell - magical but accessible`,
};

// Human-friendly tone labels
export const TONE_LABELS = {
  [NarrativeTone.MINIMAL]: 'Minimal',
  [NarrativeTone.MODERN]: 'Modern',
  [NarrativeTone.MYTHICAL]: 'Mythical',
};

// Tone descriptions for UI
export const TONE_DESCRIPTIONS = {
  [NarrativeTone.MINIMAL]: 'Clean, action-oriented insights without storytelling. Characters appear only in identification and examples.',
  [NarrativeTone.MODERN]: 'Contemporary narrative weaving your characters into a meaningful personal story.',
  [NarrativeTone.MYTHICAL]: 'Enchanting, fairy-tale style narrative bringing your characters to life in an epic journey.',
};

// Legacy tone mapping for backward compatibility
const LEGACY_TONE_MAP = {
  'PLAIN': NarrativeTone.MINIMAL,
  'PRACTICAL': NarrativeTone.MINIMAL,
  'ANALYTICAL': NarrativeTone.MINIMAL,
  'REFLECTIVE': NarrativeTone.MODERN,
  'MYTHIC': NarrativeTone.MYTHICAL,
};

/**
 * Normalize tone value (handles legacy tones)
 */
export function normalizeTone(tone) {
  if (!tone) return DEFAULT_TONE;
  const upper = tone.toUpperCase();
  
  // Check if it's a new tone
  if (Object.values(NarrativeTone).includes(upper)) {
    return upper;
  }
  
  // Map legacy tone
  if (LEGACY_TONE_MAP[upper]) {
    return LEGACY_TONE_MAP[upper];
  }
  
  return DEFAULT_TONE;
}

/**
 * Extract canonical narrative from generated output
 */
export function extractCanonicalNarrative(output, context = 'ME') {
  if (!output) return null;

  if (context === 'ME') {
    return {
      coreInsights: extractInsights(output),
      tensions: extractTensions(output),
      surpriseInsights: extractSurprises(output),
      examples: extractExamples(output),
      actions: extractActions(output),
      warnings: extractWarnings(output),
      characters: extractCharacters(output),
      fullOutput: output,
    };
  } else if (context === 'RELATIONSHIP') {
    return {
      coreInsights: extractRelationshipInsights(output),
      tensions: extractRelationshipTensions(output),
      surpriseInsights: [],
      examples: output.examples || [],
      actions: extractRelationshipActions(output),
      warnings: extractRelationshipWarnings(output),
      fullOutput: output,
    };
  }

  return { fullOutput: output };
}

// Helper: Extract characters for narrative weaving
function extractCharacters(output) {
  const characters = [];
  
  if (output.identification_v2?.center?.character) {
    characters.push({
      name: output.identification_v2.center.character,
      role: 'ego',
    });
  }
  
  if (output.identification_v2?.orbit) {
    output.identification_v2.orbit.forEach(o => {
      characters.push({
        name: o.character,
        role: o.role,
      });
    });
  }
  
  return characters;
}

// Helper: Extract core insights from Me output
function extractInsights(output) {
  const insights = [];
  
  if (output.story?.summary) insights.push(output.story.summary);
  if (output.identification_v2?.center?.character) {
    insights.push(`Core identification: ${output.identification_v2.center.character}`);
  }
  if (output.functioning?.strengths) {
    output.functioning.strengths.forEach(s => insights.push(s));
  }
  
  return insights;
}

// Helper: Extract tensions
function extractTensions(output) {
  const tensions = [];
  
  if (output.identification_v2?.orbit) {
    output.identification_v2.orbit.forEach(o => {
      if (o.role === 'shadow' || o.role === 'anima' || o.role === 'animus') {
        tensions.push(`${o.role}: ${o.character}`);
      }
    });
  }
  if (output.functioning?.tensions) {
    output.functioning.tensions.forEach(t => tensions.push(t));
  }
  
  return tensions;
}

// Helper: Extract surprises
function extractSurprises(output) {
  const surprises = [];
  
  if (output.story?.unexpected) surprises.push(output.story.unexpected);
  if (output.functioning?.blindSpots) {
    output.functioning.blindSpots.forEach(b => surprises.push(b));
  }
  
  return surprises;
}

// Helper: Extract examples
function extractExamples(output) {
  const examples = [];
  
  ['story', 'identification', 'functioning', 'actions', 'lifeDomains'].forEach(section => {
    if (output[section]?.examples) {
      output[section].examples.forEach(ex => examples.push(ex));
    }
  });
  
  return examples;
}

// Helper: Extract actions
function extractActions(output) {
  const actions = [];
  
  if (output.actions?.practices) {
    output.actions.practices.forEach(p => actions.push(p));
  }
  if (output.actions?.integrationSteps) {
    output.actions.integrationSteps.forEach(s => actions.push(s));
  }
  
  return actions;
}

// Helper: Extract warnings
function extractWarnings(output) {
  const warnings = [];
  
  if (output.functioning?.triggers) {
    output.functioning.triggers.forEach(t => warnings.push(t));
  }
  if (output.actions?.avoid) {
    output.actions.avoid.forEach(a => warnings.push(a));
  }
  
  return warnings;
}

// Relationship-specific extractors
function extractRelationshipInsights(output) {
  const insights = [];
  if (output.myth?.summary) insights.push(output.myth.summary);
  if (output.narrative?.relationalField?.summary) insights.push(output.narrative.relationalField.summary);
  return insights;
}

function extractRelationshipTensions(output) {
  const tensions = [];
  if (output.narrative?.projectionShadow?.summary) tensions.push(output.narrative.projectionShadow.summary);
  if (output.ruptureLoops?.loops) {
    output.ruptureLoops.loops.forEach(l => tensions.push(l.name));
  }
  return tensions;
}

function extractRelationshipActions(output) {
  const actions = [];
  if (output.narrative?.growthPath?.story) actions.push(output.narrative.growthPath.story);
  if (output.narrative?.nextSteps) {
    output.narrative.nextSteps.forEach(s => actions.push(s.guidance));
  }
  return actions;
}

function extractRelationshipWarnings(output) {
  const warnings = [];
  if (output.narrative?.redFlagsRepair?.summary) warnings.push(output.narrative.redFlagsRepair.summary);
  return warnings;
}

/**
 * Render a specific section in the requested tone
 */
export async function renderSection(canonicalNarrative, tone, context, section) {
  if (!canonicalNarrative?.fullOutput) {
    console.warn('[ToneRenderer] No canonical narrative provided');
    return null;
  }

  // Normalize tone (handles legacy values)
  tone = normalizeTone(tone);

  // If MINIMAL, apply minimal transformation (strip narrative, keep structure)
  if (tone === NarrativeTone.MINIMAL) {
    return transformToMinimal(canonicalNarrative.fullOutput[section], section);
  }

  const sectionContent = canonicalNarrative.fullOutput[section];
  if (!sectionContent) {
    return null;
  }

  try {
    const rendered = await transformToTone(
      sectionContent, 
      tone, 
      context, 
      section,
      canonicalNarrative.characters || []
    );
    return rendered;
  } catch (error) {
    console.error(`[ToneRenderer] Failed to render ${section} in ${tone} tone:`, error);
    return sectionContent;
  }
}

/**
 * Transform content to MINIMAL tone (no LLM needed - structural transformation)
 */
function transformToMinimal(content, section) {
  if (!content) return content;
  
  // For minimal tone, we strip narrative elements but keep the structure
  // This is a lightweight transformation that doesn't need LLM
  if (typeof content === 'object') {
    const minimal = { ...content };
    
    // Remove narrative-heavy fields, keep actionable content
    if (minimal.narrative) delete minimal.narrative;
    if (minimal.story && typeof minimal.story === 'string') {
      // Convert story to bullet points
      minimal.keyPoints = minimal.story.split('. ').filter(s => s.length > 10);
      delete minimal.story;
    }
    
    return minimal;
  }
  
  return content;
}

/**
 * Render entire output in requested tone
 */
export async function renderFullOutput(canonicalNarrative, tone, context) {
  if (!canonicalNarrative?.fullOutput) {
    return null;
  }

  tone = normalizeTone(tone);

  if (tone === NarrativeTone.MINIMAL) {
    // For minimal, do structural transformation without LLM
    const output = canonicalNarrative.fullOutput;
    const rendered = { ...output };
    
    const sections = context === 'ME' 
      ? ['story', 'identification', 'functioning', 'actions', 'lifeDomains']
      : ['myth', 'narrative'];
    
    sections.forEach(section => {
      if (output[section]) {
        rendered[section] = transformToMinimal(output[section], section);
      }
    });
    
    return rendered;
  }

  const output = canonicalNarrative.fullOutput;
  const rendered = { ...output };

  const sections = context === 'ME' 
    ? ['story', 'identification', 'functioning', 'actions', 'lifeDomains']
    : ['myth', 'narrative'];

  const renderPromises = sections.map(async (section) => {
    if (output[section]) {
      const renderedSection = await renderSection(canonicalNarrative, tone, context, section);
      return { section, content: renderedSection };
    }
    return { section, content: output[section] };
  });

  const results = await Promise.all(renderPromises);
  
  results.forEach(({ section, content }) => {
    if (content) {
      rendered[section] = content;
    }
  });

  rendered.examples = output.examples;
  rendered.meta = output.meta;
  rendered.identification_v2 = output.identification_v2;

  return rendered;
}

/**
 * Transform content to specified tone using LLM
 */
async function transformToTone(content, tone, context, section, characters = []) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const toneInstruction = TONE_INSTRUCTIONS[tone];
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  
  // Include character context for MODERN and MYTHICAL tones
  const characterContext = characters.length > 0 
    ? `\n\nUSER'S CHARACTERS (weave these into the narrative):\n${characters.map(c => `- ${c.name} (${c.role})`).join('\n')}`
    : '';

  const prompt = `${toneInstruction}
${characterContext}

CRITICAL RULES:
1. Do NOT add new insights or interpretations
2. Do NOT remove any information
3. Do NOT change conclusions or meanings
4. ONLY change the style and language
5. Preserve the exact structure (if JSON, return valid JSON)
6. Keep all examples, actions, and warnings intact
7. For MODERN/MYTHICAL: Reference characters by name throughout the narrative

Context: ${context}
Section: ${section}

Original content to transform:
${contentStr}

Return the transformed content in the same format (JSON if input was JSON).`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are a narrative style transformer. Transform content style without changing meaning or adding/removing information.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const result = response.choices[0].message.content;

    if (typeof content === 'object') {
      try {
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
      } catch {
        return result;
      }
    }

    return result;
  } catch (error) {
    console.error('[ToneRenderer] LLM transformation failed:', error);
    throw error;
  }
}

/**
 * Get cache key for rendered content
 */
export function getToneCacheKey(canonicalHash, tone, section) {
  return `tone_${canonicalHash}_${normalizeTone(tone)}_${section}`;
}

/**
 * Validate that tone is supported
 */
export function isValidTone(tone) {
  const normalized = normalizeTone(tone);
  return Object.values(NarrativeTone).includes(normalized);
}

/**
 * Get all available tones with metadata
 */
export function getAvailableTones() {
  return Object.values(NarrativeTone).map(tone => ({
    value: tone,
    label: TONE_LABELS[tone],
    description: TONE_DESCRIPTIONS[tone],
  }));
}
