/**
 * Character Discovery Engine
 * For each recognized canonical character, compute a Jungian narrative profile.
 * Based on: 02_CHARACTER_DISCOVERY_ENGINE_SPEC.md
 */

import OpenAI from 'openai';
import { safeParseJSON } from '../utils/jsonParser.js';

let openai = null;

function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// Simple in-memory cache (in production, use Redis or DB)
const profileCache = new Map();

/**
 * Discover character profile for a recognized character
 * @param {Object} canonical - Canonical character info from recognition
 * @param {Object} options - Discovery options (variant, etc.)
 * @returns {Promise<CharacterProfile>}
 */
export async function discoverCharacterProfile(canonical, options = {}) {
  const cacheKey = `${canonical.canonicalId}_${options.variant || 'default'}`;
  
  // Check cache
  if (profileCache.has(cacheKey)) {
    const cached = profileCache.get(cacheKey);
    if (cached.profileVersion === (options.profileVersion || 'v1')) {
      return cached;
    }
  }

  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI API key required for character discovery');
  }

  // Step 1: Retrieve canonical facts (from KB or AI)
  const facts = await retrieveCanonicalFacts(canonical, client);
  
  // Step 2: Extract CharacterProfile using LLM
  const profile = await extractCharacterProfile(canonical, facts, options, client);
  
  // Step 3: Validate and enrich
  const validated = validateAndEnrichProfile(profile, canonical);
  
  // Step 4: Cache
  validated.provenance = {
    sources: facts.sources || [],
    generatedAt: new Date().toISOString(),
    modelVersion: process.env.OPENAI_DISCOVERY_MODEL || 'gpt-4o-mini',
    profileVersion: options.profileVersion || 'v1',
  };
  
  profileCache.set(cacheKey, validated);
  
  return validated;
}

/**
 * Batch discover ALL profiles in ONE API call (avoids rate limits, much faster)
 * @param {Array} canonicals - Array of canonical character objects
 * @param {Object} options - Discovery options
 * @param {Array} options.references - Optional array of reference constraints from Resonance Engine
 */
export async function discoverCharacterProfiles(canonicals, options = {}) {
  if (canonicals.length === 0) return [];
  
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI API key required for character discovery');
  }

  // Get reference constraints if provided
  const references = options.references || [];

  // Check cache for all - if all cached, return immediately
  // Note: Cache key includes reference tags for different versions
  const cached = [];
  const toDiscover = [];
  
  for (let i = 0; i < canonicals.length; i++) {
    const canonical = canonicals[i];
    const ref = references[i];
    const refKey = ref?.tags?.join('_') || 'default';
    const cacheKey = `${canonical.canonicalId}_${refKey}`;
    
    if (profileCache.has(cacheKey)) {
      cached.push({ canonical, profile: profileCache.get(cacheKey) });
    } else {
      toDiscover.push({ canonical, reference: ref, index: i });
    }
  }

  if (toDiscover.length === 0) {
    // All cached
    return canonicals.map((c, i) => {
      const ref = references[i];
      const refKey = ref?.tags?.join('_') || 'default';
      const cacheKey = `${c.canonicalId}_${refKey}`;
      return profileCache.get(cacheKey);
    });
  }

  console.log(`[Discovery] Batch discovering ${toDiscover.length} profiles in ONE API call...`);

  try {
    // Build character list with phase constraints
    const charList = toDiscover.map((item, i) => {
      const { canonical, reference } = item;
      let charDesc = `${i+1}.${canonical.name}(${canonical.franchise})`;
      
      // Add phase constraint if reference is provided
      if (reference && reference.mode !== 'NONE') {
        const phaseHints = [];
        if (reference.tags?.includes('early') || reference.tags?.includes('idealistic')) {
          phaseHints.push('early/idealistic phase');
        }
        if (reference.tags?.includes('later') || reference.tags?.includes('dark')) {
          phaseHints.push('later/darker phase');
        }
        if (reference.text) {
          phaseHints.push(`specifically: ${reference.text}`);
        }
        if (phaseHints.length > 0) {
          charDesc += `[${phaseHints.join(', ')}]`;
        }
      }
      
      return charDesc;
    }).join(', ');
    
    const prompt = `Jungian profiles for: ${charList}

Return JSON: {"profiles":[{
  "name":"Name",
  "archetypeSignals":{"primaryArchetypes":["Hero"],"shadowArchetypes":["Shadow"]},
  "jungFunctions":{"egoMode":"","personaMode":"","shadowPattern":"","feelingChannel":"","erosNeed":""},
  "narrativeArc":{"wound":"","desire":"","fear":"","transformation":""},
  "behavioralTraits":{"strengths":[""],"liabilities":[""],"triggers":[""]},
  "motifs":[{"motif":"HERO","weight":0.8}]
}]}

MOTIFS: Choose from [HERO,TRICKSTER,WISE_OLD_MAN,GREAT_MOTHER,FATHER_AUTHORITY,CHILD,LOVER_EROS,WARRIOR,MAGICIAN,CAREGIVER_HEALER,OUTLAW_REBEL,SEEKER_WANDERER]. Pick 2-4 motifs per character with weights 0.3-1.0.

Include 2-3 items per array. Be specific to each character.`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_DISCOVERY_MODEL || 'gpt-4o-mini', // Use faster model
      messages: [
        { role: 'system', content: 'Jungian psychology expert. JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 3000, // Limited for speed
    });

    const content = response.choices[0].message.content;
    const parsed = safeParseJSON(content, 'DiscoveryEngine.extractCharacterProfile');
    const profiles = parsed.profiles || parsed.characters || [];

    // Map discovered profiles back and cache them
    const discoveredMap = new Map();
    profiles.forEach((profile, index) => {
      const item = toDiscover[index];
      if (item) {
        const { canonical, reference } = item;
        const refKey = reference?.tags?.join('_') || 'default';
        
        const fullProfile = {
          canonicalId: canonical.canonicalId,
          name: canonical.name,
          ...profile,
          // Store reference info for downstream use
          referenceConstraint: reference || null,
          provenance: {
            sources: [`${canonical.franchise}`],
            generatedAt: new Date().toISOString(),
            modelVersion: process.env.OPENAI_DISCOVERY_MODEL || 'gpt-4o-mini',
            profileVersion: options.profileVersion || 'v1',
            phaseConstraint: reference?.tags || [],
          },
        };
        
        const cacheKey = `${canonical.canonicalId}_${refKey}`;
        profileCache.set(cacheKey, fullProfile);
        discoveredMap.set(canonical.canonicalId, fullProfile);
      }
    });

    // Return all profiles in original order
    return canonicals.map((c, i) => {
      const ref = references[i];
      const refKey = ref?.tags?.join('_') || 'default';
      const cacheKey = `${c.canonicalId}_${refKey}`;
      return profileCache.get(cacheKey) || discoveredMap.get(c.canonicalId) || createFallbackProfile(c);
    });

  } catch (error) {
    console.error('[Discovery] Batch discovery error:', error.message);
    
    // If rate limited, wait and retry once
    if (error.status === 429) {
      console.log('[Discovery] Rate limited, waiting 21s and retrying...');
      await new Promise(resolve => setTimeout(resolve, 21000));
      return discoverCharacterProfiles(canonicals, options);
    }
    
    // Fallback: return basic profiles
    return canonicals.map(c => createFallbackProfile(c));
  }
}

function createFallbackProfile(canonical) {
  return {
    canonicalId: canonical.canonicalId,
    name: canonical.name,
    iconicShape: canonical.iconicShape || 'silhouette',
    canonical: {
      canonicalId: canonical.canonicalId,
      name: canonical.name,
      franchise: canonical.franchise,
      medium: canonical.medium,
      iconicShape: canonical.iconicShape,
    },
    archetypeSignals: { primaryArchetypes: ['Hero'], secondaryArchetypes: ['Explorer'], shadowArchetypes: ['Outlaw'] },
    jungFunctions: { egoMode: 'Adaptive', personaMode: 'Charismatic', shadowPattern: 'Repression', feelingChannel: 'Loyalty', erosNeed: 'Connection', truthOrientation: 'Pragmatic', powerStance: 'Authoritative', relationalPattern: 'Protective' },
    narrativeArc: { woundOrigin: 'Unknown', desire: 'Purpose', fear: 'Failure', trials: ['Challenge'], transformation: 'Growth', redemption: 'Integration' },
    behavioralTraits: { strengths: ['Resourceful'], liabilities: ['Self-reliant'], triggers: ['Injustice'], compensations: ['Control'] },
    symbols: { motifs: ['Journey'], coreMetaphor: 'The seeker' },
    // Motif weights for constellation engine
    motifs: [
      { motif: 'HERO', weight: 0.6 },
      { motif: 'SEEKER_WANDERER', weight: 0.5 },
    ],
    provenance: { sources: ['Fallback'], generatedAt: new Date().toISOString(), modelVersion: 'fallback', profileVersion: 'v1' },
  };
}

/**
 * Retrieve canonical facts about character
 */
async function retrieveCanonicalFacts(canonical, client) {
  // In production, this would query a Character KB
  // For now, use AI to retrieve facts
  if (!client) {
    return {
      description: `Character from ${canonical.franchise}`,
      sources: [],
    };
  }

  try {
    const prompt = `Provide canonical facts about the character "${canonical.name}" from ${canonical.franchise} (${canonical.medium}).
    
Include:
- Brief description (2-3 sentences)
- Key story arcs and narrative journey
- Notable traits and behaviors
- Relationships and dynamics
- Character development/transformation

${canonical.portrayal ? `Note: This is the ${canonical.portrayal} portrayal.` : ''}

Return JSON:
{
  "description": "brief description",
  "narrativeArc": "key story journey",
  "traits": ["trait1", "trait2", ...],
  "relationships": ["relationship1", ...],
  "sources": ["source1", "source2"]
}`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_DISCOVERY_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a character analysis expert. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const content = response.choices[0].message.content.trim();
    return safeParseJSON(content, 'DiscoveryEngine.retrieveCharacterFacts');
  } catch (error) {
    console.error('[Discovery] Error retrieving facts:', error);
    return {
      description: `Character from ${canonical.franchise}`,
      sources: [],
    };
  }
}

/**
 * Extract CharacterProfile using LLM
 */
async function extractCharacterProfile(canonical, facts, options, client) {
  const prompt = `Analyze the character "${canonical.name}" from ${canonical.franchise} (${canonical.medium}) using Jungian psychology principles.

Character facts:
${facts.description || 'No description available'}
${facts.narrativeArc ? `Narrative arc: ${facts.narrativeArc}` : ''}
${facts.traits ? `Traits: ${facts.traits.join(', ')}` : ''}

Extract a complete CharacterProfile following Jungian principles. Focus on:
- Archetypal patterns (functional, not aesthetic)
- Ego vs Persona vs Shadow
- Narrative arc: wound → strategy → cost → redemption
- Behavioral traits (strengths, liabilities, triggers, compensations)
- Symbols and core metaphors

Return JSON matching this schema:
{
  "canonicalId": "${canonical.canonicalId}",
  "name": "${canonical.name}",
  "archetypeSignals": {
    "primaryArchetypes": ["archetype1", "archetype2"],
    "secondaryArchetypes": ["archetype3"],
    "shadowArchetypes": ["shadow1"]
  },
  "jungFunctions": {
    "egoMode": "how they decide/act",
    "personaMode": "public mask style",
    "shadowPattern": "darker fallback",
    "feelingChannel": "what softens/restores",
    "erosNeed": "love/meaning axis",
    "truthOrientation": "rules vs reality",
    "powerStance": "authority relationship",
    "relationalPattern": "mutuality/asymmetry"
  },
  "narrativeArc": {
    "wound": "symbolic origin/wound",
    "desire": "what they chase",
    "fear": "what they avoid",
    "trials": ["trial1", "trial2"],
    "transformation": "if any",
    "redemption": "what heals imbalance"
  },
  "behavioralTraits": {
    "strengths": ["strength1", "strength2", "strength3"],
    "liabilities": ["liability1", "liability2", "liability3"],
    "triggers": ["trigger1", "trigger2"],
    "compensations": ["compensation1", "compensation2"]
  },
  "symbols": {
    "motifs": ["motif1", "motif2"],
    "coreMetaphor": "one line core metaphor"
  },
  "motifs": [
    {"motif": "HERO", "weight": 0.8},
    {"motif": "SEEKER_WANDERER", "weight": 0.5}
  ]
}

IMPORTANT: For "motifs" array, use ONLY these enum values with weights 0.3-1.0:
[HERO, TRICKSTER, WISE_OLD_MAN, GREAT_MOTHER, FATHER_AUTHORITY, CHILD, LOVER_EROS, WARRIOR, MAGICIAN, CAREGIVER_HEALER, OUTLAW_REBEL, SEEKER_WANDERER]
Pick 2-4 most relevant motifs for this character.`;

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_DISCOVERY_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a Jungian psychology expert. Always respond with valid JSON only, following Jungian archetypal psychology principles.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0].message.content.trim();
    let parsed = safeParseJSON(content, 'DiscoveryEngine.generateProfileForUnknown');
    
    // Ensure canonicalId and name are set
    parsed.canonicalId = canonical.canonicalId;
    parsed.name = canonical.name;
    
    return parsed;
  } catch (error) {
    console.error('[Discovery] Error extracting profile:', error);
    throw new Error(`Failed to extract character profile: ${error.message}`);
  }
}

/**
 * Validate and enrich profile
 */
function validateAndEnrichProfile(profile, canonical) {
  // Sanity checks as per spec
  if (!profile.archetypeSignals || !profile.archetypeSignals.primaryArchetypes || 
      profile.archetypeSignals.primaryArchetypes.length === 0) {
    console.warn(`[Discovery] Profile missing primaryArchetypes for ${canonical.name}, adding defaults`);
    if (!profile.archetypeSignals) profile.archetypeSignals = {};
    if (!profile.archetypeSignals.primaryArchetypes) {
      profile.archetypeSignals.primaryArchetypes = ['Complex'];
    }
  }

  if (!profile.behavioralTraits || !profile.behavioralTraits.strengths || 
      profile.behavioralTraits.strengths.length < 3) {
    console.warn(`[Discovery] Profile missing sufficient strengths for ${canonical.name}`);
    if (!profile.behavioralTraits) profile.behavioralTraits = {};
    if (!profile.behavioralTraits.strengths) {
      profile.behavioralTraits.strengths = ['Strength to be discovered', 'Resilience', 'Depth'];
    }
  }

  if (!profile.behavioralTraits || !profile.behavioralTraits.liabilities || 
      profile.behavioralTraits.liabilities.length < 3) {
    console.warn(`[Discovery] Profile missing sufficient liabilities for ${canonical.name}`);
    if (!profile.behavioralTraits) profile.behavioralTraits = {};
    if (!profile.behavioralTraits.liabilities) {
      profile.behavioralTraits.liabilities = ['Liability to be discovered', 'Vulnerability', 'Complexity'];
    }
  }

  if (!profile.narrativeArc || !profile.narrativeArc.wound || !profile.narrativeArc.desire || !profile.narrativeArc.fear) {
    console.warn(`[Discovery] Profile missing narrative arc elements for ${canonical.name}`);
    if (!profile.narrativeArc) profile.narrativeArc = {};
    if (!profile.narrativeArc.wound) profile.narrativeArc.wound = 'Wound to be discovered';
    if (!profile.narrativeArc.desire) profile.narrativeArc.desire = 'Desire to be discovered';
    if (!profile.narrativeArc.fear) profile.narrativeArc.fear = 'Fear to be discovered';
  }

  // Preserve iconicShape from canonical (used for Psyche page shadow illustrations)
  if (canonical.iconicShape) {
    profile.iconicShape = canonical.iconicShape;
  }
  
  // Also preserve canonical info for reference
  profile.canonical = {
    canonicalId: canonical.canonicalId,
    name: canonical.name,
    franchise: canonical.franchise,
    medium: canonical.medium,
    iconicShape: canonical.iconicShape,
  };

  return profile;
}
