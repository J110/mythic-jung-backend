// In-memory storage for development
// In production, replace with a proper database

class MemoryStore {
  constructor() {
    // USER MANAGEMENT
    this.users = new Map(); // id -> user object
    this.usernameIndex = new Map(); // username (lowercase) -> userId
    
    // Me domain storage
    this.profiles = new Map(); // userId -> profile (Me characters)
    this.outputs = new Map(); // userId -> GeneratedOutput (Me output)
    this.assessments = new Map(); // userId -> assessment answers
    this.lockedPackets = new Map(); // userId -> locked character packets
    
    // Relationship domain storage (independent)
    this.relationshipSets = new Map(); // userId -> RelationshipCharacterSet
    this.relationshipOutputs = new Map(); // userId -> RelationshipOutput
    
    // Resonance/Clarification temp storage
    this.tempResonanceData = new Map(); // userId -> temp resonance analysis
    
    // User preferences (including tone)
    this.userPreferences = new Map(); // userId -> { narrativeTone, ... }
    
    // Tone-rendered output cache
    this.toneCache = new Map(); // cacheKey -> rendered output
    
    // PsycheModel runs storage
    this.runs = new Map(); // userId -> { ME: Map, REL: Map }
  }

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  saveUser(user) {
    this.users.set(user.id, user);
    this.usernameIndex.set(user.username.toLowerCase(), user.id);
    console.log(`[MemoryStore] Saved user: ${user.username} (${user.id})`);
  }

  getUser(userId) {
    return this.users.get(userId) || null;
  }

  getUserByUsername(username) {
    const normalizedUsername = username.toLowerCase();
    const userId = this.usernameIndex.get(normalizedUsername);
    if (!userId) return null;
    return this.users.get(userId) || null;
  }

  clearUserData(userId) {
    // Clear all data for a user but keep their account
    this.profiles.delete(userId);
    this.outputs.delete(userId);
    this.assessments.delete(userId);
    this.lockedPackets.delete(userId);
    this.relationshipSets.delete(userId);
    this.relationshipOutputs.delete(userId);
    this.tempResonanceData.delete(userId);
    this.userPreferences.delete(userId);
    this.runs.delete(userId);
    this.clearToneCacheForUser(userId);
    console.log(`[MemoryStore] Cleared all data for user: ${userId}`);
  }

  // ============================================================================
  // LOCKED PACKETS (Character data after clarification)
  // ============================================================================

  saveLockedPackets(userId, packets) {
    this.lockedPackets.set(userId, {
      packets,
      lockedAt: new Date().toISOString(),
    });
    console.log(`[MemoryStore] Saved ${packets.length} locked packets for user: ${userId}`);
  }

  getLockedPackets(userId) {
    const data = this.lockedPackets.get(userId);
    return data?.packets || null;
  }

  // ============================================================================
  // ME OUTPUT (Alias methods for clarity)
  // ============================================================================

  getMeOutput(userId) {
    return this.getOutput(userId);
  }

  saveMeOutput(userId, output) {
    this.saveOutput(userId, output);
  }

  // ============================================================================
  // TONE PREFERENCE
  // ============================================================================

  getTonePreference(userId) {
    const prefs = this.getUserPreferences(userId);
    return prefs?.narrativeTone || 'plain';
  }

  setTonePreference(userId, tone) {
    this.saveUserPreferences(userId, { narrativeTone: tone });
  }

  // ============================================================================
  // PSYCHE MODEL RUNS
  // ============================================================================

  saveRun(userId, context, psycheModel) {
    if (!this.runs.has(userId)) {
      this.runs.set(userId, { ME: new Map(), REL: new Map() });
    }
    const userRuns = this.runs.get(userId);
    userRuns[context].set(psycheModel.runId, psycheModel);
    console.log(`[MemoryStore] Saved run ${psycheModel.runId} for user ${userId} context ${context}`);
  }

  getRun(userId, context, runId) {
    return this.runs.get(userId)?.[context]?.get(runId) || null;
  }

  getLatestRun(userId, context) {
    const userRuns = this.runs.get(userId)?.[context];
    if (!userRuns || userRuns.size === 0) return null;
    return Array.from(userRuns.values()).sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )[0];
  }

  // Profile operations
  saveProfile(userId, profile) {
    this.profiles.set(userId, {
      ...profile,
      updatedAt: new Date().toISOString(),
    });
  }

  getProfile(userId) {
    return this.profiles.get(userId) || null;
  }

  // Output operations
  saveOutput(userId, output) {
    this.outputs.set(userId, {
      ...output,
      cachedAt: new Date().toISOString(),
    });
  }

  getOutput(userId) {
    return this.outputs.get(userId) || null;
  }

  clearOutput(userId) {
    this.outputs.delete(userId);
  }

  // Assessment operations
  saveAssessmentAnswer(userId, answer) {
    if (!this.assessments.has(userId)) {
      this.assessments.set(userId, []);
    }
    const answers = this.assessments.get(userId);
    
    // Remove existing answer for same question
    const filtered = answers.filter(
      (a) => !(a.assessmentType === answer.assessmentType && a.questionId === answer.questionId)
    );
    
    filtered.push({
      ...answer,
      updatedAt: new Date().toISOString(),
    });
    
    this.assessments.set(userId, filtered);
  }

  getAssessmentAnswers(userId) {
    return this.assessments.get(userId) || [];
  }

  // Get all data for a user (for generation)
  getUserData(userId) {
    return {
      profile: this.getProfile(userId),
      assessments: this.getAssessmentAnswers(userId),
      cachedOutput: this.getOutput(userId),
    };
  }

  // ============================================================================
  // RELATIONSHIP STORAGE (Independent from Me)
  // ============================================================================

  // Relationship set operations
  saveRelationshipSet(userId, relationshipSet) {
    this.relationshipSets.set(userId, {
      ...relationshipSet,
      updatedAt: new Date().toISOString(),
    });
  }

  getRelationshipSet(userId) {
    return this.relationshipSets.get(userId) || null;
  }

  clearRelationshipSet(userId) {
    this.relationshipSets.delete(userId);
    this.relationshipOutputs.delete(userId);
  }

  // Relationship output operations
  saveRelationshipOutput(userId, output) {
    this.relationshipOutputs.set(userId, {
      ...output,
      cachedAt: new Date().toISOString(),
    });
  }

  getRelationshipOutput(userId) {
    return this.relationshipOutputs.get(userId) || null;
  }

  clearRelationshipOutput(userId) {
    this.relationshipOutputs.delete(userId);
  }

  // Get all relationship data for a user
  getRelationshipData(userId) {
    return {
      relationshipSet: this.getRelationshipSet(userId),
      cachedOutput: this.getRelationshipOutput(userId),
      // Optional: include Me data if available (for enrichment)
      meProfile: this.getProfile(userId),
      meSelfModel: this.getOutput(userId)?.selfModel || null,
    };
  }

  // ============================================================================
  // RESONANCE/CLARIFICATION TEMP STORAGE
  // ============================================================================

  // Save temporary resonance data (during clarification flow)
  saveTempResonanceData(userId, data) {
    this.tempResonanceData.set(userId, {
      ...data,
      savedAt: new Date().toISOString(),
    });
  }

  // Get temporary resonance data
  getTempResonanceData(userId) {
    return this.tempResonanceData.get(userId) || null;
  }

  // Clear temporary resonance data
  clearTempResonanceData(userId) {
    this.tempResonanceData.delete(userId);
  }

  // Save confirmed character references (persists until new characters)
  saveCharacterReferences(userId, references) {
    // Store references alongside the profile
    const profile = this.getProfile(userId);
    if (profile) {
      this.saveProfile(userId, {
        ...profile,
        characterReferences: references,
      });
    }
  }

  // Get character references for generation
  getCharacterReferences(userId) {
    const profile = this.getProfile(userId);
    return profile?.characterReferences || [];
  }

  // Save relationship character references (separate from Me characters)
  saveRelationshipCharacterReferences(userId, recognizedCharacters) {
    const relationshipSet = this.getRelationshipSet(userId);
    if (relationshipSet) {
      this.saveRelationshipSet(userId, {
        ...relationshipSet,
        recognizedCharacters, // Store the full recognition results
      });
    }
  }

  // Get relationship character references
  getRelationshipCharacterReferences(userId) {
    const relationshipSet = this.getRelationshipSet(userId);
    return relationshipSet?.recognizedCharacters || [];
  }

  // ============================================================================
  // USER PREFERENCES (Including Narrative Tone)
  // ============================================================================

  // Save user preferences
  saveUserPreferences(userId, preferences) {
    const existing = this.userPreferences.get(userId) || {};
    this.userPreferences.set(userId, {
      ...existing,
      ...preferences,
      updatedAt: new Date().toISOString(),
    });
  }

  // Get user preferences
  getUserPreferences(userId) {
    return this.userPreferences.get(userId) || { narrativeTone: 'PLAIN' };
  }

  // Get narrative tone specifically
  getNarrativeTone(userId) {
    const prefs = this.getUserPreferences(userId);
    return prefs.narrativeTone || 'PLAIN';
  }

  // Set narrative tone
  setNarrativeTone(userId, tone) {
    this.saveUserPreferences(userId, { narrativeTone: tone });
  }

  // ============================================================================
  // TONE-RENDERED OUTPUT CACHE
  // ============================================================================

  // Save tone-rendered output
  saveToneCache(cacheKey, renderedOutput) {
    this.toneCache.set(cacheKey, {
      output: renderedOutput,
      cachedAt: new Date().toISOString(),
    });
  }

  // Get tone-rendered output
  getToneCache(cacheKey) {
    const cached = this.toneCache.get(cacheKey);
    if (!cached) return null;
    
    // Optional: add TTL check here
    return cached.output;
  }

  // Clear tone cache for a user (when canonical output changes)
  clearToneCacheForUser(userId) {
    const keysToDelete = [];
    for (const key of this.toneCache.keys()) {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.toneCache.delete(key));
  }

  // Clear all tone cache
  clearAllToneCache() {
    this.toneCache.clear();
  }
}

// Singleton instance
export const memoryStore = new MemoryStore();
