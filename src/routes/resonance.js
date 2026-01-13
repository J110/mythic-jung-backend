/**
 * Resonance API Routes
 * 
 * Handles character clarification and phase selection
 */

import express from 'express';
import { analyzeAllCharacters, processResonanceChoices } from '../services/resonanceEngine.js';
import { recognizeCharacters } from '../services/characterRecognitionEngine.js';
import { memoryStore } from '../storage/memoryStore.js';

export const resonanceRouter = express.Router();

const getUserId = (req) => req.headers['x-user-id'] || 'default-user';

/**
 * POST /v1/resonance/analyze
 * 
 * Analyze characters for ambiguity and return clarification options
 * Called after character entry, before proceeding to generation
 * 
 * Supports two modes:
 * - Legacy: { characterInputs: ['name1', 'name2', ...] }
 * - With References: { characterInputs: [...], slots: [{ slotId, rawName, referenceText, referenceType, limitMode }, ...] }
 */
resonanceRouter.post('/analyze', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { characterInputs, slots } = req.body;
    
    if (!characterInputs || !Array.isArray(characterInputs) || characterInputs.length < 4) {
      return res.status(400).json({
        error: 'At least 4 character inputs required',
        code: 'INSUFFICIENT_CHARACTERS',
      });
    }
    
    // Build reference hints from slots if provided
    const referenceHints = (slots || []).reduce((acc, slot) => {
      // Debug: Log what we receive
      console.log(`[Resonance] Slot: rawName="${slot.rawName}", referenceText="${slot.referenceText}" (type: ${typeof slot.referenceText})`);
      
      // Handle null, undefined, or empty reference text
      const refText = slot.referenceText;
      if (refText && typeof refText === 'string' && refText.trim() !== '') {
        acc[slot.rawName] = {
          text: refText.trim(),
          type: slot.referenceType || 'OTHER',
          limitMode: slot.limitMode || 'ASSISTIVE',
        };
        console.log(`[Resonance] ✓ Added reference for "${slot.rawName}": "${refText.trim()}"`);
      } else {
        console.log(`[Resonance] ✗ No valid reference for "${slot.rawName}" (value: ${JSON.stringify(refText)})`);
      }
      return acc;
    }, {});
    
    const hasReferences = Object.keys(referenceHints).length > 0;
    console.log(`[Resonance] Analyzing ${characterInputs.length} characters for user ${userId}`);
    console.log(`[Resonance] Slots received:`, slots?.length || 0);
    console.log(`[Resonance] characterInputs:`, characterInputs);
    if (hasReferences) {
      console.log(`[Resonance] Reference hints built:`, JSON.stringify(referenceHints, null, 2));
    } else {
      console.log(`[Resonance] NO references found. Slots:`, JSON.stringify(slots?.slice(0, 2), null, 2));
    }
    
    // ENHANCE inputs with references - embed references into input strings for better AI recognition
    // This mirrors what re-recognition does: "Allison (from: Yes Man 2008)"
    const enhancedInputs = characterInputs.map(input => {
      const ref = referenceHints[input];
      if (ref && ref.text) {
        const enhanced = `${input} (from: ${ref.text})`;
        console.log(`[Resonance] ✓ Enhanced input: "${input}" → "${enhanced}"`);
        return enhanced;
      }
      console.log(`[Resonance] ✗ No reference for input "${input}", using as-is`);
      return input;
    });
    
    // Build enhanced reference hints with the new keys
    const enhancedReferenceHints = {};
    characterInputs.forEach((originalInput, i) => {
      const ref = referenceHints[originalInput];
      if (ref) {
        enhancedReferenceHints[enhancedInputs[i]] = ref;
      }
    });
    
    // Step 1: Recognize characters (with enhanced inputs that include references)
    const recognitionResult = await recognizeCharacters(enhancedInputs, enhancedReferenceHints);
    
    // Map recognition results back to ORIGINAL inputs (not enhanced)
    // This ensures downstream code works correctly with the original character names
    const recognizedCharacters = recognitionResult.results.map((result, i) => {
      const originalInput = characterInputs[i];
      const enhancedInput = enhancedInputs[i];
      
      // If the input was enhanced, restore the original
      if (result.input !== originalInput) {
        console.log(`[Resonance] Mapping result back: "${result.input}" → "${originalInput}"`);
        return {
          ...result,
          input: originalInput,
          enhancedInput: enhancedInput, // Keep for reference
        };
      }
      return result;
    });
    
    // Check minimum recognized
    const validCount = recognizedCharacters.filter(c => c.status === 'RECOGNIZED').length;
    
    // Check for STRICT mode failures
    const strictFailures = recognizedCharacters.filter(c => 
      c.status === 'NOT_RECOGNIZED' && c.failureReason === 'UNRECOGNIZED_IN_REFERENCE'
    );
    
    if (strictFailures.length > 0) {
      console.log(`[Resonance] STRICT mode failures:`, strictFailures.map(f => f.input));
    }
    
    if (validCount < 4) {
      // Build helpful error message
      let errorMsg = `Only ${validCount} characters recognized. Need at least 4.`;
      if (strictFailures.length > 0) {
        errorMsg += ` ${strictFailures.length} character(s) not found in their specified reference.`;
      }
      
      return res.status(400).json({
        error: errorMsg,
        code: 'INSUFFICIENT_RECOGNIZED',
        recognitionResult,
        strictFailures: strictFailures.map(f => ({
          input: f.input,
          referenceText: referenceHints[f.input]?.text,
          message: 'No strong matches found in your reference. Try adding more details (movie name, year, character full name).',
        })),
      });
    }
    
    // Step 2: Analyze for ambiguity (considering reference hints)
    const ambiguityAnalysis = await analyzeAllCharacters(recognizedCharacters, referenceHints);
    
    // Store recognition result temporarily for the clarification flow
    memoryStore.saveTempResonanceData(userId, {
      recognizedCharacters,
      ambiguityAnalysis,
      referenceHints, // Store for downstream use
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[Resonance] Analysis complete for user ${userId}. Needs clarification: ${ambiguityAnalysis.needsClarification}`);
    
    // Build response with clarification info
    const responseCharacters = ambiguityAnalysis.characters.map(c => {
      const entryRef = referenceHints[c.input];
      const isReferenceMismatch = entryRef && c.entryReferenceMismatch;
      
      // Get franchise/medium from the recognized character
      const recognizedChar = recognizedCharacters.find(rc => rc.input === c.input);
      const franchise = c.franchise || recognizedChar?.canonical?.franchise;
      const medium = c.medium || recognizedChar?.canonical?.medium || null;
      const charName = c.characterName || recognizedChar?.canonical?.name || c.input;
      
      // Determine clarification message
      let clarificationMessage = c.clarificationMessage;
      if (!clarificationMessage && isReferenceMismatch) {
        clarificationMessage = 'The match does not align with your reference. Please confirm or provide the character name.';
      }
      if (!clarificationMessage && c.aiNeedsClarification) {
        clarificationMessage = 'We need more details to identify this character. Please specify the character name.';
      }
      
      return {
        input: c.input,
        characterName: charName,
        canonicalId: c.canonicalId,
        needsClarification: c.needsClarification || isReferenceMismatch || c.aiNeedsClarification,
        disambiguationReason: c.disambiguationReason || c.reason,
        // Clarification details
        clarificationMessage: clarificationMessage,
        aiNeedsClarification: c.aiNeedsClarification || false,
        inputWasActor: c.inputWasActor || recognizedChar?.inputWasActor || false,
        // FRANCHISE/MEDIUM INFO - always include (might be null if unknown)
        franchise: franchise || null,
        medium: medium,
        referenceDescription: c.referenceDescription || (franchise 
          ? `${charName} from ${franchise}${medium ? ` (${medium})` : ''}`
          : `${charName} - please confirm`),
        // Entry reference info
        hasEntryReference: !!entryRef,
        entryReferenceText: entryRef?.text,
        entryReferenceMismatch: isReferenceMismatch,
        entryReferenceMismatchMessage: isReferenceMismatch 
          ? 'Top match does not match your reference. Please confirm or select an alternative.'
          : null,
        // Version options (show reference-matching first)
        versionOptions: c.versionOptions || [],
        // Phase options
        phaseOptions: c.phaseOptions || [],
        // Alternative candidates (if reference-based, show reference matches first)
        alternativeCandidates: c.alternativeCandidates || [],
        // Whether to show arc exclusion section
        showExclusionSection: c.showExclusionSection || false,
      };
    });
    
    res.json({
      success: true,
      needsClarification: ambiguityAnalysis.needsClarification || responseCharacters.some(c => c.entryReferenceMismatch),
      characters: responseCharacters,
      recognitionSummary: {
        total: characterInputs.length,
        recognized: validCount,
        needsClarification: responseCharacters.filter(c => c.needsClarification).length,
        withEntryReferences: Object.keys(referenceHints).length,
        referenceMismatches: responseCharacters.filter(c => c.entryReferenceMismatch).length,
      },
    });
  } catch (error) {
    console.error('[Resonance] Analysis error:', error);
    next(error);
  }
});

/**
 * POST /v1/resonance/confirm
 * 
 * Confirm character selections with optional clarifications
 * This finalizes the character set and allows generation to proceed
 * 
 * Now accepts meCount and relationshipEnabled to properly split Me vs Relationship characters
 */
resonanceRouter.post('/confirm', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { 
      clarifications, 
      meCount = 4,           // Number of "Me" characters (first N)
      relationshipEnabled = false,
      relationshipType = 'platonic'
    } = req.body;
    
    // Retrieve the stored recognition data
    const tempData = memoryStore.getTempResonanceData(userId);
    if (!tempData) {
      return res.status(400).json({
        error: 'No pending resonance analysis. Call /analyze first.',
        code: 'NO_PENDING_ANALYSIS',
      });
    }
    
    const { recognizedCharacters, referenceHints } = tempData;
    
    // Process clarifications (or use defaults if skipped)
    const clarificationArray = clarifications || recognizedCharacters.map(() => ({
      referenceMode: 'NONE',
      referenceTags: [],
      referenceText: null,
    }));
    
    // Enhance characters with reference data
    const enhancedCharacters = processResonanceChoices(recognizedCharacters, clarificationArray);
    
    // Build the final character set with references
    const characterSet = enhancedCharacters
      .filter(c => c.status === 'RECOGNIZED')
      .map(c => ({
        input: c.input,
        canonical: c.canonical,
        confidence: c.confidence,
        reference: c.reference,
      }));
    
    // Split into Me and Relationship characters
    const meCharacters = characterSet.slice(0, meCount);
    const relationshipCharacters = relationshipEnabled ? characterSet.slice(meCount) : [];
    
    console.log(`[Resonance] Split: ${meCharacters.length} Me characters, ${relationshipCharacters.length} Relationship characters`);
    
    // Save Me character references
    const meReferences = meCharacters.map(c => c.reference);
    memoryStore.saveCharacterReferences(userId, meReferences);
    
    // Save Relationship character references (including full recognition data)
    if (relationshipEnabled && relationshipCharacters.length >= 4) {
      console.log(`[Resonance] Saving ${relationshipCharacters.length} relationship characters`);
      console.log(`[Resonance] Relationship characters: ${relationshipCharacters.map(c => c.canonical?.name).join(', ')}`);
      
      // Store full recognition results for relationship characters
      // This prevents re-recognition in the relationship engine
      memoryStore.saveRelationshipCharacterReferences(userId, relationshipCharacters);
      
      // Also build reference hints for relationship characters (in case re-recognition is needed)
      const relationshipReferenceHints = {};
      relationshipCharacters.forEach(c => {
        if (referenceHints?.[c.input]) {
          relationshipReferenceHints[c.input] = referenceHints[c.input];
        }
      });
      
      // Update relationship set with reference hints
      const existingSet = memoryStore.getRelationshipSet(userId);
      if (existingSet) {
        memoryStore.saveRelationshipSet(userId, {
          ...existingSet,
          referenceHints: relationshipReferenceHints,
        });
      }
    }
    
    // Clear temp data
    memoryStore.clearTempResonanceData(userId);
    
    // Clear cached outputs to force regeneration with new references
    memoryStore.clearOutput(userId);
    memoryStore.clearRelationshipOutput(userId);
    
    console.log(`[Resonance] Confirmed ${characterSet.length} characters for user ${userId}`);
    console.log(`[Resonance] Stored ${meReferences.filter(r => r?.mode !== 'NONE').length} Me reference constraints`);
    
    res.json({
      success: true,
      characterSet,
      meCount: meCharacters.length,
      relationshipCount: relationshipCharacters.length,
      message: 'Characters confirmed. Ready for profile generation.',
    });
  } catch (error) {
    console.error('[Resonance] Confirmation error:', error);
    next(error);
  }
});

/**
 * POST /v1/resonance/rerecognize
 * 
 * Re-recognize a single character that was incorrectly identified.
 * User can optionally provide a corrected name or hint.
 * Supports comma-separated references (e.g., "Don, Fashion" for multiple movie references).
 */
resonanceRouter.post('/rerecognize', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { 
      characterIndex,      // Index of the character in the original list
      originalInput,       // Original input string
      correctedInput,      // Optional: user-provided correction (e.g., "Lara Axelrod from Billions")
      hint,                // Optional: additional hint (e.g., "Don, Fashion" or "Billions TV show")
    } = req.body;
    
    if (characterIndex === undefined || !originalInput) {
      return res.status(400).json({
        error: 'characterIndex and originalInput are required',
        code: 'MISSING_PARAMS',
      });
    }
    
    let tempData = memoryStore.getTempResonanceData(userId);
    
    // If no temp data, try to recreate from stored profile
    if (!tempData) {
      console.log('[Resonance] No temp data found, attempting to recreate from profile...');
      const profile = memoryStore.getProfile(userId);
      
      if (!profile?.characters?.length) {
        return res.status(400).json({
          error: 'No pending resonance analysis. Please re-enter your characters.',
          code: 'NO_PENDING_ANALYSIS',
        });
      }
      
      // Re-create minimal temp data from stored profile
      const characterInputs = profile.characters.map(c => c.displayName || c.name);
      const recognitionResult = await recognizeCharacters(characterInputs, {});
      const ambiguityAnalysis = await analyzeAllCharacters(recognitionResult.results, {});
      
      tempData = {
        recognizedCharacters: recognitionResult.results,
        ambiguityAnalysis,
        referenceHints: {},
        timestamp: new Date().toISOString(),
      };
      
      memoryStore.saveTempResonanceData(userId, tempData);
      console.log('[Resonance] Recreated temp data from profile');
    }
    
    const { recognizedCharacters, referenceHints, ambiguityAnalysis } = tempData;
    
    // Build the input for re-recognition
    const inputForRecognition = correctedInput || originalInput;
    
    // Parse comma-separated hints (e.g., "Don, Fashion" becomes "Don, Fashion")
    // This allows users to provide multiple movie/show references
    let parsedHint = hint;
    if (hint && hint.includes(',')) {
      // Multiple references - clean them up but keep together for AI context
      parsedHint = hint.split(',').map(h => h.trim()).filter(h => h).join(', ');
      console.log(`[Resonance] Multiple references provided: "${parsedHint}"`);
    }
    
    const enhancedHint = parsedHint ? `${inputForRecognition} (from: ${parsedHint})` : inputForRecognition;
    
    console.log(`[Resonance] Re-recognizing character at index ${characterIndex}: "${originalInput}" → "${enhancedHint}"`);
    
    // Build reference hints for this character with ASSISTIVE mode to be more flexible
    const charRefHints = {};
    if (parsedHint) {
      charRefHints[enhancedHint] = {
        text: parsedHint,
        type: 'FILM', // Assume film reference for actor-to-character mapping
        limitMode: 'ASSISTIVE', // Use assistive mode for better results (STRICT can be too restrictive)
      };
    } else if (referenceHints?.[originalInput]) {
      charRefHints[inputForRecognition] = referenceHints[originalInput];
    }
    
    // Re-recognize just this one character
    const recognitionResult = await recognizeCharacters([enhancedHint], charRefHints);
    const newRecognition = recognitionResult.results[0];
    
    if (!newRecognition) {
      return res.status(400).json({
        error: `Could not get a response from recognition engine.`,
        code: 'RECOGNITION_FAILED',
        suggestion: 'Please try again or contact support.',
      });
    }
    
    // Check if AI needs clarification (e.g., actor name but doesn't know character)
    if (newRecognition.needsClarification && newRecognition.inputWasActor) {
      // AI recognized it as an actor but doesn't know the character
      return res.status(400).json({
        error: `We recognize this as an actor name, but need the character name.`,
        code: 'ACTOR_CHARACTER_UNKNOWN',
        suggestion: parsedHint 
          ? `Please provide the character name directly. For example: "${inputForRecognition}" played which character in "${parsedHint}"?`
          : `Please provide the character name this actor played.`,
        hints: [
          'Instead of the actor name, enter the character name',
          'Example: Instead of "Priyanka Chopra", enter "Roma" (her character in Don)',
          'Example: Instead of "Zooey Deschanel", enter "Allison" (her character in Yes Man)',
        ],
        actorName: inputForRecognition,
        reference: parsedHint,
      });
    }
    
    // Check if completely unrecognized
    if (newRecognition.status === 'NOT_RECOGNIZED' && !newRecognition.canonical?.name) {
      return res.status(400).json({
        error: `Could not recognize "${inputForRecognition}".`,
        code: 'RECOGNITION_FAILED',
        suggestion: parsedHint 
          ? `Couldn't find this character in "${parsedHint}". Please check the spelling or try a different reference.`
          : 'Try adding the show/movie name as a reference.',
        hints: [
          'Check spelling of the character name',
          'Add the movie/show name for context',
          'Example: "Roma from Don" or provide "Don" as the reference',
        ],
      });
    }
    
    // If we got here, we have some recognition (either RECOGNIZED or AMBIGUOUS with a name)
    const characterName = newRecognition.canonical?.name || inputForRecognition;
    const franchise = newRecognition.canonical?.franchise || 'Unknown';
    
    console.log(`[Resonance] Re-recognized: "${characterName}" from "${franchise}" (status: ${newRecognition.status})`);
    
    // Update the recognized characters array
    const updatedCharacters = [...recognizedCharacters];
    updatedCharacters[characterIndex] = {
      ...newRecognition,
      input: originalInput, // Keep original input for reference
      wasRerecognized: true,
      rerecognizedFrom: enhancedHint,
      userProvidedHint: parsedHint,
    };
    
    // Re-analyze ambiguity for this character
    const updatedAmbiguity = await analyzeAllCharacters(updatedCharacters, referenceHints);
    
    // Update temp data
    memoryStore.saveTempResonanceData(userId, {
      recognizedCharacters: updatedCharacters,
      ambiguityAnalysis: updatedAmbiguity,
      referenceHints,
      timestamp: new Date().toISOString(),
    });
    
    // Return the updated character data
    const updatedCharData = updatedAmbiguity.characters.find(c => 
      c.input === originalInput || c.characterName === characterName
    );
    
    res.json({
      success: true,
      characterIndex,
      originalInput,
      updatedCharacter: {
        input: originalInput,
        characterName: characterName,
        canonicalId: newRecognition.canonical?.canonicalId || `char_${characterName.toLowerCase().replace(/\s+/g, '_')}`,
        franchise: franchise,
        medium: newRecognition.canonical?.medium || 'unknown',
        confidence: newRecognition.confidence || 0.7,
        needsClarification: updatedCharData?.needsClarification || newRecognition.needsClarification || false,
        versionOptions: updatedCharData?.versionOptions || [],
        phaseOptions: updatedCharData?.phaseOptions || [],
        wasRerecognized: true,
      },
      message: `Successfully re-recognized as "${characterName}" from "${franchise}"`,
    });
  } catch (error) {
    console.error('[Resonance] Re-recognition error:', error);
    next(error);
  }
});

/**
 * POST /v1/resonance/skip
 * 
 * Skip clarification and proceed with defaults
 */
resonanceRouter.post('/skip', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    
    const tempData = memoryStore.getTempResonanceData(userId);
    if (!tempData) {
      return res.status(400).json({
        error: 'No pending resonance analysis.',
        code: 'NO_PENDING_ANALYSIS',
      });
    }
    
    const { recognizedCharacters } = tempData;
    
    // Use default (no clarification) for all characters
    const characterSet = recognizedCharacters
      .filter(c => c.status === 'RECOGNIZED')
      .map(c => ({
        input: c.input,
        canonical: c.canonical,
        confidence: c.confidence,
        reference: {
          mode: 'NONE',
          tags: [],
          text: null,
        },
      }));
    
    // Save empty references (defaults)
    const references = characterSet.map(c => c.reference);
    memoryStore.saveCharacterReferences(userId, references);
    
    // Clear temp data
    memoryStore.clearTempResonanceData(userId);
    
    // Clear cached output to force regeneration
    memoryStore.clearOutput(userId);
    
    console.log(`[Resonance] Skipped clarification for user ${userId}, using defaults`);
    
    res.json({
      success: true,
      characterSet,
      message: 'Clarification skipped. Using overall character interpretations.',
    });
  } catch (error) {
    console.error('[Resonance] Skip error:', error);
    next(error);
  }
});

/**
 * GET /v1/resonance/status
 * 
 * Check if there's pending resonance analysis for the user
 */
resonanceRouter.get('/status', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const tempData = memoryStore.getTempResonanceData(userId);
    
    res.json({
      hasPendingAnalysis: !!tempData,
      timestamp: tempData?.timestamp || null,
    });
  } catch (error) {
    next(error);
  }
});

export default resonanceRouter;
