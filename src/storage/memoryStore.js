// In-memory storage for development
// In production, replace with a proper database

class MemoryStore {
  constructor() {
    this.profiles = new Map(); // userId -> profile
    this.outputs = new Map(); // userId -> GeneratedOutput
    this.assessments = new Map(); // userId -> assessment answers
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
}

// Singleton instance
export const memoryStore = new MemoryStore();
