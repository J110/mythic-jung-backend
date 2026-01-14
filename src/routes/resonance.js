/**
 * Resonance API Routes
 * 
 * Handles character clarification and phase selection
 */

import express from 'express';
import { analyzeAllCharacters, processResonanceChoices } from '../services/resonanceEngine.js';
import { recognizeCharacters } from '../services/characterRecognitionEngine.js';
import { db } from '../storage/database.js';
import { queueAIRequest, AI_PRIORITY } from '../services/aiQueue.js';

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
      console.log(`[Resonance] Slot: rawName="${slot.rawName}", referenceText="${slot.referenceText}" (type: ${typeof slot.referenceText})`);
      
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
    
    // Step 1: Recognize characters (queued to prevent rate limits)
    const recognitionResult = await queueAIRequest(
      () => recognizeCharacters(enhancedInputs, enhancedReferenceHints),
      { priority: AI_PRIORITY.HIGH }
    );
    
    // Map recognition results back to ORIGINAL inputs
    const recognizedCharacters = recognitionResult.results.map((result, i) => {
      const originalInput = characterInputs[i];
      const enhancedInput = enhancedInputs[i];
      
      if (result.input !== originalInput) {
        console.log(`[Resonance] Mapping result back: "${result.input}" → "${originalInput}"`);
        return {
          ...result,
          input: originalInput,
          enhancedInput: enhancedInput,
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
    await db.saveTempResonanceData(userId, {
      recognizedCharacters,
      ambiguityAnalysis,
      referenceHints,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[Resonance] Analysis complete for user ${userId}. Needs clarification: ${ambiguityAnalysis.needsClarification}`);
    
    // Build response with clarification info
    const responseCharacters = ambiguityAnalysis.characters.map(c => {
      const entryRef = referenceHints[c.input];
      const isReferenceMismatch = entryRef && c.entryReferenceMismatch;
      
      const recognizedChar = recognizedCharacters.find(rc => rc.input === c.input);
      const franchise = c.franchise || recognizedChar?.canonical?.franchise;
      const medium = c.medium || recognizedChar?.canonical?.medium || null;
      const charName = c.characterName || recognizedChar?.canonical?.name || c.input;
      
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
        clarificationMessage: clarificationMessage,
        aiNeedsClarification: c.aiNeedsClarification || false,
        inputWasActor: c.inputWasActor || recognizedChar?.inputWasActor || false,
        franchise: franchise || null,
        medium: medium,
        referenceDescription: c.referenceDescription || (franchise 
          ? `${charName} from ${franchise}${medium ? ` (${medium})` : ''}`
          : `${charName} - please confirm`),
        hasEntryReference: !!entryRef,
        entryReferenceText: entryRef?.text,
        entryReferenceMismatch: isReferenceMismatch,
        entryReferenceMismatchMessage: isReferenceMismatch 
          ? 'Top match does not match your reference. Please confirm or select an alternative.'
          : null,
        versionOptions: c.versionOptions || [],
        phaseOptions: c.phaseOptions || [],
        alternativeCandidates: c.alternativeCandidates || [],
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
 */
resonanceRouter.post('/confirm', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { 
      clarifications, 
      meCount = 4,
      relationshipEnabled = false,
      relationshipType = 'platonic'
    } = req.body;
    
    // Retrieve the stored recognition data
    const tempData = await db.getTempResonanceData(userId);
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
    await db.saveCharacterReferences(userId, meReferences);
    
    // Save Relationship character references
    if (relationshipEnabled && relationshipCharacters.length >= 4) {
      console.log(`[Resonance] Saving ${relationshipCharacters.length} relationship characters`);
      
      // Get existing relationship set and update with recognized characters
      const existingSet = await db.getRelationshipSet(userId);
      if (existingSet) {
        // Build reference hints for relationship characters
        const relationshipReferenceHints = {};
        relationshipCharacters.forEach(c => {
          if (referenceHints?.[c.input]) {
            relationshipReferenceHints[c.input] = referenceHints[c.input];
          }
        });
        
        await db.saveRelationshipSet(userId, {
          ...existingSet,
          recognizedCharacters: relationshipCharacters,
          referenceHints: relationshipReferenceHints,
        });
      }
    }
    
    // Clear temp data
    await db.clearTempResonanceData(userId);
    
    // Clear cached outputs to force regeneration with new references
    await db.clearMeOutput(userId);
    await db.clearRelationshipOutput(userId);
    
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
 */
resonanceRouter.post('/rerecognize', async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { 
      characterIndex,
      originalInput,
      correctedInput,
      hint,
    } = req.body;
    
    if (characterIndex === undefined || !originalInput) {
      return res.status(400).json({
        error: 'characterIndex and originalInput are required',
        code: 'MISSING_PARAMS',
      });
    }
    
    let tempData = await db.getTempResonanceData(userId);
    
    // If no temp data, try to recreate from stored profile
    if (!tempData) {
      console.log('[Resonance] No temp data found, attempting to recreate from profile...');
      const profile = await db.getProfile(userId);
      
      if (!profile?.characters?.length) {
        return res.status(400).json({
          error: 'No pending resonance analysis. Please re-enter your characters.',
          code: 'NO_PENDING_ANALYSIS',
        });
      }
      
      // Re-create minimal temp data from stored profile
      const characterInputs = profile.characters.map(c => c.displayName || c.name);
      const recognitionResult = await queueAIRequest(
        () => recognizeCharacters(characterInputs, {}),
        { priority: AI_PRIORITY.HIGH }
      );
      const ambiguityAnalysis = await analyzeAllCharacters(recognitionResult.results, {});
      
      tempData = {
        recognizedCharacters: recognitionResult.results,
        ambiguityAnalysis,
        referenceHints: {},
        timestamp: new Date().toISOString(),
      };
      
      await db.saveTempResonanceData(userId, tempData);
      console.log('[Resonance] Recreated temp data from profile');
    }
    
    const { recognizedCharacters, referenceHints, ambiguityAnalysis } = tempData;
    
    // Build the input for re-recognition
    const inputForRecognition = correctedInput || originalInput;
    
    // Parse comma-separated hints
    let parsedHint = hint;
    if (hint && hint.includes(',')) {
      parsedHint = hint.split(',').map(h => h.trim()).filter(h => h).join(', ');
      console.log(`[Resonance] Multiple references provided: "${parsedHint}"`);
    }
    
    const enhancedHint = parsedHint ? `${inputForRecognition} (from: ${parsedHint})` : inputForRecognition;
    
    console.log(`[Resonance] Re-recognizing character at index ${characterIndex}: "${originalInput}" → "${enhancedHint}"`);
    
    // Build reference hints for this character
    const charRefHints = {};
    if (parsedHint) {
      charRefHints[enhancedHint] = {
        text: parsedHint,
        type: 'FILM',
        limitMode: 'ASSISTIVE',
      };
    } else if (referenceHints?.[originalInput]) {
      charRefHints[inputForRecognition] = referenceHints[originalInput];
    }
    
    // Re-recognize just this one character (queued)
    const recognitionResult = await queueAIRequest(
      () => recognizeCharacters([enhancedHint], charRefHints),
      { priority: AI_PRIORITY.HIGH }
    );
    const newRecognition = recognitionResult.results[0];
    
    if (!newRecognition) {
      return res.status(400).json({
        error: `Could not get a response from recognition engine.`,
        code: 'RECOGNITION_FAILED',
        suggestion: 'Please try again or contact support.',
      });
    }
    
    // Check if AI needs clarification
    if (newRecognition.needsClarification && newRecognition.inputWasActor) {
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
    
    const characterName = newRecognition.canonical?.name || inputForRecognition;
    const franchise = newRecognition.canonical?.franchise || 'Unknown';
    
    console.log(`[Resonance] Re-recognized: "${characterName}" from "${franchise}" (status: ${newRecognition.status})`);
    
    // Update the recognized characters array
    const updatedCharacters = [...recognizedCharacters];
    updatedCharacters[characterIndex] = {
      ...newRecognition,
      input: originalInput,
      wasRerecognized: true,
      rerecognizedFrom: enhancedHint,
      userProvidedHint: parsedHint,
    };
    
    // Re-analyze ambiguity for this character
    const updatedAmbiguity = await analyzeAllCharacters(updatedCharacters, referenceHints);
    
    // Update temp data
    await db.saveTempResonanceData(userId, {
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
    
    const tempData = await db.getTempResonanceData(userId);
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
    await db.saveCharacterReferences(userId, references);
    
    // Clear temp data
    await db.clearTempResonanceData(userId);
    
    // Clear cached output to force regeneration
    await db.clearMeOutput(userId);
    
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
    const tempData = await db.getTempResonanceData(userId);
    
    res.json({
      hasPendingAnalysis: !!tempData,
      timestamp: tempData?.timestamp || null,
    });
  } catch (error) {
    next(error);
  }
});

export default resonanceRouter;
