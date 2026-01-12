// In-memory storage for development
// In production, replace with a proper database

class MemoryStore {
  constructor() {
    // Me domain storage
    this.profiles = new Map(); // userId -> profile (Me characters)
    this.outputs = new Map(); // userId -> GeneratedOutput (Me output)
    this.assessments = new Map(); // userId -> assessment answers
    
    // Relationship domain storage (independent)
    this.relationshipSets = new Map(); // userId -> RelationshipCharacterSet
    this.relationshipOutputs = new Map(); // userId -> RelationshipOutput
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
}

// Singleton instance
export const memoryStore = new MemoryStore();
