/**
 * AI Character Validator
 * Uses AI to verify if characters are real characters from TV, movies, books, or real life
 * This is more robust than hardcoded patterns
 */

import OpenAI from 'openai';

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Validate characters using AI to check if they're real
 */
export async function validateCharactersWithAI(characters) {
  if (!characters || !Array.isArray(characters) || characters.length === 0) {
    return {
      valid: false,
      reason: 'No characters provided',
      unrecognized: [],
    };
  }

  // If no OpenAI API key, fall back to basic validation
  if (!openai) {
    console.warn('No OpenAI API key - using basic validation');
    return validateBasic(characters);
  }

  const characterNames = characters.map(c => c.displayName || c.id || '').filter(Boolean);
  
  if (characterNames.length === 0) {
    return {
      valid: false,
      reason: 'No valid character names found',
      unrecognized: [],
    };
  }

  try {
    // Use AI to check if characters are recognized
    const recognitionResults = await recognizeCharactersWithAI(characterNames);
    
    // Filter by both recognition AND confidence
    // Only accept characters with high or medium confidence
    const highConfidence = recognitionResults.filter(r => 
      r.isRecognized && (r.confidence === 'high' || r.confidence === 'medium')
    );
    const lowConfidence = recognitionResults.filter(r => 
      r.isRecognized && r.confidence === 'low'
    );
    const unrecognized = recognitionResults.filter(r => !r.isRecognized);
    
    // Calculate overall confidence score
    const totalChars = recognitionResults.length;
    const highConfCount = highConfidence.length;
    const mediumConfCount = recognitionResults.filter(r => 
      r.isRecognized && r.confidence === 'medium'
    ).length;
    const lowConfCount = lowConfidence.length;
    
    const confidenceScore = (highConfCount * 1.0 + mediumConfCount * 0.7 + lowConfCount * 0.3) / totalChars;
    
    // Require at least minRequired characters to be recognized with medium+ confidence
    const minRequired = Math.max(4, Math.ceil(characterNames.length * 0.67));  // At least 67% must be valid
    if (highConfidence.length < minRequired) {
      const allUnrecognized = [...unrecognized, ...lowConfidence].map(r => r.name);
      const needsClarification = lowConfidence.map(r => r.name);
      
      let reason = `Only ${highConfidence.length} out of ${characterNames.length} characters were confidently recognized as real characters.`;
      
      if (lowConfidence.length > 0) {
        reason += ` The following characters have low recognition confidence: ${needsClarification.join(', ')}.`;
      }
      
      if (unrecognized.length > 0) {
        reason += ` The following were not recognized: ${unrecognized.map(r => r.name).join(', ')}.`;
      }
      
      return {
        valid: false,
        reason,
        unrecognized: allUnrecognized,
        recognized: highConfidence.map(r => r.name),
        lowConfidence: needsClarification,
        confidenceScore,
        suggestions: generateSuggestions(allUnrecognized, needsClarification),
      };
    }
    
    // If confidence score is too low overall, ask for clarification
    if (confidenceScore < 0.6) {
      const needsClarification = [...lowConfidence, ...unrecognized].map(r => r.name);
      return {
        valid: false,
        reason: `The recognition confidence for your characters is low (${Math.round(confidenceScore * 100)}%). Please provide more specific character names with their sources (TV show, movie, book, etc.) to improve accuracy.`,
        unrecognized: needsClarification,
        recognized: highConfidence.map(r => r.name),
        confidenceScore,
        suggestions: generateSuggestions(needsClarification, needsClarification),
      };
    }

    return {
      valid: true,
      recognized: highConfidence.map(r => r.name),
      unrecognized: [...lowConfidence, ...unrecognized].map(r => r.name),
      confidenceScore,
    };
  } catch (error) {
    console.error('AI validation error:', error);
    // Fall back to basic validation on error
    return validateBasic(characters);
  }
}

/**
 * Use AI to recognize if characters are real
 */
async function recognizeCharactersWithAI(characterNames) {
  const prompt = `You are a character recognition expert. For each name provided, determine if it is a RECOGNIZED CHARACTER (not a product, object, or generic term) from:
- TV shows and series (e.g., "Walter White", "Tyrion Lannister")
- Movies and films (e.g., "Neo", "Forrest Gump")
- Books and literature (e.g., "Atticus Finch", "Elizabeth Bennet")
- Mythology and folklore (e.g., "Odysseus", "Krishna")
- Real historical figures (e.g., "Gandhi", "Einstein")
- Real contemporary public figures (e.g., "Elon Musk", "Oprah")

IMPORTANT: Reject if the name is:
- A product or brand name (e.g., "Uncle Chips", "Air Purifier")
- A household item or object (e.g., "Tea Cup", "Snack Plate", "Universal Plug")
- A generic term or common word
- Not a character or person

Character names to check:
${characterNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Respond with a JSON object in this exact format:
{
  "results": [
    {"name": "character name 1", "isRecognized": true, "source": "Movie", "confidence": "high"},
    {"name": "character name 2", "isRecognized": false, "source": "Unknown", "confidence": "low"}
  ]
}

For confidence levels:
- "high": Well-known, unambiguous character (e.g., "Gandalf", "Sherlock Holmes")
- "medium": Recognized but may need context (e.g., "Jack" from a specific show)
- "low": Unclear or not a character (e.g., products, objects, generic terms)

Set isRecognized to false for products, objects, or non-character names.`;

  try {
      // Use gpt-4o as default for reliability, o1-mini as optional upgrade
      // If o1 models fail, automatically fall back to gpt-4o
      let model = process.env.OPENAI_VALIDATION_MODEL || 'gpt-4o';
      let useO1 = model.startsWith('o1');
      
      // o1 models don't support system messages or response_format
      // They also need explicit JSON instructions in the prompt
      const enhancedPrompt = model.startsWith('o1')
        ? `You are a character recognition expert. You MUST respond with valid JSON only, no other text.

${prompt}

IMPORTANT: Respond with ONLY a JSON object in this exact format (no markdown, no code blocks, just raw JSON):
{
  "results": [
    {"name": "character name 1", "isRecognized": true, "source": "Movie", "confidence": "high"},
    {"name": "character name 2", "isRecognized": false, "source": "Unknown", "confidence": "low"}
  ]
}`
        : prompt;
      
      const messages = model.startsWith('o1')
        ? [{ role: 'user', content: enhancedPrompt }]
        : [
            { role: 'system', content: 'You are a character recognition expert. Always respond with valid JSON only.' },
            { role: 'user', content: prompt },
          ];
      
      const requestConfig = {
        model,
        messages,
        ...(model.startsWith('o1') ? {} : { response_format: { type: 'json_object' }, temperature: 0.3 }),
      };
      
      let response;
      try {
        response = await openai.chat.completions.create(requestConfig);
      } catch (apiError) {
        // If o1 model fails, fall back to gpt-4o
        if (useO1 && (
          apiError.message?.includes('not found') || 
          apiError.status === 404 ||
          apiError.message?.includes('model') ||
          apiError.code === 'model_not_found'
        )) {
          console.warn(`[AI Validator] o1 model ${model} not available, falling back to gpt-4o`);
          model = 'gpt-4o';
          useO1 = false;
          const fallbackMessages = [
            { role: 'system', content: 'You are a character recognition expert. Always respond with valid JSON only.' },
            { role: 'user', content: prompt },
          ];
          response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: fallbackMessages,
            response_format: { type: 'json_object' },
            temperature: 0.3,
          });
        } else {
          console.error('[AI Validator] API error:', apiError);
          throw new Error(`OpenAI API error: ${apiError.message || 'Unknown error'}`);
        }
      }

    const content = response.choices[0].message.content.trim();
    
    // Try to parse JSON (handle markdown code blocks if present)
    let jsonContent = content;
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonContent = match[1];
      }
    }
    
    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[AI Validator] JSON parse error:', parseError);
      console.error('[AI Validator] Content that failed to parse:', jsonContent.substring(0, 500));
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
    }
    
    // Extract results array
    let results = [];
    if (Array.isArray(parsed)) {
      results = parsed;
    } else if (parsed.results && Array.isArray(parsed.results)) {
      results = parsed.results;
    } else if (parsed.characters && Array.isArray(parsed.characters)) {
      results = parsed.characters;
    } else {
      // If it's an object with character names as keys
      results = Object.entries(parsed)
        .filter(([key]) => key !== 'results' && key !== 'characters')
        .map(([name, data]) => ({
          name,
          ...(typeof data === 'object' && data !== null ? data : { isRecognized: data }),
        }));
    }

    // Match results to input names (case-insensitive, preserving order)
    return characterNames.map((name, index) => {
      // Try exact match first
      let result = results.find(r => 
        r.name && r.name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      
      // If no exact match, try by index
      if (!result && results[index]) {
        result = results[index];
      }
      
      // If still no match, try partial match
      if (!result) {
        result = results.find(r => 
          r.name && name.toLowerCase().includes(r.name.toLowerCase()) ||
          r.name && r.name.toLowerCase().includes(name.toLowerCase())
        );
      }
      
      if (result) {
        return {
          name,
          isRecognized: result.isRecognized === true || 
                       result.isRecognized === 'true' || 
                       String(result.isRecognized).toLowerCase() === 'true',
          source: result.source || 'Unknown',
          confidence: result.confidence || 'medium',
        };
      }
      
      // Default: not recognized
      return {
        name,
        isRecognized: false,
        source: 'Unknown',
        confidence: 'low',
      };
    });
  } catch (error) {
    console.error('AI recognition error:', error);
    // Return all as unrecognized on error
    return characterNames.map(name => ({
      name,
      isRecognized: false,
      source: 'Unknown',
      confidence: 'low',
      error: error.message,
    }));
  }
}

/**
 * Generate helpful suggestions for unrecognized characters
 */
function generateSuggestions(unrecognizedNames, lowConfidenceNames = []) {
  if (unrecognizedNames.length === 0 && lowConfidenceNames.length === 0) return [];
  
  const suggestions = [];
  
  if (unrecognizedNames.length > 0) {
    suggestions.push(`The following were not recognized as characters: ${unrecognizedNames.join(', ')}`);
  }
  
  if (lowConfidenceNames.length > 0) {
    suggestions.push(`The following have low recognition confidence: ${lowConfidenceNames.join(', ')}`);
  }
  
  suggestions.push(
    '',
    'Please provide character names from:',
    '- TV shows and series (e.g., "Walter White" from Breaking Bad, "Tyrion Lannister" from Game of Thrones)',
    '- Movies (e.g., "Neo" from The Matrix, "Forrest Gump")',
    '- Books (e.g., "Atticus Finch" from To Kill a Mockingbird, "Elizabeth Bennet" from Pride and Prejudice)',
    '- Mythology (e.g., "Odysseus" from Greek mythology, "Krishna" from Hindu mythology)',
    '- Real historical figures (e.g., "Gandhi", "Einstein")',
    '- Real contemporary figures (e.g., "Elon Musk", "Oprah Winfrey")',
    '',
    'IMPORTANT: Provide the character name AND their source (TV show, movie, book, etc.) for better recognition.',
    'Examples: "Jack Reacher (from books/movies)", "Aragorn (from Lord of the Rings)", "Patch Adams (from movie)"',
  );
  
  return suggestions;
}

/**
 * Basic validation fallback (when AI is not available)
 */
function validateBasic(characters) {
  const meaningful = characters.filter(char => {
    const name = (char.displayName || char.id || '').trim();
    // Basic checks: at least 3 characters, not just numbers, has letters
    return name.length >= 3 && 
           /[a-zA-Z]/.test(name) && 
           !/^\d+$/.test(name) &&
           !/^[a-z]$/i.test(name); // Not single letter
  });

  if (meaningful.length < 4) {
    return {
      valid: false,
      reason: `Only ${meaningful.length} out of ${characters.length} characters appear to be valid names. Please provide real character names from TV, movies, books, or real life.`,
      unrecognized: characters
        .filter(c => !meaningful.includes(c))
        .map(c => c.displayName || c.id),
    };
  }

  return {
    valid: true,
    recognized: meaningful.map(c => c.displayName || c.id),
  };
}
