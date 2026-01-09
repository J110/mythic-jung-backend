# AI-Based Character Validation

## Overview

The system now uses **AI (OpenAI)** to validate if characters are real characters from TV, movies, books, mythology, or real life. This is much more robust than hardcoded pattern matching.

## How It Works

1. **AI Recognition**: When characters are submitted, the system uses OpenAI GPT-4o-mini to check if each character is recognized
2. **Validation**: At least 4 out of 6 characters must be recognized as real characters
3. **User-Friendly Errors**: If validation fails, users get helpful suggestions on what to provide

## API Requirements

- Requires `OPENAI_API_KEY` environment variable
- Falls back to basic validation if API key is not available

## Error Messages

When characters aren't recognized, users see:
- Clear message: "The characters you entered are not recognized"
- Helpful suggestions: Examples of valid character sources (TV, movies, books, etc.)
- List of unrecognized characters

## Benefits

- ✅ No hardcoded patterns (works for any type of junk)
- ✅ Recognizes real characters from any source
- ✅ Provides helpful feedback to users
- ✅ Scalable and maintainable

## Testing

To test, try entering:
- Junk values: "a, b, c, d, e, f" → Should be rejected
- Food dishes: "aloo gobhi, chocolate cake" → Should be rejected  
- Real characters: "Jack Reacher, Aragorn" → Should be accepted
