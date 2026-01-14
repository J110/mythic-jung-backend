// Database abstraction layer
// Supports PostgreSQL via Prisma with fallback to in-memory for development

import { memoryStore } from './memoryStore.js';

let prisma = null;
let useDatabase = false;

// Initialize database connection
export async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  // Check if we have a real database URL (not the placeholder)
  if (databaseUrl && !databaseUrl.includes('johndoe:randompassword')) {
    try {
      console.log('[Database] Attempting to connect to PostgreSQL...');
      
      // Try to import Prisma client
      let PrismaClient;
      try {
        const prismaModule = await import('../generated/prisma/index.js');
        PrismaClient = prismaModule.PrismaClient;
      } catch (importError) {
        console.warn('[Database] Prisma client not found or failed to import:', importError.message);
        console.log('[Database] Falling back to in-memory storage');
        useDatabase = false;
        return false;
      }
      
      prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
      
      // Test connection with timeout
      const connectPromise = prisma.$connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      useDatabase = true;
      console.log('[Database] Connected to PostgreSQL');
      return true;
    } catch (error) {
      console.warn('[Database] Failed to connect to PostgreSQL, falling back to in-memory storage:', error.message);
      useDatabase = false;
      prisma = null;
      return false;
    }
  } else {
    console.log('[Database] No DATABASE_URL configured, using in-memory storage');
    console.log('[Database] ⚠️  Data will be lost on server restart!');
    useDatabase = false;
    return false;
  }
}

// Graceful shutdown
export async function closeDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    console.log('[Database] Disconnected from PostgreSQL');
  }
}

// ============================================================================
// DATABASE SERVICE - Unified interface for both Prisma and MemoryStore
// ============================================================================

export const db = {
  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================
  
  async saveUser(user) {
    if (useDatabase) {
      // Only save id and username to DB (displayName is derived from username)
      const savedUser = await prisma.user.upsert({
        where: { id: user.id },
        update: { username: user.username },
        create: { id: user.id, username: user.username },
      });
      // Return with displayName derived from original input or username
      return {
        ...savedUser,
        displayName: user.displayName || savedUser.username,
      };
    } else {
      memoryStore.saveUser(user);
      return user;
    }
  },

  async getUser(userId) {
    if (useDatabase) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        // Ensure displayName is always present (fallback to username)
        user.displayName = user.displayName || user.username;
      }
      return user;
    } else {
      return memoryStore.getUser(userId);
    }
  },

  async getUserByUsername(username) {
    if (useDatabase) {
      const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
      if (user) {
        // Ensure displayName is always present (fallback to username)
        user.displayName = user.displayName || user.username;
      }
      return user;
    } else {
      return memoryStore.getUserByUsername(username);
    }
  },

  async clearUserData(userId) {
    if (useDatabase) {
      // Delete all related data (cascade will handle most, but be explicit)
      await prisma.$transaction([
        prisma.assessment.deleteMany({ where: { userId } }),
        prisma.lockedPacket.deleteMany({ where: { userId } }),
        prisma.psycheRun.deleteMany({ where: { userId } }),
        prisma.toneCache.deleteMany({ where: { userId } }),
        prisma.tempResonanceData.deleteMany({ where: { userId } }),
        prisma.profile.deleteMany({ where: { userId } }),
        prisma.meOutput.deleteMany({ where: { userId } }),
        prisma.relationshipSet.deleteMany({ where: { userId } }),
        prisma.relationshipOutput.deleteMany({ where: { userId } }),
        prisma.userPreferences.deleteMany({ where: { userId } }),
      ]);
      console.log(`[Database] Cleared all data for user: ${userId}`);
    } else {
      memoryStore.clearUserData(userId);
    }
  },

  // ============================================================================
  // PROFILE
  // ============================================================================

  async saveProfile(userId, profile) {
    if (useDatabase) {
      // Ensure user exists
      await this.ensureUser(userId);
      
      return prisma.profile.upsert({
        where: { userId },
        update: {
          characters: profile.characters || [],
          characterReferences: profile.characterReferences || null,
        },
        create: {
          userId,
          characters: profile.characters || [],
          characterReferences: profile.characterReferences || null,
        },
      });
    } else {
      memoryStore.saveProfile(userId, profile);
      return profile;
    }
  },

  async getProfile(userId) {
    if (useDatabase) {
      const profile = await prisma.profile.findUnique({ where: { userId } });
      return profile ? {
        characters: profile.characters,
        characterReferences: profile.characterReferences,
        updatedAt: profile.updatedAt,
      } : null;
    } else {
      return memoryStore.getProfile(userId);
    }
  },

  // ============================================================================
  // ME OUTPUT
  // ============================================================================

  async saveMeOutput(userId, output) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      return prisma.meOutput.upsert({
        where: { userId },
        update: {
          selfModel: output.selfModel || null,
          story: output.story || null,
          identification: output.identification || null,
          functioning: output.functioning || null,
          actions: output.actions || null,
          lifeDomains: output.lifeDomains || null,
          myth: output.myth || null,
          identificationV2: output.identificationV2 || output.identification_v2 || null,
          constellation: output.constellation || null,
          examples: output.examples || null,
          characterProfiles: output.characterProfiles || null,
          meta: output.meta || null,
        },
        create: {
          userId,
          selfModel: output.selfModel || null,
          story: output.story || null,
          identification: output.identification || null,
          functioning: output.functioning || null,
          actions: output.actions || null,
          lifeDomains: output.lifeDomains || null,
          myth: output.myth || null,
          identificationV2: output.identificationV2 || output.identification_v2 || null,
          constellation: output.constellation || null,
          examples: output.examples || null,
          characterProfiles: output.characterProfiles || null,
          meta: output.meta || null,
        },
      });
    } else {
      memoryStore.saveMeOutput(userId, output);
      return output;
    }
  },

  async getMeOutput(userId) {
    if (useDatabase) {
      const output = await prisma.meOutput.findUnique({ where: { userId } });
      if (!output) return null;
      
      return {
        selfModel: output.selfModel,
        story: output.story,
        identification: output.identification,
        functioning: output.functioning,
        actions: output.actions,
        lifeDomains: output.lifeDomains,
        myth: output.myth,
        identificationV2: output.identificationV2,
        constellation: output.constellation,
        examples: output.examples,
        characterProfiles: output.characterProfiles,
        meta: output.meta,
        cachedAt: output.generatedAt,
      };
    } else {
      return memoryStore.getMeOutput(userId);
    }
  },

  async clearMeOutput(userId) {
    if (useDatabase) {
      await prisma.meOutput.deleteMany({ where: { userId } });
    } else {
      memoryStore.clearOutput(userId);
    }
  },

  // ============================================================================
  // LOCKED PACKETS
  // ============================================================================

  async saveLockedPackets(userId, packets) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      // Delete existing and insert new
      await prisma.lockedPacket.deleteMany({ where: { userId } });
      
      const creates = packets.map((packet, index) => ({
        userId,
        slotIndex: index,
        packet,
      }));
      
      await prisma.lockedPacket.createMany({ data: creates });
      console.log(`[Database] Saved ${packets.length} locked packets for user: ${userId}`);
    } else {
      memoryStore.saveLockedPackets(userId, packets);
    }
  },

  async getLockedPackets(userId) {
    if (useDatabase) {
      const packets = await prisma.lockedPacket.findMany({
        where: { userId },
        orderBy: { slotIndex: 'asc' },
      });
      return packets.length > 0 ? packets.map(p => p.packet) : null;
    } else {
      return memoryStore.getLockedPackets(userId);
    }
  },

  // ============================================================================
  // RELATIONSHIP SET
  // ============================================================================

  async saveRelationshipSet(userId, relationshipSet) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      console.log(`[Database] Saving relationship set for user ${userId}:`, {
        enabled: relationshipSet.enabled,
        relationshipType: relationshipSet.relationshipType,
        otherCharacterInputs: relationshipSet.otherCharacterInputs?.length,
        recognizedCharacters: relationshipSet.recognizedCharacters?.length,
      });
      
      return prisma.relationshipSet.upsert({
        where: { userId },
        update: {
          enabled: relationshipSet.enabled ?? false,
          relationshipType: relationshipSet.relationshipType || null,
          otherLabel: relationshipSet.otherLabel || null,
          otherCharacterInputs: relationshipSet.otherCharacterInputs || null,
          recognizedCharacters: relationshipSet.recognizedCharacters || null,
          referenceHints: relationshipSet.referenceHints || null,
          // Legacy fields
          partnerName: relationshipSet.partnerName || null,
          partnerCharacters: relationshipSet.partnerCharacters || relationshipSet.otherCharacterInputs || null,
        },
        create: {
          userId,
          enabled: relationshipSet.enabled ?? false,
          relationshipType: relationshipSet.relationshipType || null,
          otherLabel: relationshipSet.otherLabel || null,
          otherCharacterInputs: relationshipSet.otherCharacterInputs || null,
          recognizedCharacters: relationshipSet.recognizedCharacters || null,
          referenceHints: relationshipSet.referenceHints || null,
          // Legacy fields
          partnerName: relationshipSet.partnerName || null,
          partnerCharacters: relationshipSet.partnerCharacters || relationshipSet.otherCharacterInputs || null,
        },
      });
    } else {
      memoryStore.saveRelationshipSet(userId, relationshipSet);
      return relationshipSet;
    }
  },

  async getRelationshipSet(userId) {
    if (useDatabase) {
      const rs = await prisma.relationshipSet.findUnique({ where: { userId } });
      if (!rs) return null;
      
      console.log(`[Database] Retrieved relationship set for user ${userId}:`, {
        enabled: rs.enabled,
        relationshipType: rs.relationshipType,
        otherCharacterInputs: rs.otherCharacterInputs?.length,
      });
      
      return {
        enabled: rs.enabled,
        relationshipType: rs.relationshipType,
        otherLabel: rs.otherLabel,
        otherCharacterInputs: rs.otherCharacterInputs,
        recognizedCharacters: rs.recognizedCharacters,
        referenceHints: rs.referenceHints,
        // Legacy fields for backward compatibility
        partnerName: rs.partnerName,
        partnerCharacters: rs.partnerCharacters,
        updatedAt: rs.updatedAt,
      };
    } else {
      return memoryStore.getRelationshipSet(userId);
    }
  },

  async clearRelationshipSet(userId) {
    if (useDatabase) {
      await prisma.relationshipSet.deleteMany({ where: { userId } });
      await prisma.relationshipOutput.deleteMany({ where: { userId } });
    } else {
      memoryStore.clearRelationshipSet(userId);
    }
  },

  // ============================================================================
  // RELATIONSHIP OUTPUT
  // ============================================================================

  async saveRelationshipOutput(userId, output) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      return prisma.relationshipOutput.upsert({
        where: { userId },
        update: {
          dynamics: output.dynamics || null,
          compatibility: output.compatibility || null,
          growth: output.growth || null,
          whatIf: output.whatIf || null,
        },
        create: {
          userId,
          dynamics: output.dynamics || null,
          compatibility: output.compatibility || null,
          growth: output.growth || null,
          whatIf: output.whatIf || null,
        },
      });
    } else {
      memoryStore.saveRelationshipOutput(userId, output);
      return output;
    }
  },

  async getRelationshipOutput(userId) {
    if (useDatabase) {
      const output = await prisma.relationshipOutput.findUnique({ where: { userId } });
      if (!output) return null;
      
      return {
        dynamics: output.dynamics,
        compatibility: output.compatibility,
        growth: output.growth,
        whatIf: output.whatIf,
        cachedAt: output.generatedAt,
      };
    } else {
      return memoryStore.getRelationshipOutput(userId);
    }
  },

  async clearRelationshipOutput(userId) {
    if (useDatabase) {
      await prisma.relationshipOutput.deleteMany({ where: { userId } });
    } else {
      memoryStore.clearRelationshipOutput(userId);
    }
  },

  // ============================================================================
  // TONE PREFERENCES
  // ============================================================================

  async getTonePreference(userId) {
    if (useDatabase) {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
      return prefs?.narrativeTone || 'PLAIN';
    } else {
      return memoryStore.getTonePreference(userId);
    }
  },

  async setTonePreference(userId, tone) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      await prisma.userPreferences.upsert({
        where: { userId },
        update: { narrativeTone: tone },
        create: { userId, narrativeTone: tone },
      });
    } else {
      memoryStore.setTonePreference(userId, tone);
    }
  },

  // ============================================================================
  // TONE CACHE
  // ============================================================================

  async saveToneCache(cacheKey, userId, tone, outputType, rendered) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      return prisma.toneCache.upsert({
        where: { cacheKey },
        update: { rendered, cachedAt: new Date() },
        create: {
          userId,
          cacheKey,
          tone,
          outputType,
          rendered,
        },
      });
    } else {
      memoryStore.saveToneCache(cacheKey, rendered);
    }
  },

  async getToneCache(cacheKey) {
    if (useDatabase) {
      const cached = await prisma.toneCache.findUnique({ where: { cacheKey } });
      return cached?.rendered || null;
    } else {
      return memoryStore.getToneCache(cacheKey);
    }
  },

  async clearToneCacheForUser(userId) {
    if (useDatabase) {
      await prisma.toneCache.deleteMany({ where: { userId } });
    } else {
      memoryStore.clearToneCacheForUser(userId);
    }
  },

  // ============================================================================
  // TEMP RESONANCE DATA
  // ============================================================================

  async saveTempResonanceData(userId, data, context = null) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      return prisma.tempResonanceData.upsert({
        where: { userId },
        update: { data, context },
        create: { userId, data, context },
      });
    } else {
      memoryStore.saveTempResonanceData(userId, data);
    }
  },

  async getTempResonanceData(userId) {
    if (useDatabase) {
      const temp = await prisma.tempResonanceData.findUnique({ where: { userId } });
      return temp?.data || null;
    } else {
      return memoryStore.getTempResonanceData(userId);
    }
  },

  async clearTempResonanceData(userId) {
    if (useDatabase) {
      await prisma.tempResonanceData.deleteMany({ where: { userId } });
    } else {
      memoryStore.clearTempResonanceData(userId);
    }
  },

  // ============================================================================
  // PSYCHE RUNS
  // ============================================================================

  async saveRun(userId, context, psycheModel) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      return prisma.psycheRun.upsert({
        where: {
          userId_context_runId: { userId, context, runId: psycheModel.runId },
        },
        update: { data: psycheModel },
        create: {
          userId,
          context,
          runId: psycheModel.runId,
          data: psycheModel,
        },
      });
    } else {
      memoryStore.saveRun(userId, context, psycheModel);
    }
  },

  async getRun(userId, context, runId) {
    if (useDatabase) {
      const run = await prisma.psycheRun.findUnique({
        where: { userId_context_runId: { userId, context, runId } },
      });
      return run?.data || null;
    } else {
      return memoryStore.getRun(userId, context, runId);
    }
  },

  async getLatestRun(userId, context) {
    if (useDatabase) {
      const run = await prisma.psycheRun.findFirst({
        where: { userId, context },
        orderBy: { createdAt: 'desc' },
      });
      return run?.data || null;
    } else {
      return memoryStore.getLatestRun(userId, context);
    }
  },

  // ============================================================================
  // CHARACTER REFERENCES
  // ============================================================================

  async saveCharacterReferences(userId, references) {
    if (useDatabase) {
      const profile = await this.getProfile(userId);
      if (profile) {
        await this.saveProfile(userId, { ...profile, characterReferences: references });
      }
    } else {
      memoryStore.saveCharacterReferences(userId, references);
    }
  },

  async getCharacterReferences(userId) {
    if (useDatabase) {
      const profile = await prisma.profile.findUnique({ where: { userId } });
      return profile?.characterReferences || [];
    } else {
      return memoryStore.getCharacterReferences(userId);
    }
  },

  // ============================================================================
  // ASSESSMENTS
  // ============================================================================

  async saveAssessmentAnswer(userId, answer) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      return prisma.assessment.upsert({
        where: {
          userId_assessmentType_questionId: {
            userId,
            assessmentType: answer.assessmentType,
            questionId: answer.questionId,
          },
        },
        update: { answer },
        create: {
          userId,
          assessmentType: answer.assessmentType,
          questionId: answer.questionId,
          answer,
        },
      });
    } else {
      memoryStore.saveAssessmentAnswer(userId, answer);
    }
  },

  async getAssessmentAnswers(userId) {
    if (useDatabase) {
      const assessments = await prisma.assessment.findMany({ where: { userId } });
      return assessments.map(a => a.answer);
    } else {
      return memoryStore.getAssessmentAnswers(userId);
    }
  },

  // ============================================================================
  // USER PREFERENCES
  // ============================================================================

  async saveUserPreferences(userId, preferences) {
    if (useDatabase) {
      await this.ensureUser(userId);
      
      const existing = await prisma.userPreferences.findUnique({ where: { userId } });
      
      return prisma.userPreferences.upsert({
        where: { userId },
        update: {
          narrativeTone: preferences.narrativeTone || existing?.narrativeTone || 'PLAIN',
          otherPrefs: { ...(existing?.otherPrefs || {}), ...preferences },
        },
        create: {
          userId,
          narrativeTone: preferences.narrativeTone || 'PLAIN',
          otherPrefs: preferences,
        },
      });
    } else {
      memoryStore.saveUserPreferences(userId, preferences);
    }
  },

  async getUserPreferences(userId) {
    if (useDatabase) {
      const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
      return prefs ? {
        narrativeTone: prefs.narrativeTone,
        ...prefs.otherPrefs,
      } : { narrativeTone: 'PLAIN' };
    } else {
      return memoryStore.getUserPreferences(userId);
    }
  },

  // ============================================================================
  // COMBINED DATA FETCHERS
  // ============================================================================

  async getUserData(userId) {
    return {
      profile: await this.getProfile(userId),
      assessments: await this.getAssessmentAnswers(userId),
      cachedOutput: await this.getMeOutput(userId),
    };
  },

  async getRelationshipData(userId) {
    return {
      relationshipSet: await this.getRelationshipSet(userId),
      cachedOutput: await this.getRelationshipOutput(userId),
      meProfile: await this.getProfile(userId),
      meSelfModel: (await this.getMeOutput(userId))?.selfModel || null,
    };
  },

  // ============================================================================
  // UTILITIES
  // ============================================================================

  async ensureUser(userId) {
    if (useDatabase) {
      const exists = await prisma.user.findUnique({ where: { id: userId } });
      if (!exists) {
        await prisma.user.create({
          data: { id: userId, username: `user_${userId.slice(0, 8)}` },
        });
      }
    }
  },

  isUsingDatabase() {
    return useDatabase;
  },

  getPrisma() {
    return prisma;
  },
};
