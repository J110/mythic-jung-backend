import { generateWithLLM } from './llmGenerator.js';
import { generateMockOutput } from './mockGenerator.js';
import { generateIntelligentOutput } from './intelligentGenerator.js';

/**
 * Generate output based on user profile and assessments
 * @param {Object} userData - User data with profile, assessments, and optional characterReferences
 * @param {Object} options - Generation options (force, etc.)
 */
export async function generateOutput(userData, options = {}) {
  const useLLM = process.env.USE_LLM_GENERATION === 'true' && process.env.OPENAI_API_KEY;

  if (useLLM) {
    console.log('Using LLM generation');
    return generateWithLLM(userData);
  }

  // Use intelligent generator by default (5-engine pipeline with Example Engine)
  // Pass character references from Resonance Engine if available
  console.log('Using intelligent 5-engine generation pipeline (includes Example Engine)');
  return generateIntelligentOutput(userData, {
    ...options,
    characterReferences: userData.characterReferences || [],
  });
}
