/**
 * Character Recognition Engine
 * Converts user-entered character strings into high-confidence canonical character entities.
 * Rejects junk or ambiguous input and asks for specificity.
 * 
 * Based on: 01_CHARACTER_RECOGNITION_ENGINE_SPEC.md
 */

import OpenAI from 'openai';
import { safeParseJSON } from '../utils/jsonParser.js';

let openai = null;

/**
 * Get or initialize OpenAI client
 */
function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Recognition result status
 */
export const RecognitionStatus = {
  RECOGNIZED: 'RECOGNIZED',
  AMBIGUOUS: 'AMBIGUOUS',
  NOT_RECOGNIZED: 'NOT_RECOGNIZED',
};

/**
 * Recognize a single character input
 * @param {string} input - User-entered character string
 * @param {Object} options - Recognition options
 * @returns {Promise<RecognitionResult>}
 */
export async function recognizeCharacter(input, options = {}) {
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return createNotRecognizedResult(input, 'Empty input');
  }

  // Step 1: Normalize input
  const normalized = normalizeInput(input);
  
  // Step 2: Retrieve candidates using AI (hybrid approach)
  const candidates = await retrieveCandidates(normalized);
  
  // Step 3: Rerank candidates
  const reranked = await rerankCandidates(normalized, candidates);
  
  // Step 4: Score confidence
  const scored = scoreConfidence(normalized, reranked);
  
  // Step 5: Determine status and create result
  return createRecognitionResult(normalized, scored);
}

/**
 * Recognize multiple characters
 * @param {string[]} inputs - Array of character strings
 * @param {Object} referenceHints - Optional reference hints per character { [name]: { text, type, limitMode } }
 * @returns {Promise<{results: RecognitionResult[], overall: Object}>}
 */
export async function recognizeCharacters(inputs, referenceHints = {}) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return {
      results: [],
      overall: {
        recognizedCount: 0,
        minConfidence: 0.0,
        needsDisambiguation: false,
      },
    };
  }

  // BATCH all characters into ONE API call to avoid rate limits
  // All recognition is AI-based - no hardcoded mappings
  const results = await recognizeCharactersBatch(inputs, referenceHints);

  const recognized = results.filter(r => r.status === RecognitionStatus.RECOGNIZED);
  const ambiguous = results.filter(r => r.status === RecognitionStatus.AMBIGUOUS);
  const strictFailures = results.filter(r => r.failureReason === 'UNRECOGNIZED_IN_REFERENCE');
  const confidences = recognized.map(r => r.confidence);
  const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0.0;

  return {
    results,
    overall: {
      recognizedCount: recognized.length,
      ambiguousCount: ambiguous.length,
      notRecognizedCount: results.length - recognized.length - ambiguous.length,
      strictFailureCount: strictFailures.length,
      minConfidence,
      needsDisambiguation: ambiguous.length > 0,
    },
  };
}

/**
 * Batch recognize all characters in ONE API call (avoids rate limits)
 * Now supports reference hints for disambiguation
 * 
 * Pure AI-based recognition - no hardcoded fallbacks
 * 
 * @param {string[]} inputs - Character names
 * @param {Object} referenceHints - { [name]: { text, type, limitMode } }
 */
async function recognizeCharactersBatch(inputs, referenceHints = {}) {
  const client = getOpenAIClient();
  if (!client) {
    console.warn('[Recognition] No OpenAI API key - cannot perform AI recognition');
    return inputs.map(input => createNotRecognizedResult(input, 'No API key'));
  }

  try {
    console.log(`[Recognition] Batch recognizing ${inputs.length} characters in ONE API call...`);
    
    // Build input list with reference hints - clearer format
    const inputsWithRefs = inputs.map((name, i) => {
      const ref = referenceHints[name];
      if (ref && ref.text) {
        return `${i+1}. Input: "${name}", Reference: "${ref.text}", Mode: ${ref.limitMode || 'ASSISTIVE'}`;
      }
      return `${i+1}. Input: "${name}"`;
    });
    
    // Enhanced prompt - AI-only recognition with global cinema support
    const prompt = `You are recognizing ${inputs.length} inputs. Return ONE result for EACH input, in the SAME ORDER.

INPUTS:
${inputsWithRefs.join('\n')}

CRITICAL RULES:

1. RECOGNIZE FAMOUS FICTIONAL CHARACTERS with HIGH CONFIDENCE (0.85+):
   
   HOLLYWOOD/WESTERN:
   - Jack Reacher, James Bond, Sherlock Holmes, Batman, Spider-Man, Superman
   - Gregory House (House M.D.), Rick Sanchez (Rick and Morty), Don Draper (Mad Men)
   - Walter White (Breaking Bad), Tony Soprano (The Sopranos)
   - Trinity (The Matrix), Bobby Axelrod (Billions), Forrest Gump
   
   INDIAN CINEMA (Bollywood, Tollywood, Kollywood, Kannada, etc.):
   - Rocky (KGF: Chapter 1 & 2) - Kannada action film hero played by Yash
   - Raya/Arjun (Toxic 2025) - Kannada film character played by Yash
   - Kabir Singh (Kabir Singh) - Hindi film
   - Pushpa Raj (Pushpa: The Rise) - Telugu film character played by Allu Arjun
   - Rancho/Phunsukh Wangdu (3 Idiots) - character played by Aamir Khan
   - Gabbar Singh (Sholay) - Classic villain
   - Baahubali/Amarendra (Baahubali series) - Telugu epic
   - Don (Don series) - SRK's character
   - Simran (DDLJ), Geet (Jab We Met), Rani (Queen)
   - Bheem, Ram (RRR) - Telugu epic characters
   - Arjun Reddy (Arjun Reddy) - Telugu film
   
   KOREAN/ASIAN:
   - Park Sae-ro-yi (Itaewon Class), Cho Sang-woo (Squid Game)
   - Kang Sae-byeok (Squid Game)
   
   ANIME:
   - Goku, Naruto, Luffy, Light Yagami, Eren Yeager
   
2. RECOGNIZE REAL-LIFE PUBLIC FIGURES with HIGH CONFIDENCE (0.90+):
   - Politicians: Donald Trump, Narendra Modi, Barack Obama
   - Business: Elon Musk, Mukesh Ambani, Ratan Tata
   - Sports: Virat Kohli, MS Dhoni, Sachin Tendulkar, Lionel Messi
   - Historical: Plato, Gandhi, Einstein, Abraham Lincoln
   
   For these: recognized=true, confidence=0.90, medium="real-life" or "historical"
   
3. WHEN REFERENCE IS PROVIDED - BE GENEROUS:
   - "Rocky" + "KGF" → CHARACTER: "Rocky" from KGF, confidence=0.95
   - "Raya" + "Toxic" → CHARACTER: "Raya" from Toxic (2025 Kannada film), confidence=0.90
   - "Pushpa" + "Pushpa" → CHARACTER: "Pushpa Raj", confidence=0.95
   - TRUST the reference! If user says "from KGF" or "from Toxic", believe them
   
4. ACTOR NAMES with Reference → Return CHARACTER:
   - "Yash" + "KGF" → CHARACTER: "Rocky" (inputWasActor=true)
   - "Allu Arjun" + "Pushpa" → CHARACTER: "Pushpa Raj" (inputWasActor=true)
   - "Zooey Deschanel" + "Yes Man" → CHARACTER: "Allison" (inputWasActor=true)

5. REGIONAL CINEMA - HIGH PRIORITY:
   - Indian cinema (Hindi, Telugu, Tamil, Kannada, Malayalam) is MASSIVELY popular
   - When reference matches regional cinema title, set confidence=0.85-0.95
   - Never reject regional cinema characters just because they're not Hollywood

6. RETURN COMPLETE ARRAY:
   You MUST return ${inputs.length} results, one for each input, in the SAME ORDER.

Return valid JSON:
{
  "characters": [
    {
      "input": "exact input string",
      "recognized": true,
      "needsClarification": false,
      "clarificationReason": null,
      "name": "Character Name",
      "franchise": "Source (KGF, Toxic, Mission: Impossible, etc.)",
      "medium": "film/tv/book/real-life/historical",
      "confidence": 0.9,
      "matchesReference": true,
      "inputWasActor": false
    }
  ]
}`;


    const response = await client.chat.completions.create({
      model: process.env.OPENAI_RECOGNITION_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `You are a recognition AI specializing in GLOBAL cinema and public figures.

YOUR CAPABILITIES:
- You know fictional characters from GLOBAL cinema including Hollywood, Bollywood, Tollywood, Kollywood, Kannada, Korean, Japanese
- You know famous real-life public figures (politicians, celebrities, business leaders, athletes)
- You know historical figures (philosophers, leaders, scientists, artists)
- You can map actor names to characters when a movie/show reference is provided
- You TRUST user-provided references and recognize characters from regional cinema

FICTIONAL CHARACTERS - GLOBAL CINEMA (confidence 0.85+):

HOLLYWOOD: Jack Reacher, James Bond, Trinity (Matrix), Walter White, Tony Soprano, Batman

INDIAN CINEMA (HIGH PRIORITY - These are massively popular):
- Rocky (KGF series) - Kannada film protagonist by Yash
- Raya/Arjun (Toxic 2025) - Kannada film by Yash  
- Pushpa Raj (Pushpa series) - Telugu film by Allu Arjun
- Kabir Singh (Kabir Singh) - Hindi film
- Baahubali (Baahubali series) - Telugu epic
- Don (Don series), Simran (DDLJ), Geet (Jab We Met)
- Bheem, Ram (RRR) - Telugu epic

KOREAN: Park Sae-ro-yi, Cho Sang-woo (Squid Game)
ANIME: Goku, Naruto, Luffy

REAL-LIFE PUBLIC FIGURES (confidence 0.90+):
- Politicians: Donald Trump, Narendra Modi, Barack Obama
- Business: Elon Musk, Mukesh Ambani, Ratan Tata
- Sports: Virat Kohli, MS Dhoni, Cristiano Ronaldo
- Historical: Plato, Gandhi, Einstein

IMPORTANT: When a reference is provided (like "KGF" or "Toxic"), TRUST IT and recognize the character with high confidence.

HISTORICAL FIGURES YOU MUST RECOGNIZE (confidence 0.90+):
Philosophers: Plato, Aristotle, Socrates, Confucius, Nietzsche, Kant
Leaders: Alexander the Great, Julius Caesar, Napoleon, Abraham Lincoln, Gandhi, Martin Luther King Jr.
Scientists: Einstein, Newton, Darwin, Marie Curie, Tesla
Artists: Leonardo da Vinci, Shakespeare, Mozart, Beethoven

For historical figures, use: medium="historical", franchise="Historical Figure"

ACTOR-TO-CHARACTER MAPPING:
When input is an actor name WITH a reference:
- "Zooey Deschanel" in "Yes Man" → CHARACTER: "Allison"
- "Priyanka Chopra" in "Don" → CHARACTER: "Roma"

If you don't know which character the actor played, set needsClarification=true.

KEY RULES:
1. Return ONE result for EACH input, in the SAME ORDER
2. Set confidence 0.85+ for well-known fictional characters
3. Set confidence 0.90+ for well-known real-life and historical figures
4. Set needsClarification=true if confidence < 0.7
5. NEVER make up names - ask for help instead

Return valid JSON with "characters" array containing all results.` },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
    });

    // Log the raw response for debugging
    console.log('[Recognition] AI response:', response.choices[0].message.content.substring(0, 500));

    const content = response.choices[0].message.content;
    let parsed;
    try {
      parsed = safeParseJSON(content, 'RecognitionEngine.recognizeBatch');
      if (!parsed || Object.keys(parsed).length === 0) {
        throw new Error('Empty result from safeParseJSON');
      }
    } catch (e) {
      console.error('[Recognition] Failed to parse batch response:', content);
      return inputs.map(input => createNotRecognizedResult(input, 'Parse error'));
    }

    const characters = parsed.characters || parsed.results || [];
    
    // Map results back to inputs with reference awareness
    // Pure AI-based recognition - no hardcoded fallbacks
    return inputs.map((input, inputIndex) => {
      const inputLower = input.toLowerCase().trim();
      const ref = referenceHints[input];
      const limitMode = ref?.limitMode || 'NONE';
      
      // Find matching result from AI by input text
      let match = characters.find(c => 
        c.input?.toLowerCase().trim() === inputLower
      );
      
      // Fallback: use index-based matching (assumes AI returned results in same order)
      if (!match && characters[inputIndex]) {
        match = characters[inputIndex];
        console.log(`[Recognition] Using index-based matching for "${input}" (index ${inputIndex})`);
      }
      
      // If still no match, the AI didn't return a result for this input
      if (!match) {
        console.warn(`[Recognition] No AI result for "${input}" - AI may have skipped it`);
        return createNotRecognizedResult(input, 'AI did not return a result for this input');
      }

      // Handle STRICT mode failures - but be more lenient for actor names
      if (limitMode === 'STRICT' && ref?.text) {
        if (!match || !match.recognized || match.matchesReference === false) {
          // If AI indicated this was an actor name but couldn't find character, ask for clarification
          // instead of hard-failing (more user-friendly)
          if (match?.inputWasActor || match?.clarificationReason === 'actor_character_unknown') {
            console.log(`[Recognition] Actor-to-character mapping needs clarification for "${input}" in "${ref.text}"`);
            return {
              input,
              status: RecognitionStatus.AMBIGUOUS,
              confidence: 0.5,
              canonical: null,
              candidates: [],
              requiredDisambiguation: [
                `We need the character name. Who did "${input}" play in "${ref.text}"?`,
              ],
              needsClarification: true,
              clarificationReason: 'actor_character_unknown',
              inputWasActor: true,
              referenceText: ref.text,
              normalization: { cleanedInput: inputLower, detectedHints: [] },
            };
          }
          
          // For non-actor cases, hard fail in STRICT mode
          console.log(`[Recognition] STRICT mode failure for "${input}" - no match in reference "${ref.text}"`);
          return {
            input,
            status: RecognitionStatus.NOT_RECOGNIZED,
            confidence: 0.0,
            canonical: null,
            candidates: [],
            requiredDisambiguation: [
              match?.clarificationMessage || `Could not find "${input}" in "${ref.text}".`,
              'Please specify the character name directly.',
            ],
            failureReason: 'UNRECOGNIZED_IN_REFERENCE',
            needsClarification: true,
            clarificationReason: match?.clarificationReason || 'reference_mismatch',
            referenceText: ref.text,
            normalization: { cleanedInput: inputLower, detectedHints: [] },
          };
        }
      }

      // Handle AI asking for clarification
      if (match?.needsClarification) {
        console.log(`[Recognition] AI requests clarification for "${input}": ${match.clarificationReason}`);
        return {
          input,
          status: match.recognized ? RecognitionStatus.AMBIGUOUS : RecognitionStatus.NOT_RECOGNIZED,
          confidence: match.confidence || 0.5,
          canonical: match.name ? {
            canonicalId: `char_${(match.name || input).toLowerCase().replace(/\s+/g, '_')}`,
            name: match.name,
            franchise: match.franchise || 'Unknown',
            medium: match.medium || 'unknown',
          } : null,
          candidates: [],
          requiredDisambiguation: [
            match.clarificationMessage || 'Please provide more details about this character.',
          ],
          needsClarification: true,
          clarificationReason: match.clarificationReason,
          inputWasActor: match.inputWasActor || false,
          referenceNote: match.referenceNote,
          normalization: { cleanedInput: inputLower, detectedHints: [] },
        };
      }

      if (!match || !match.recognized) {
        // AI says not recognized - ask for clarification
        return {
          input,
          status: RecognitionStatus.NOT_RECOGNIZED,
          confidence: 0.0,
          canonical: null,
          candidates: [],
          requiredDisambiguation: [
            match?.clarificationMessage || `Couldn't recognize "${input}" confidently.`,
            'Please add more context (show/movie name) or check the spelling.',
          ],
          needsClarification: true,
          clarificationReason: match?.clarificationReason || 'not_recognized',
          normalization: { cleanedInput: inputLower, detectedHints: [] },
        };
      }

      const confidence = match.confidence || 0.85;
      const matchesReference = match.matchesReference ?? true;
      
      // Check if AI says confidence is too low
      if (match.needsClarification || confidence < 0.65) {
        console.log(`[Recognition] Low confidence or needs clarification for "${input}": ${confidence}`);
        return {
          input,
          status: RecognitionStatus.AMBIGUOUS,
          confidence,
          canonical: match.name ? {
            canonicalId: `char_${(match.name || input).toLowerCase().replace(/\s+/g, '_')}`,
            name: match.name,
            franchise: match.franchise || 'Unknown',
            medium: match.medium || 'unknown',
          } : null,
          candidates: [],
          requiredDisambiguation: [
            match.clarificationMessage || `Low confidence for "${input}". Please confirm or provide more details.`,
          ],
          needsClarification: true,
          clarificationReason: match.clarificationReason || 'low_confidence',
          normalization: { cleanedInput: inputLower, detectedHints: [] },
        };
      }
      
      // For ASSISTIVE mode with mismatch, mark for clarification
      const entryReferenceMismatch = limitMode === 'ASSISTIVE' && ref?.text && matchesReference === false;
      
      if (entryReferenceMismatch) {
        console.log(`[Recognition] ASSISTIVE mode mismatch for "${input}" - top match doesn't align with reference "${ref.text}"`);
      }
      
      return {
        input,
        status: confidence >= 0.65 ? RecognitionStatus.RECOGNIZED : RecognitionStatus.AMBIGUOUS,
        confidence,
        canonical: {
          canonicalId: `char_${(match.name || input).toLowerCase().replace(/\s+/g, '_')}`,
          name: match.name || input,
          franchise: match.franchise || 'Unknown',
          medium: match.medium || 'unknown',
          portrayal: match.portrayal || null,
        },
        candidates: [],
        requiredDisambiguation: [],
        entryReferenceMismatch,
        referenceNote: match.referenceNote,
        normalization: {
          cleanedInput: inputLower,
          detectedHints: [],
        },
      };
    });

  } catch (error) {
    console.error('[Recognition] Batch recognition error:', error.message);
    
    // If rate limited, return helpful error
    if (error.status === 429) {
      console.error('[Recognition] Rate limited - waiting and retrying once...');
      await new Promise(resolve => setTimeout(resolve, 21000));
      return recognizeCharactersBatch(inputs, referenceHints);
    }
    
    return inputs.map(input => createNotRecognizedResult(input, error.message));
  }
}

/**
 * Normalize input string
 */
function normalizeInput(input) {
  const original = input.trim();
  const cleaned = original
    .toLowerCase()
    .replace(/[^\w\s()]/g, ' ') // Remove special chars except parentheses
    .replace(/\s+/g, ' ')
    .trim();

  // Extract hints from parentheses
  const hintMatch = original.match(/\(([^)]+)\)/);
  const hints = hintMatch ? extractHints(hintMatch[1]) : [];

  return {
    original,
    cleaned,
    hints,
  };
}

/**
 * Extract hints (actor, era, director, etc.)
 */
function extractHints(hintText) {
  const hints = [];
  const lower = hintText.toLowerCase();
  
  // Common patterns
  if (lower.includes('actor') || lower.includes('played by')) {
    hints.push({ type: 'actor', value: hintText });
  }
  if (lower.includes('era') || lower.includes('season') || lower.includes('director')) {
    hints.push({ type: 'era', value: hintText });
  }
  if (lower.includes('movie') || lower.includes('film')) {
    hints.push({ type: 'medium', value: 'film' });
  }
  if (lower.includes('tv') || lower.includes('show') || lower.includes('series')) {
    hints.push({ type: 'medium', value: 'tv' });
  }
  
  return hints;
}

/**
 * Retrieve candidates using AI
 */
async function retrieveCandidates(normalized) {
  const client = getOpenAIClient();
  if (!client) {
    console.warn('[Recognition] No OpenAI API key - cannot retrieve candidates');
    // Fallback: return empty candidates (will be NOT_RECOGNIZED)
    return [];
  }

  try {
    console.log(`[Recognition] Retrieving candidates for: "${normalized.cleaned}"`);
    const prompt = `You are a recognition expert. For the input "${normalized.cleaned}", find matches from:

FICTIONAL SOURCES:
- TV shows and series
- Movies and films  
- Books and literature
- Mythology and folklore
- Comics and graphic novels

REAL-LIFE SOURCES:
- Contemporary public figures (politicians, celebrities, business leaders, athletes)
- Historical figures (philosophers, leaders, scientists, artists)

${normalized.hints.length > 0 ? `Hints provided: ${normalized.hints.map(h => h.value).join(', ')}` : ''}

IMPORTANT: If the input is clearly NOT a character or person (product, object, household item like "tea cup", "air purifier", "uncle chips", etc.), return an empty array.

Return JSON in this format:
{
  "candidates": [
    {
      "canonicalId": "unique_stable_id",
      "name": "Name",
      "franchise": "Franchise/Universe OR 'Public Figure' OR 'Historical Figure'",
      "medium": "film|tv|book|mythology|real-life|historical",
      "portrayal": "Actor/Era if applicable",
      "description": "Brief 2-3 line description",
      "aliases": ["alternative names"],
      "matchScore": 0.0-1.0
    }
  ]
}

Return up to 10 best candidates. 

HIGH CONFIDENCE MATCHES (matchScore 0.90-0.95):
- Fictional: Ethan Hunt, Spider-Man, James Bond, Gandalf, Sherlock Holmes, Hermione Granger, Neo
- Contemporary: Donald Trump, Elon Musk, Taylor Swift, Putin, Obama, LeBron James
- Historical: Plato, Aristotle, Einstein, Gandhi, Napoleon, Lincoln, Shakespeare, Tesla

For real-life figures:
- Use franchise="Public Figure" and medium="real-life" for contemporary
- Use franchise="Historical Figure" and medium="historical" for historical`;

    const response = await client.chat.completions.create({
      // Recognition is short, non-symbolic - gpt-4o-mini is acceptable here
      // Only used for candidate reranking and disambiguation prompts
      model: process.env.OPENAI_RECOGNITION_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a character recognition expert. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content.trim();
    let jsonContent = content;
    
    // Handle markdown code blocks
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonContent = match[1];
      }
    }
    
    let parsed;
    try {
      parsed = safeParseJSON(jsonContent, 'RecognitionEngine.recognizeSingle');
      if (!parsed || Object.keys(parsed).length === 0) {
        throw new Error('Empty result from safeParseJSON');
      }
    } catch (parseError) {
      console.error('[Recognition] JSON parse error:', parseError);
      console.error('[Recognition] Content:', jsonContent.substring(0, 500));
      return [];
    }
    
    // Handle different response formats
    let candidates = [];
    if (Array.isArray(parsed)) {
      candidates = parsed;
    } else if (parsed.candidates && Array.isArray(parsed.candidates)) {
      candidates = parsed.candidates;
    } else if (parsed.results && Array.isArray(parsed.results)) {
      candidates = parsed.results;
    } else if (parsed.characters && Array.isArray(parsed.characters)) {
      candidates = parsed.characters;
    }

    const result = candidates.slice(0, 10);
    console.log(`[Recognition] Retrieved ${result.length} candidates for "${normalized.cleaned}"`);
    return result;
  } catch (error) {
    console.error('[Recognition] Error retrieving candidates:', error);
    console.error('[Recognition] Error details:', error.message);
    return [];
  }
}

/**
 * Rerank candidates using cross-encoder approach (LLM-based scoring)
 */
async function rerankCandidates(normalized, candidates) {
  if (candidates.length === 0) {
    return [];
  }

  if (candidates.length <= 3) {
    // No need to rerank if few candidates
    return candidates;
  }

  const client = getOpenAIClient();
  if (!client) {
    return candidates;
  }

  try {
    const prompt = `Rerank these character candidates for input "${normalized.cleaned}" by relevance:

Candidates:
${candidates.map((c, i) => `${i + 1}. ${c.name} (${c.franchise}, ${c.medium})${c.portrayal ? ` - ${c.portrayal}` : ''}`).join('\n')}

${normalized.hints.length > 0 ? `Hints: ${normalized.hints.map(h => h.value).join(', ')}` : ''}

Return JSON with reranked order:
{
  "ranked": [1, 2, 3, ...] // indices in order of relevance
}

Consider: exact name match, alias match, hint alignment, medium match.`;

    const response = await client.chat.completions.create({
      // Recognition is short, non-symbolic - gpt-4o-mini is acceptable here
      // Only used for candidate reranking and disambiguation prompts
      model: process.env.OPENAI_RECOGNITION_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a character ranking expert. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0].message.content.trim();
    const parsed = safeParseJSON(content, 'RecognitionEngine.rankCandidates');
    
    if (parsed.ranked && Array.isArray(parsed.ranked)) {
      const reranked = parsed.ranked
        .map(idx => candidates[idx - 1])
        .filter(Boolean);
      return reranked.length > 0 ? reranked : candidates;
    }
  } catch (error) {
    console.error('[Recognition] Error reranking:', error);
  }

  return candidates;
}

/**
 * Score confidence for candidates
 */
function scoreConfidence(normalized, candidates) {
  if (candidates.length === 0) {
    return [];
  }

  return candidates.map((candidate, index) => {
    let score = candidate.matchScore || 0.5;
    
    // Exact name match bonus
    if (candidate.name.toLowerCase() === normalized.cleaned) {
      score += 0.3;
    }
    
    // Alias match bonus
    if (candidate.aliases && Array.isArray(candidate.aliases)) {
      const aliasMatch = candidate.aliases.some(alias => 
        alias.toLowerCase() === normalized.cleaned
      );
      if (aliasMatch) {
        score += 0.2;
      }
    }
    
    // Hint alignment bonus
    if (normalized.hints.length > 0) {
      const hintText = normalized.hints.map(h => h.value.toLowerCase()).join(' ');
      if (candidate.portrayal && candidate.portrayal.toLowerCase().includes(hintText)) {
        score += 0.15;
      }
      if (candidate.franchise && candidate.franchise.toLowerCase().includes(hintText)) {
        score += 0.1;
      }
    }
    
    // Position penalty (lower rank = lower score)
    score -= index * 0.05;
    
    return {
      ...candidate,
      confidence: Math.min(1.0, Math.max(0.0, score)),
      rank: index + 1,
    };
  });
}

/**
 * Create recognition result based on confidence scores
 */
function createRecognitionResult(normalized, scored) {
  if (scored.length === 0) {
    return createNotRecognizedResult(normalized.original, 'No candidates found');
  }

  const top1 = scored[0];
  const top2 = scored[1];
  
  const confidence = top1.confidence || 0.0;
  const gap = top2 ? ((top1.confidence || 0.0) - (top2.confidence || 0.0)) : (top1.confidence || 0.0);

  console.log(`[Recognition] Confidence scoring for "${normalized.cleaned}": top1=${confidence.toFixed(2)}, gap=${gap.toFixed(2)}`);

  // Thresholds - adjusted to be more lenient for well-known characters
  // If top candidate has high matchScore from AI, trust it more
  const aiMatchScore = top1.matchScore || 0;
  const adjustedConfidence = aiMatchScore > 0.7 ? Math.max(confidence, aiMatchScore) : confidence;
  
  if (adjustedConfidence >= 0.70 && (gap >= 0.08 || aiMatchScore > 0.8)) {
    // RECOGNIZED - lowered threshold from 0.78 to 0.70 for better recognition
    return {
      status: RecognitionStatus.RECOGNIZED,
      confidence: adjustedConfidence,
      canonical: {
        canonicalId: top1.canonicalId || `char_${top1.name.toLowerCase().replace(/\s+/g, '_')}`,
        name: top1.name,
        franchise: top1.franchise || 'Unknown',
        medium: top1.medium || 'unknown',
        portrayal: top1.portrayal || null,
      },
      candidates: [],
      requiredDisambiguation: [],
      normalization: {
        cleanedInput: normalized.cleaned,
        detectedHints: normalized.hints.map(h => h.value),
      },
    };
  } else if (adjustedConfidence >= 0.50 || gap < 0.08) {
    // AMBIGUOUS - lowered threshold from 0.55 to 0.50
    const topCandidates = scored.slice(0, 5).map(c => ({
      canonicalId: c.canonicalId || `char_${c.name.toLowerCase().replace(/\s+/g, '_')}`,
      name: c.name,
      franchise: c.franchise || 'Unknown',
      medium: c.medium || 'unknown',
      portrayal: c.portrayal || null,
    }));

    return {
      status: RecognitionStatus.AMBIGUOUS,
      confidence: adjustedConfidence,
      canonical: null,
      candidates: topCandidates,
      requiredDisambiguation: generateDisambiguationPrompts(topCandidates),
      normalization: {
        cleanedInput: normalized.cleaned,
        detectedHints: normalized.hints.map(h => h.value),
      },
    };
  } else {
    // NOT_RECOGNIZED
    return createNotRecognizedResult(normalized.original, `Low confidence (${confidence.toFixed(2)})`);
  }
}

/**
 * Create NOT_RECOGNIZED result
 */
function createNotRecognizedResult(original, reason) {
  return {
    input: original, // Preserve original input for resonance engine
    status: RecognitionStatus.NOT_RECOGNIZED,
    confidence: 0.0,
    canonical: null,
    candidates: [],
    requiredDisambiguation: [
      `I couldn't recognize "${original}" confidently.`,
      'Please add the show/movie name in parentheses, check spelling, or pick a known character.',
    ],
    normalization: {
      cleanedInput: original.toLowerCase().trim(),
      detectedHints: [],
    },
  };
}

/**
 * Generate disambiguation prompts
 */
function generateDisambiguationPrompts(candidates) {
  const prompts = [
    'Which one did you mean?',
  ];
  
  if (candidates.length > 0) {
    const mediums = [...new Set(candidates.map(c => c.medium))];
    if (mediums.length > 1) {
      prompts.push('From which medium (movie/TV/book)?');
    }
    
    const franchises = [...new Set(candidates.map(c => c.franchise).filter(Boolean))];
    if (franchises.length > 1) {
      prompts.push('From which franchise/series?');
    }
  }
  
  return prompts;
}
