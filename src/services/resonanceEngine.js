/**
 * Resonance Engine v2
 * 
 * Purpose: Improve character analysis through specific version/phase clarification
 * Position: Between Recognition and Synthesis engines
 * 
 * Key updates:
 * - versionOptions: Named versions with labels, cues, and example refs
 * - phaseOptions: Arc phases with labels, cues, and example refs
 * - All options generated dynamically from Character Discovery/DB
 */

import OpenAI from 'openai';
import { safeParseJSON } from '../utils/jsonParser.js';

// In-memory cache for clarification options
const clarificationCache = new Map();

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Verify character franchise if needed using AI
 * No hardcoded corrections - all verification is AI-based
 */
async function verifyCharacterFranchise(openai, canonical) {
  // All verification is now handled by the recognition engine's AI
  // No hardcoded corrections to avoid assumptions
  return {
    wasCorrected: false,
    correctedFranchise: null,
  };
}

/**
 * Character knowledge base for known multi-version/phase characters
 * This seeds the system - AI expands for unknown characters
 */
const CHARACTER_KNOWLEDGE = {
  // Characters with multiple versions (actors/eras)
  'james bond': {
    hasVersions: true,
    versions: [
      { versionId: 'ver_connery', label: 'Sean Connery era (1962-1967)', cue: 'Suave, cold-blooded, masculine dominance', tags: ['classic', 'cold', 'masculine'] },
      { versionId: 'ver_moore', label: 'Roger Moore era (1973-1985)', cue: 'Lighter, comedic, gentleman spy', tags: ['light', 'comedic', 'gentleman'] },
      { versionId: 'ver_brosnan', label: 'Pierce Brosnan era (1995-2002)', cue: 'Slick, modern, action-focused', tags: ['slick', 'modern', 'action'] },
      { versionId: 'ver_craig', label: 'Daniel Craig era (2006-2021)', cue: 'Vulnerable, brutal, emotionally complex', tags: ['vulnerable', 'brutal', 'emotional'] },
    ],
    phases: [
      { phaseId: 'phase_cold', label: 'Cold Professional', cue: 'Detached efficiency, mission above all', tags: ['cold', 'professional'] },
      { phaseId: 'phase_vengeful', label: 'Vengeful / Personal', cue: 'Driven by loss, rules become flexible', tags: ['vengeful', 'personal'] },
      { phaseId: 'phase_weary', label: 'Weary Veteran', cue: 'Questioning the cost, loyalty tested', tags: ['weary', 'veteran'] },
    ],
  },
  'batman': {
    hasVersions: true,
    versions: [
      { versionId: 'ver_keaton', label: 'Tim Burton era (Keaton)', cue: 'Gothic, brooding, theatrical darkness', tags: ['gothic', 'brooding', 'theatrical'] },
      { versionId: 'ver_nolan', label: 'Christopher Nolan trilogy', cue: 'Grounded realism, moral struggle, symbol vs man', tags: ['grounded', 'realistic', 'moral'] },
      { versionId: 'ver_animated', label: 'Animated Series (BTAS)', cue: 'Noir detective, compassionate beneath the mask', tags: ['noir', 'detective', 'compassionate'] },
      { versionId: 'ver_affleck', label: 'DCEU (Affleck)', cue: 'Older, brutal, fallen idealist', tags: ['older', 'brutal', 'fallen'] },
      { versionId: 'ver_pattinson', label: 'Matt Reeves (Pattinson)', cue: 'Younger, vengeful, isolating obsession', tags: ['young', 'vengeful', 'obsessive'] },
    ],
    phases: [
      { phaseId: 'phase_origin', label: 'Origin / Becoming', cue: 'Learning the mission, shaping the symbol', tags: ['origin', 'learning'] },
      { phaseId: 'phase_crusader', label: 'Dark Crusader', cue: 'Peak efficiency, city depends on him', tags: ['peak', 'crusader'] },
      { phaseId: 'phase_broken', label: 'Broken Knight', cue: 'Questioning methods, allies lost, rage consuming', tags: ['broken', 'questioning'] },
    ],
  },
  'spider-man': {
    hasVersions: true,
    versions: [
      { versionId: 'ver_tobey', label: 'Sam Raimi trilogy (Tobey Maguire)', cue: 'Earnest, romantic, weight of responsibility', tags: ['earnest', 'romantic', 'responsibility'] },
      { versionId: 'ver_andrew', label: 'Amazing Spider-Man (Andrew Garfield)', cue: 'Wittier, edgier, grief-driven', tags: ['witty', 'edgy', 'grief'] },
      { versionId: 'ver_tom', label: 'MCU (Tom Holland)', cue: 'Youthful, eager, mentorship-seeking', tags: ['youthful', 'eager', 'mentorship'] },
    ],
    phases: [
      { phaseId: 'phase_newbie', label: 'Eager Beginner', cue: 'Learning powers, making mistakes, pure hope', tags: ['new', 'hopeful'] },
      { phaseId: 'phase_burdened', label: 'Burdened Hero', cue: 'Great power = great cost, relationships strain', tags: ['burdened', 'strained'] },
      { phaseId: 'phase_alone', label: 'Alone / Sacrificed', cue: 'Lost everything, keeps going anyway', tags: ['alone', 'sacrificed'] },
    ],
  },
  'joker': {
    hasVersions: true,
    versions: [
      { versionId: 'ver_nicholson', label: 'Jack Nicholson (1989)', cue: 'Theatrical, gangster-clown, personal vendetta', tags: ['theatrical', 'gangster'] },
      { versionId: 'ver_ledger', label: 'Heath Ledger (The Dark Knight)', cue: 'Agent of chaos, philosophical terror', tags: ['chaos', 'philosophical', 'terror'] },
      { versionId: 'ver_phoenix', label: 'Joaquin Phoenix (Joker 2019)', cue: 'Tragic origin, societal failure, sympathetic monster', tags: ['tragic', 'sympathetic', 'society'] },
      { versionId: 'ver_animated', label: 'Mark Hamill (Animated)', cue: 'Maniacal glee, obsessed rival', tags: ['maniacal', 'obsessed'] },
    ],
    phases: [
      { phaseId: 'phase_clown', label: 'Performative Clown', cue: 'The mask is the message, chaos as art', tags: ['performative', 'art'] },
      { phaseId: 'phase_nihilist', label: 'Nihilist Prophet', cue: 'Nothing matters, prove it to everyone', tags: ['nihilist', 'prophet'] },
    ],
  },
  'walter white': {
    hasVersions: false,
    phases: [
      { phaseId: 'phase_teacher', label: 'Desperate Teacher', cue: 'Family man with terminal diagnosis, rationalizing first steps', tags: ['desperate', 'rationalizing'] },
      { phaseId: 'phase_empire', label: 'Empire Builder', cue: '"I am the one who knocks" - pride overtakes survival', tags: ['empire', 'pride'] },
      { phaseId: 'phase_heisenberg', label: 'Full Heisenberg', cue: 'The mask became the face, ego consumes all', tags: ['heisenberg', 'ego'] },
      { phaseId: 'phase_reckoning', label: 'Final Reckoning', cue: 'Facing the cost, "I did it for me"', tags: ['reckoning', 'truth'] },
    ],
  },
  'tony stark': {
    hasVersions: false,
    phases: [
      { phaseId: 'phase_merchant', label: 'Merchant of Death', cue: 'Arrogant genius, blind to consequences', tags: ['arrogant', 'blind'] },
      { phaseId: 'phase_reborn', label: 'Cave Rebirth', cue: 'Transformed by captivity, building redemption', tags: ['reborn', 'redemption'] },
      { phaseId: 'phase_hero', label: 'Reluctant Hero', cue: 'Proving himself, ego vs team', tags: ['proving', 'ego'] },
      { phaseId: 'phase_mentor', label: 'Mentor / Protector', cue: 'Passing the torch, sacrifice as love', tags: ['mentor', 'sacrifice'] },
    ],
  },
  'anakin skywalker': {
    hasVersions: false,
    phases: [
      { phaseId: 'phase_chosen', label: 'Chosen One', cue: 'Gifted child, prophecy burden, seeking approval', tags: ['chosen', 'gifted'] },
      { phaseId: 'phase_conflicted', label: 'Conflicted Knight', cue: 'Love vs duty, attachment as weakness', tags: ['conflicted', 'attachment'] },
      { phaseId: 'phase_fall', label: 'The Fall', cue: 'Fear becomes hate, Vader emerges', tags: ['fall', 'vader'] },
      { phaseId: 'phase_redeemed', label: 'Redeemed Father', cue: 'Love defeats the darkness within', tags: ['redeemed', 'father'] },
    ],
  },
  'ethan hunt': {
    hasVersions: true,
    versions: [
      { versionId: 'ver_early', label: 'Early Mission: Impossible (De Palma)', cue: 'Raw improvisation, lone operative under pressure', tags: ['raw', 'lone', 'pressure'] },
      { versionId: 'ver_mcquarrie', label: 'McQuarrie era (later films)', cue: 'Strategic team leader, moral weight, calculated risks', tags: ['strategic', 'team', 'moral'] },
    ],
    phases: [
      { phaseId: 'phase_operative', label: 'Field Operative', cue: 'Trust issues, self-reliant, mask work', tags: ['operative', 'masks'] },
      { phaseId: 'phase_leader', label: 'Team Leader', cue: 'Impossible becomes possible through trust', tags: ['leader', 'trust'] },
      { phaseId: 'phase_rogue', label: 'Gone Rogue', cue: 'System betrayed him, loyalty to people not institutions', tags: ['rogue', 'loyalty'] },
    ],
  },
  'sherlock holmes': {
    hasVersions: true,
    versions: [
      { versionId: 'ver_doyle', label: 'Original Conan Doyle', cue: 'Victorian detective, cocaine habit, clinical genius', tags: ['victorian', 'clinical'] },
      { versionId: 'ver_bbc', label: 'BBC Sherlock (Cumberbatch)', cue: 'High-functioning sociopath, modern London, emotional growth', tags: ['modern', 'sociopath', 'growth'] },
      { versionId: 'ver_rdj', label: 'Guy Ritchie films (RDJ)', cue: 'Action-hero detective, bohemian, physical', tags: ['action', 'bohemian'] },
      { versionId: 'ver_elementary', label: 'Elementary (Miller)', cue: 'Recovering addict, NY transplant, partnership-focused', tags: ['recovery', 'partnership'] },
    ],
    phases: [
      { phaseId: 'phase_isolated', label: 'Isolated Genius', cue: 'Work is everything, people are puzzles', tags: ['isolated', 'work'] },
      { phaseId: 'phase_connected', label: 'Reluctantly Connected', cue: 'Watson effect - care despite resistance', tags: ['connected', 'care'] },
    ],
  },
  'rick sanchez': {
    hasVersions: false,
    phases: [
      { phaseId: 'phase_god', label: 'Nihilistic God', cue: 'Smartest in the multiverse, nothing matters', tags: ['nihilistic', 'god'] },
      { phaseId: 'phase_vulnerable', label: 'Vulnerable Moments', cue: 'Rare cracks - loss, loneliness, needing family', tags: ['vulnerable', 'family'] },
      { phaseId: 'phase_cynical', label: 'Peak Cynicism', cue: 'Weaponized intelligence against feeling', tags: ['cynical', 'weaponized'] },
    ],
  },
  'daenerys targaryen': {
    hasVersions: false,
    phases: [
      { phaseId: 'phase_exile', label: 'Exiled Princess', cue: 'Victim finding strength, dragons as rebirth', tags: ['exile', 'rebirth'] },
      { phaseId: 'phase_liberator', label: 'Breaker of Chains', cue: 'Righteous conqueror, beloved mother', tags: ['liberator', 'righteous'] },
      { phaseId: 'phase_queen', label: 'Claiming the Throne', cue: 'Entitled to rule, ends justify means', tags: ['queen', 'entitled'] },
      { phaseId: 'phase_mad', label: 'Mad Queen', cue: 'Grief becomes fire, liberation becomes destruction', tags: ['mad', 'destruction'] },
    ],
  },
};

/**
 * Generate clarification options for a character
 * Uses knowledge base for known characters, AI for unknown ones
 */
export async function generateClarificationOptions(canonical, recognizedCharacter) {
  const characterKey = canonical.name.toLowerCase();
  
  // Check cache
  const cacheKey = `clarify:${canonical.canonicalId || characterKey}`;
  if (clarificationCache.has(cacheKey)) {
    return clarificationCache.get(cacheKey);
  }
  
  // Check knowledge base first
  const knownData = CHARACTER_KNOWLEDGE[characterKey];
  if (knownData) {
    const options = buildOptionsFromKnowledge(knownData, canonical);
    clarificationCache.set(cacheKey, options);
    return options;
  }
  
  // For unknown characters, use AI to generate options
  try {
    const options = await generateOptionsWithAI(canonical);
    clarificationCache.set(cacheKey, options);
    return options;
  } catch (error) {
    console.error(`[ResonanceEngine] Failed to generate options for ${canonical.name}:`, error.message);
    return {
      needsClarification: false,
      versionOptions: [],
      phaseOptions: [],
    };
  }
}

/**
 * Build clarification options from knowledge base
 */
function buildOptionsFromKnowledge(knowledge, canonical) {
  const versionOptions = (knowledge.versions || []).map(v => ({
    ...v,
    exampleRefs: [], // Would be populated from Example Engine
  }));
  
  const phaseOptions = (knowledge.phases || []).map(p => ({
    ...p,
    exampleRefs: [], // Would be populated from Example Engine
    excludable: true, // All phases can be excluded
  }));
  
  // Add "overall" option (not excludable)
  phaseOptions.push({
    phaseId: 'phase_overall',
    label: 'The Overall Character',
    cue: 'The essence across all versions and phases',
    tags: ['overall', 'general'],
    exampleRefs: [],
    excludable: false, // Can't exclude the overall option
  });
  
  // Show exclusion section if there are 2+ excludable phases
  const excludablePhaseCount = phaseOptions.filter(p => p.excludable).length;
  
  // ALWAYS show clarification so users can confirm/adjust
  return {
    needsClarification: true, // Always show - let users confirm or adjust
    disambiguationReason: versionOptions.length > 0 ? 'multiple_versions' : 
                          phaseOptions.length > 1 ? 'distinct_phases' : 'confirm_identification',
    versionOptions,
    phaseOptions,
    showExclusionSection: excludablePhaseCount > 1 || knowledge.polarized === true,
    characterName: canonical.name,
    canonicalId: canonical.canonicalId,
    // Always include reference info so users see what was identified
    reference: {
      franchise: canonical.franchise,
      medium: canonical.medium,
      description: `${canonical.name} from ${canonical.franchise}`,
    },
  };
}

/**
 * Generate clarification options using AI for unknown characters
 */
async function generateOptionsWithAI(canonical) {
  const openai = getOpenAIClient();
  if (!openai) {
    return { needsClarification: false, versionOptions: [], phaseOptions: [] };
  }
  
  // Safety check: verify franchise makes sense for character name
  const franchiseCheck = await verifyCharacterFranchise(openai, canonical);
  const franchise = franchiseCheck.correctedFranchise || canonical.franchise || 'unknown';
  
  if (franchiseCheck.wasCorrected) {
    console.log(`[ResonanceEngine] Franchise corrected: "${canonical.franchise}" → "${franchise}" for "${canonical.name}"`);
    canonical.franchise = franchise; // Update the canonical object
  }
  
  const prompt = `Analyze "${canonical.name}" from "${franchise}" for psychological phase variance.

Return JSON with:
1. "hasVersions": boolean - Are there multiple distinct versions (actors, adaptations, eras)?
2. "versions": array of {versionId, label, cue} - Named versions if hasVersions=true
3. "phases": array of {phaseId, label, cue} - 2-4 distinct psychological arc phases

Each version/phase needs:
- versionId/phaseId: unique identifier (e.g., "ver_early", "phase_broken")
- label: short name (e.g., "Daniel Craig era", "Redemption Arc")  
- cue: 1-line description of what makes this distinct

Example output:
{
  "hasVersions": false,
  "versions": [],
  "phases": [
    {"phaseId": "phase_early", "label": "Rising Hope", "cue": "Believes change is possible, fights clean"},
    {"phaseId": "phase_dark", "label": "Disillusioned", "cue": "System failed them, methods become flexible"}
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Character analysis expert. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 600,
  });

  const analysis = safeParseJSON(response.choices[0].message.content, 'ResonanceEngine.generateOptionsWithAI');
  
  const versionOptions = (analysis.versions || []).map(v => ({
    versionId: v.versionId || `ver_${Math.random().toString(36).substr(2, 6)}`,
    label: v.label,
    cue: v.cue,
    tags: extractTags(v.cue),
    exampleRefs: [],
  }));
  
  const phaseOptions = (analysis.phases || []).map(p => ({
    phaseId: p.phaseId || `phase_${Math.random().toString(36).substr(2, 6)}`,
    label: p.label,
    cue: p.cue,
    tags: extractTags(p.cue),
    exampleRefs: [],
    excludable: true, // AI-generated phases can be excluded
  }));
  
  // Add overall option (not excludable)
  phaseOptions.push({
    phaseId: 'phase_overall',
    label: 'The Overall Character',
    cue: 'The essence across all phases',
    tags: ['overall'],
    exampleRefs: [],
    excludable: false,
  });
  
  // Show exclusion section if there are 2+ excludable phases
  const excludablePhaseCount = phaseOptions.filter(p => p.excludable).length;
  
  // ALWAYS show clarification so users can confirm/adjust
  return {
    needsClarification: true, // Always show - let users confirm or adjust
    disambiguationReason: versionOptions.length > 0 ? 'multiple_versions' : 
                          phaseOptions.length > 1 ? 'distinct_phases' : 'confirm_identification',
    versionOptions,
    phaseOptions,
    showExclusionSection: excludablePhaseCount > 1,
    characterName: canonical.name,
    canonicalId: canonical.canonicalId,
    // Always include reference info
    reference: {
      franchise: canonical.franchise || franchise,
      medium: canonical.medium,
      description: `${canonical.name} from ${franchise}`,
    },
  };
}

/**
 * Extract tags from a cue string
 */
function extractTags(cue) {
  if (!cue) return [];
  // Simple extraction - could be enhanced
  const words = cue.toLowerCase().split(/[\s,]+/);
  return words.filter(w => w.length > 4).slice(0, 3);
}

/**
 * Analyze all recognized characters for clarification needs
 */
/**
 * Analyze all recognized characters for clarification needs
 * @param {Array} recognizedCharacters - Results from recognition engine
 * @param {Object} referenceHints - Entry reference hints { [name]: { text, type, limitMode } }
 */
export async function analyzeAllCharacters(recognizedCharacters, referenceHints = {}) {
  console.log(`[ResonanceEngine] Analyzing ${recognizedCharacters.length} characters for clarification...`);
  
  const analyses = await Promise.all(
    recognizedCharacters.map(async (char) => {
      const entryRef = referenceHints[char.input];
      
      if (char.status !== 'RECOGNIZED') {
        return {
          input: char.input,
          needsClarification: true, // Still show - maybe user wants to re-enter
          reason: 'not_recognized',
          disambiguationReason: 'not_recognized',
          versionOptions: [],
          phaseOptions: [],
          hasEntryReference: !!entryRef,
          entryReferenceText: entryRef?.text,
          franchise: null,
          medium: null,
          referenceDescription: 'Not recognized - please check the name',
        };
      }
      
      const options = await generateClarificationOptions(char.canonical, char);
      
      // Check for reference mismatch or AI requesting clarification
      const entryReferenceMismatch = char.entryReferenceMismatch || false;
      const aiNeedsClarification = char.needsClarification || false;
      const clarificationReason = char.clarificationReason || null;
      
      // Always need clarification - users should always confirm
      // But mark with special reason if AI specifically asked for it
      const needsClarification = true;
      const primaryClarificationReason = aiNeedsClarification 
        ? clarificationReason 
        : (options.disambiguationReason || 'confirm_identification');
      
      // Include franchise/medium info so users see what was identified
      const franchise = char.canonical?.franchise || options.reference?.franchise;
      const medium = char.canonical?.medium || options.reference?.medium;
      const charName = options.characterName || char.canonical?.name || char.input;
      
      // Build clarification message based on reason
      let clarificationMessage = null;
      if (clarificationReason === 'actor_character_unknown') {
        clarificationMessage = `We detected "${char.input}" might be an actor. Please specify the character name they played in "${entryRef?.text || 'the movie/show'}".`;
      } else if (clarificationReason === 'ambiguous') {
        clarificationMessage = `"${char.input}" could refer to multiple characters. Please provide more details.`;
      } else if (clarificationReason === 'low_confidence') {
        clarificationMessage = `We're not certain about "${char.input}". Please confirm or provide more details.`;
      }
      
      return {
        input: char.input,
        ...options,
        needsClarification,
        disambiguationReason: primaryClarificationReason,
        clarificationMessage,
        entryReferenceMismatch,
        aiNeedsClarification, // New: AI specifically requested clarification
        inputWasActor: char.inputWasActor || false,
        hasEntryReference: !!entryRef,
        entryReferenceText: entryRef?.text,
        referenceNote: char.referenceNote,
        // Always show franchise/medium reference
        franchise,
        medium,
        referenceDescription: franchise 
          ? `${charName} from ${franchise}${medium ? ` (${medium})` : ''}`
          : `${charName} - needs clarification`,
        // If mismatch or AI uncertainty, add alternative candidates based on reference
        alternativeCandidates: (entryReferenceMismatch || aiNeedsClarification)
          ? await getReferenceCandidates(char.input, entryRef)
          : [],
      };
    })
  );
  
  const needsClarification = analyses.some(a => a.needsClarification);
  
  console.log(`[ResonanceEngine] Analysis complete. Clarification needed: ${needsClarification}`);
  
  return {
    needsClarification,
    characters: analyses,
  };
}

/**
 * Get candidate characters that match the entry reference
 */
async function getReferenceCandidates(input, entryRef) {
  if (!entryRef || !entryRef.text) return [];
  
  // This would ideally query a character database
  // For now, return empty - the clarification UI will show the mismatch warning
  console.log(`[ResonanceEngine] Getting reference candidates for "${input}" in "${entryRef.text}"`);
  return [];
}

/**
 * Process user's clarification choices
 * Now includes versionId, phaseId, excludedPhaseIds, and positive/negative resonance text
 */
export function processResonanceChoices(recognizedCharacters, clarifications) {
  return recognizedCharacters.map((char, index) => {
    const clarification = clarifications[index];
    
    const hasAnySelection = clarification && (
      clarification.referenceMode !== 'NONE' ||
      clarification.versionId ||
      clarification.phaseId ||
      (clarification.excludedPhaseIds && clarification.excludedPhaseIds.length > 0) ||
      clarification.positiveText ||
      clarification.negativeText
    );
    
    if (!hasAnySelection) {
      return {
        ...char,
        reference: {
          mode: 'NONE',
          versionId: null,
          phaseId: null,
          excludedPhaseIds: [],
          tags: [],
          text: null,
        },
        resonance: {
          positiveText: null,
          negativeText: null,
        },
      };
    }
    
    // Validate: phaseId must not be in excludedPhaseIds
    const excludedPhaseIds = clarification.excludedPhaseIds || [];
    let phaseId = clarification.phaseId || null;
    if (phaseId && excludedPhaseIds.includes(phaseId)) {
      console.warn(`[ResonanceEngine] Phase ${phaseId} was both selected and excluded. Clearing selection.`);
      phaseId = null;
    }
    
    return {
      ...char,
      reference: {
        mode: clarification.referenceMode || 'GENERAL',
        versionId: clarification.versionId || null,
        phaseId,
        excludedPhaseIds,
        tags: clarification.referenceTags || [],
        text: clarification.referenceText || null,
      },
      resonance: {
        positiveText: clarification.positiveText || null,
        negativeText: clarification.negativeText || null,
      },
    };
  });
}

/**
 * Get profile constraints from reference selection
 * Used by Discovery Engine to adjust profile generation
 */
export function getProfileConstraints(character) {
  const ref = character.reference;
  
  if (!ref || ref.mode === 'NONE') {
    return null;
  }
  
  const constraints = {
    versionId: ref.versionId,
    phaseId: ref.phaseId,
    excludedPhaseIds: ref.excludedPhaseIds || [],
    phaseFocus: null,
    toneAdjustment: null,
    exampleFilter: null,
    boundaryMarkers: [], // Traits/themes to exclude from analysis
  };
  
  // Map phase to focus areas
  if (ref.phaseId) {
    if (ref.phaseId.includes('early') || ref.phaseId.includes('idealistic') || ref.phaseId.includes('origin')) {
      constraints.phaseFocus = 'early';
      constraints.toneAdjustment = 'hopeful';
    } else if (ref.phaseId.includes('dark') || ref.phaseId.includes('broken') || ref.phaseId.includes('fall')) {
      constraints.phaseFocus = 'late';
      constraints.toneAdjustment = 'complex';
    } else if (ref.phaseId.includes('redemption') || ref.phaseId.includes('mentor') || ref.phaseId.includes('redeemed')) {
      constraints.phaseFocus = 'redemption';
      constraints.toneAdjustment = 'resolved';
    }
  }
  
  // Process excluded phases into boundary markers
  if (ref.excludedPhaseIds && ref.excludedPhaseIds.length > 0) {
    ref.excludedPhaseIds.forEach(phaseId => {
      // Extract meaningful tags from phase ID
      if (phaseId.includes('nihilist')) constraints.boundaryMarkers.push('nihilism');
      if (phaseId.includes('naive') || phaseId.includes('idealistic')) constraints.boundaryMarkers.push('naivety');
      if (phaseId.includes('mad') || phaseId.includes('destructive')) constraints.boundaryMarkers.push('destruction');
      if (phaseId.includes('cold') || phaseId.includes('isolated')) constraints.boundaryMarkers.push('coldness');
      if (phaseId.includes('vengeful')) constraints.boundaryMarkers.push('vengeance');
      if (phaseId.includes('broken') || phaseId.includes('fall')) constraints.boundaryMarkers.push('brokenness');
    });
  }
  
  // Specific text reference
  if (ref.mode === 'SPECIFIC' && ref.text) {
    constraints.specificReference = ref.text;
    constraints.exampleFilter = ref.text;
  }
  
  return constraints;
}

/**
 * Check if an example should be excluded based on phase exclusions
 */
export function shouldExcludeExample(example, excludedPhaseIds, boundaryMarkers) {
  if (!excludedPhaseIds || excludedPhaseIds.length === 0) {
    return false;
  }
  
  // Check if example's phase matches excluded phases
  if (example.phaseId && excludedPhaseIds.includes(example.phaseId)) {
    return true;
  }
  
  // Check if example's tags overlap with boundary markers
  if (example.tags && boundaryMarkers && boundaryMarkers.length > 0) {
    const overlap = example.tags.some(tag => 
      boundaryMarkers.some(marker => tag.toLowerCase().includes(marker.toLowerCase()))
    );
    if (overlap) return true;
  }
  
  return false;
}

/**
 * Get explicit exclusions for resonance signals
 * Used by Synthesis Engine for boundary-based insights
 */
export function getExplicitExclusions(references) {
  const exclusions = [];
  
  references.forEach((ref, index) => {
    if (ref && ref.excludedPhaseIds && ref.excludedPhaseIds.length > 0) {
      ref.excludedPhaseIds.forEach(phaseId => {
        exclusions.push({
          characterIndex: index,
          phaseId,
          source: 'explicit_exclusion',
          confidence: 1.0, // User-stated = high confidence
        });
      });
    }
  });
  
  return exclusions;
}

/**
 * Clear the clarification cache
 */
export function clearClarificationCache() {
  clarificationCache.clear();
  console.log('[ResonanceEngine] Clarification cache cleared');
}

export default {
  generateClarificationOptions,
  analyzeAllCharacters,
  processResonanceChoices,
  getProfileConstraints,
  shouldExcludeExample,
  getExplicitExclusions,
  clearClarificationCache,
};
