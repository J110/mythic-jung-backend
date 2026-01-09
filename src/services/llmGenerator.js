import OpenAI from 'openai';

/**
 * LLM-based generator using OpenAI
 * This generates more sophisticated, personalized output based on user data
 */

// Only initialize OpenAI if API key is provided
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function generateWithLLM(userData) {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY environment variable or use mock generation.');
  }

  const { profile, assessments } = userData;
  const characters = profile?.characters || [];
  const characterNames = characters.map((c) => c.displayName || c.id).join(', ');

  // Build prompt based on characters and assessments
  const prompt = buildGenerationPrompt(userData);
  
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // Use gpt-4o-mini for cost efficiency
  
  // o1 models don't support system messages or response_format
  const enhancedPrompt = model.startsWith('o1')
    ? `You are a Jungian analyst creating personalized archetypal profiles. 
You MUST respond with valid JSON only, no other text, matching the GeneratedOutput schema.
Be mystical and profound while remaining psychologically accurate.
Focus on the characters: ${characterNames}

${prompt}

IMPORTANT: Respond with ONLY a JSON object matching the GeneratedOutput schema (no markdown, no code blocks, just raw JSON).`
    : prompt;
  
  const messages = model.startsWith('o1')
    ? [{ role: 'user', content: enhancedPrompt }]
    : [
        {
          role: 'system',
          content: `You are a Jungian analyst creating personalized archetypal profiles. 
          Generate output in valid JSON format matching the GeneratedOutput schema.
          Be mystical and profound while remaining psychologically accurate.
          Focus on the characters: ${characterNames}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ];

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      ...(model.startsWith('o1') ? {} : { response_format: { type: 'json_object' }, temperature: 0.8 }),
    });

    const content = completion.choices[0].message.content;
    const output = JSON.parse(content);

    // Add meta information
    output.meta = {
      generatedAt: new Date().toISOString(),
      modelVersion: process.env.MODEL_VERSION || 'gpt-4',
      promptVersion: process.env.PROMPT_VERSION || 'v1',
      schemaVersion: parseInt(process.env.SCHEMA_VERSION || '1', 10),
    };

    return output;
  } catch (error) {
    console.error('LLM generation error:', error);
    throw new Error('Failed to generate output with LLM');
  }
}

function buildGenerationPrompt(userData) {
  const { profile, assessments } = userData;
  const characters = profile?.characters || [];
  
  let prompt = `Generate a Jungian archetypal profile based on the following:

Characters selected: ${characters.map((c) => c.displayName || c.id).join(', ')}

`;

  if (assessments && assessments.length > 0) {
    prompt += `Assessment answers:\n`;
    assessments.forEach((a) => {
      prompt += `- ${a.assessmentType} / ${a.questionId}: ${a.selectedCharacterIds.join(', ')}\n`;
    });
  }

  prompt += `\nGenerate a complete GeneratedOutput JSON with:
- story (mythSummary, centralTension, guidingSentence, optional northStarScene)
- identification (ego, persona, shadow, shadowVirtue, feelingFunction, optional erosAxis, evidence array)
- functioning (coreTraits, symbolicEssence, narrativeArc, redemptionArc, optional costsAndCompensations, optional alignmentIndicators)
- actions (situationBlocks array, guidingQuestion)
- lifeDomains (work, leadership, truth, intimacy, social, innerLife - each with title, iAm, iTendTo, typicalSituations, watchOuts, toRealizePotential, selfDirection)

Make it deeply personal, mystical, and psychologically insightful.`;

  return prompt;
}
