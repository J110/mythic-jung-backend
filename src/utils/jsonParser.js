/**
 * Safe JSON Parser Utility
 * 
 * Handles malformed JSON from LLM responses with cleanup and fallbacks.
 */

/**
 * Safely parse JSON with cleanup and error handling
 * @param {string} content - Raw content to parse
 * @param {string} context - Context for error logging
 * @returns {Object} Parsed JSON or empty object
 */
export function safeParseJSON(content, context = 'Unknown') {
  if (!content) {
    console.warn(`[JSONParser] Empty content in ${context}`);
    return {};
  }

  // Try direct parse first
  try {
    return JSON.parse(content);
  } catch (e) {
    // Continue to cleanup
  }

  // Clean up common issues
  let cleaned = content;
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // Try to extract JSON object from text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Fix common JSON issues
  // 1. Trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  
  // 2. Single quotes to double quotes (careful with apostrophes)
  // Only replace single quotes that look like string delimiters
  cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"');
  cleaned = cleaned.replace(/\[\s*'([^']*)'/g, '[ "$1"');
  
  // 3. Unquoted keys
  cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
  
  // 4. Fix newlines in strings
  cleaned = cleaned.replace(/\n/g, '\\n');
  cleaned = cleaned.replace(/\r/g, '\\r');
  cleaned = cleaned.replace(/\t/g, '\\t');
  
  // Try parsing cleaned content
  try {
    return JSON.parse(cleaned);
  } catch (e2) {
    console.error(`[JSONParser] Failed to parse in ${context}:`, e2.message);
    console.error(`[JSONParser] Content preview: ${content.substring(0, 500)}...`);
    
    // Return empty object as last resort
    return {};
  }
}

/**
 * Parse JSON with a fallback value
 * @param {string} content - Raw content to parse
 * @param {Object} fallback - Fallback value if parsing fails
 * @param {string} context - Context for error logging
 * @returns {Object} Parsed JSON or fallback
 */
export function parseJSONWithFallback(content, fallback, context = 'Unknown') {
  const result = safeParseJSON(content, context);
  
  // If result is empty and fallback provided, use fallback
  if (Object.keys(result).length === 0 && fallback) {
    console.warn(`[JSONParser] Using fallback for ${context}`);
    return fallback;
  }
  
  return result;
}

/**
 * Extract JSON from a response that might contain text before/after
 * @param {string} content - Raw content
 * @returns {string} Extracted JSON string
 */
export function extractJSON(content) {
  if (!content) return '{}';
  
  // Try to find JSON object
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];
  
  // Try to find JSON array
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  
  return content;
}
