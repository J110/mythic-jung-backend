/**
 * Tone Renderer Service
 * 
 * Transforms canonical narrative into tone-specific rendered output.
 * Does NOT modify insights, examples, or actions - only presentation style.
 */

import OpenAI from 'openai';

// Supported tones
export const NarrativeTone = {
  PLAIN: 'PLAIN',
  MYTHIC: 'MYTHIC',
  REFLECTIVE: 'REFLECTIVE',
  PRACTICAL: 'PRACTICAL',
  ANALYTICAL: 'ANALYTICAL',
};

// Default tone
export const DEFAULT_TONE = NarrativeTone.PLAIN;

// Tone style instructions (prepended to rendering prompts)
// These should produce DRAMATICALLY DIFFERENT outputs so users clearly notice the change
const TONE_INSTRUCTIONS = {
  [NarrativeTone.PLAIN]: `TONE: PLAIN (Clear & Direct)
Style requirements:
- SHORT sentences. Maximum 15 words per sentence.
- ZERO metaphors, ZERO poetic language, ZERO symbolic imagery
- Write like you're explaining to a busy friend over coffee
- "You tend to..." not "The shadow beckons..."
- NEVER use words like: archetype, shadow, anima, psyche, unconscious
- Instead say: pattern, hidden side, inner opposite, personality
- No bullet points in narratives, but keep it snappy
- Think: clear texting language, not literature`,

  [NarrativeTone.MYTHIC]: `TONE: MYTHIC (Epic & Poetic)
Style requirements:
- Write like an EPIC STORYTELLER revealing an ancient prophecy
- Use RICH metaphors: "You carry the fire of the wounded healer..."
- Dramatic, flowing sentences with emotional cadence
- Reference archetypes through IMAGERY not labels: "the darkness that walks beside you" not "your shadow"
- Use mythological/fairy tale framing: quests, thresholds, kingdoms, masks, mirrors
- Create a sense of DESTINY and sacred meaning
- Include phrases like: "And so it was written...", "In your soul's geography...", "The story your life tells..."
- Make it feel like discovering an ancient map of the self`,

  [NarrativeTone.REFLECTIVE]: `TONE: REFLECTIVE (Therapeutic & Gentle)
Style requirements:
- Write like a WISE, WARM THERAPIST or mentor
- Ask QUESTIONS: "What might this mean for you?", "Notice how...", "You might explore..."
- Use invitational language: "Perhaps...", "You may find...", "Consider..."
- Create SPACE for the reader: "Sit with this...", "Let this settle..."
- Emphasize awareness and curiosity over answers
- Soft transitions: "And gently...", "Moving inward..."
- Include phrases like: "What opens for you when you consider...", "How does it feel to see..."
- NEVER give direct commands. Always invite.`,

  [NarrativeTone.PRACTICAL]: `TONE: PRACTICAL (Action-Oriented)
Style requirements:
- Structure with BULLET POINTS and numbered lists wherever possible
- Direct COMMANDS: "Do this:", "Avoid:", "When X happens, try Y"
- Situational framing: "At work:", "In relationships:", "Under stress:"
- CONCRETE examples and specific actions
- No philosophy, no poetry, no exploration
- Include checkable items: "✓ Notice when...", "⚠️ Watch for..."
- Time-bound where possible: "This week, practice...", "Daily, check in on..."
- Think: executive summary meets life coach`,

  [NarrativeTone.ANALYTICAL]: `TONE: ANALYTICAL (Jungian Framework)
Style requirements:
- USE FULL JUNGIAN TERMINOLOGY explicitly: Ego, Shadow, Anima/Animus, Persona, Self
- Include structural explanations: "This represents the Ego-Shadow axis where..."
- Map psychological dynamics clearly: "Your Feeling Function compensates for..."
- Academic but accessible sentences (complex structure allowed)
- Include phrases like: "In Jungian terms...", "This archetypal pattern indicates...", "The compensatory relationship between..."
- Reference psychological functions: Thinking, Feeling, Sensing, Intuiting
- Explain the WHY of each insight using the framework
- Like reading a psychological case study about yourself`,
};

// Human-friendly tone labels
export const TONE_LABELS = {
  [NarrativeTone.PLAIN]: 'Clear & Direct',
  [NarrativeTone.MYTHIC]: 'Mythic & Poetic',
  [NarrativeTone.REFLECTIVE]: 'Gentle & Contemplative',
  [NarrativeTone.PRACTICAL]: 'Action-Oriented',
  [NarrativeTone.ANALYTICAL]: 'Deep & Psychological',
};

// Tone descriptions for UI
export const TONE_DESCRIPTIONS = {
  [NarrativeTone.PLAIN]: 'No metaphors, just clear everyday language you can share with anyone',
  [NarrativeTone.MYTHIC]: 'Rich with archetypal imagery, metaphors, and epic storytelling',
  [NarrativeTone.REFLECTIVE]: 'Soft questions and invitations — like a wise friend speaking',
  [NarrativeTone.PRACTICAL]: 'Bullet points and directives — ready for immediate action',
  [NarrativeTone.ANALYTICAL]: 'Full Jungian terminology — ego, shadow, anima explained explicitly',
};

/**
 * Extract canonical narrative from generated output
 * This normalizes existing output into the canonical format
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
      // Preserve full structure for rendering
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
 * 
 * @param {Object} canonicalNarrative - The canonical narrative object
 * @param {string} tone - One of NarrativeTone values
 * @param {string} context - 'ME' or 'RELATIONSHIP'
 * @param {string} section - Section to render (e.g., 'story', 'identification')
 * @returns {Promise<Object>} - Rendered section
 */
export async function renderSection(canonicalNarrative, tone, context, section) {
  if (!canonicalNarrative?.fullOutput) {
    console.warn('[ToneRenderer] No canonical narrative provided');
    return null;
  }

  // Validate tone
  if (!Object.values(NarrativeTone).includes(tone)) {
    console.warn(`[ToneRenderer] Invalid tone "${tone}", falling back to PLAIN`);
    tone = NarrativeTone.PLAIN;
  }

  // If PLAIN, return original (no transformation needed)
  if (tone === NarrativeTone.PLAIN) {
    return canonicalNarrative.fullOutput[section] || canonicalNarrative.fullOutput;
  }

  const sectionContent = canonicalNarrative.fullOutput[section];
  if (!sectionContent) {
    return null;
  }

  try {
    const rendered = await transformToTone(sectionContent, tone, context, section);
    return rendered;
  } catch (error) {
    console.error(`[ToneRenderer] Failed to render ${section} in ${tone} tone:`, error);
    // Fallback to original
    return sectionContent;
  }
}

/**
 * Render entire output in requested tone
 */
export async function renderFullOutput(canonicalNarrative, tone, context) {
  if (!canonicalNarrative?.fullOutput) {
    return null;
  }

  if (tone === NarrativeTone.PLAIN) {
    return canonicalNarrative.fullOutput;
  }

  const output = canonicalNarrative.fullOutput;
  const rendered = { ...output };

  // Determine sections to render based on context
  const sections = context === 'ME' 
    ? ['story', 'identification', 'functioning', 'actions', 'lifeDomains']
    : ['myth', 'narrative'];

  // Render each section in parallel
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

  // Preserve non-narrative fields
  rendered.examples = output.examples;
  rendered.meta = output.meta;
  rendered.identification_v2 = output.identification_v2;

  return rendered;
}

/**
 * Transform content to specified tone using LLM
 */
async function transformToTone(content, tone, context, section) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const toneInstruction = TONE_INSTRUCTIONS[tone];
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  const prompt = `${toneInstruction}

CRITICAL RULES:
1. Do NOT add new insights or interpretations
2. Do NOT remove any information
3. Do NOT change conclusions or meanings
4. ONLY change the style and language
5. Preserve the exact structure (if JSON, return valid JSON)
6. Keep all examples, actions, and warnings intact

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
      temperature: 0.3, // Low temp for consistency
      max_tokens: 4000,
    });

    const result = response.choices[0].message.content;

    // Try to parse as JSON if original was object
    if (typeof content === 'object') {
      try {
        // Clean markdown code blocks if present
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
      } catch {
        // If parse fails, return as-is
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
  return `tone_${canonicalHash}_${tone}_${section}`;
}

/**
 * Validate that tone is supported
 */
export function isValidTone(tone) {
  return Object.values(NarrativeTone).includes(tone);
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
