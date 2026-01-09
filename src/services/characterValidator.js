/**
 * Character Validator
 * Detects if characters are meaningful or just junk values
 * Only meaningful characters should be processed deeply
 */

/**
 * Check if a character name is meaningful (not junk)
 */
export function isMeaningfulCharacter(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  const trimmed = name.trim();
  
  // Too short to be meaningful (single letter or very short)
  if (trimmed.length <= 1) {
    return false;
  }
  
  // Check if it's just a single letter (like "a", "b", "c")
  if (trimmed.length === 1 && /^[a-z]$/i.test(trimmed)) {
    return false;
  }
  
  // Check if it's a pattern of single letters separated by commas or spaces
  // (like "a, b, c" or "a b c")
  const singleLetterPattern = /^[a-z]([\s,]+[a-z])*$/i;
  if (singleLetterPattern.test(trimmed)) {
    return false;
  }
  
  // Check if it's just numbers
  if (/^\d+$/.test(trimmed)) {
    return false;
  }
  
  // Check if it's a common junk pattern
  const junkPatterns = [
    /^test$/i,
    /^junk$/i,
    /^placeholder$/i,
    /^abc$/i,
    /^xyz$/i,
    /^123$/i,
  ];
  
  for (const pattern of junkPatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  
  // Check if it looks like a food dish (common food keywords)
  const foodKeywords = [
    /\b(aloo|gobhi|baigan|bharta|roti|paratha|sushi|cake|chocolate|curry|rice|bread|pasta|pizza|burger|sandwich|salad|soup|stew|fry|fried|grilled|baked|boiled|dish|recipe|food|meal|cuisine|ingredient)\b/i,
  ];
  
  for (const pattern of foodKeywords) {
    if (pattern.test(trimmed)) {
      return false; // Looks like a food dish, not a character
    }
  }
  
  // Check if it looks like a product/brand
  const productKeywords = [
    /\b(shampoo|soap|cream|lotion|product|brand|sulpher|sulphur)\b/i,
  ];
  
  for (const pattern of productKeywords) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  
  // Check if it's too generic (common words that aren't character names)
  const genericWords = [
    /^(the|a|an|this|that|these|those)$/i,
    /^(person|people|character|hero|villain)$/i,
  ];
  
  for (const pattern of genericWords) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }
  
  // Must have at least 3 characters to be a real character name
  if (trimmed.length < 3) {
    return false;
  }
  
  // Real character names typically have proper noun structure
  // (start with capital or have multiple words, or contain name-like patterns)
  const hasProperNounStructure = /^[A-Z]/.test(trimmed) || 
                                  trimmed.split(/\s+/).length > 1 ||
                                  /[A-Z][a-z]+/.test(trimmed); // Has capital letter followed by lowercase
  
  return hasProperNounStructure;
}

/**
 * Validate all characters in a set
 */
export function validateCharacters(characters) {
  if (!characters || !Array.isArray(characters)) {
    return {
      valid: false,
      reason: 'Characters must be an array',
      meaningfulCount: 0,
      totalCount: 0,
    };
  }
  
  if (characters.length === 0) {
    return {
      valid: false,
      reason: 'No characters provided',
      meaningfulCount: 0,
      totalCount: 0,
    };
  }
  
  const meaningful = characters.filter(char => {
    const name = char.displayName || char.id || '';
    return isMeaningfulCharacter(name);
  });
  
  const meaningfulCount = meaningful.length;
  const totalCount = characters.length;
  
  // Require at least 4 meaningful characters (out of 6)
  // This allows for some edge cases but rejects obvious junk
  if (meaningfulCount < 4) {
    return {
      valid: false,
      reason: `Only ${meaningfulCount} out of ${totalCount} characters are meaningful. Please provide real character names.`,
      meaningfulCount,
      totalCount,
      meaningfulCharacters: meaningful.map(c => c.displayName || c.id),
    };
  }
  
  return {
    valid: true,
    meaningfulCount,
    totalCount,
    meaningfulCharacters: meaningful.map(c => c.displayName || c.id),
  };
}

/**
 * Check if characters look like junk values
 */
export function looksLikeJunk(characters) {
  if (!characters || !Array.isArray(characters)) {
    return true;
  }
  
  // Check if all characters are single letters
  const allSingleLetters = characters.every(char => {
    const name = (char.displayName || char.id || '').trim();
    return name.length === 1 && /^[a-z]$/i.test(name);
  });
  
  if (allSingleLetters) {
    return true;
  }
  
  // Check if characters are sequential letters (a, b, c, d, e, f)
  const names = characters.map(c => (c.displayName || c.id || '').trim().toLowerCase());
  if (names.length >= 3) {
    const isSequential = names.every((name, index) => {
      if (name.length !== 1) return false;
      const expected = String.fromCharCode(97 + index); // 'a' = 97
      return name === expected;
    });
    
    if (isSequential) {
      return true;
    }
  }
  
  return false;
}
