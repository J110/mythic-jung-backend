/**
 * PsycheModel Schema
 * 
 * The canonical, immutable per-run record that serves as the single source of truth
 * for both Constellation and Identification UI modules.
 * 
 * Based on: PRODUCTION_AGENT_SPECS - Unify Constellation + Identification
 */

import crypto from 'crypto';

// Structural archetype keys (from spec)
export const StructuralRole = {
  EGO: 'EGO',
  PERSONA: 'PERSONA',
  SHADOW: 'SHADOW',
  FEELING_FUNCTION: 'FEELING_FUNCTION',
  EROS_AXIS: 'EROS_AXIS',
  SELF_DIRECTION: 'SELF_DIRECTION',
};

// UI Label mapping (how Constellation labels map to structural roles)
export const UI_LABEL_MAPPING = {
  coreSelfRole: 'EGO',
  socialSelfRole: 'PERSONA',
  hiddenSelfRole: 'SHADOW',
  innerOppositeRole: 'FEELING_FUNCTION',
  directionRole: 'SELF_DIRECTION',
  vitalityRole: 'EROS_AXIS',
};

// Profile stability types
export const ProfileType = {
  DOMINANT: 'DOMINANT',      // Single character dominates 3+ roles
  DISTRIBUTED: 'DISTRIBUTED', // Roles spread across characters
  MIXED: 'MIXED',            // Some overlap, but not dominant
};

// Quality flag types
export const QualityFlag = {
  OVER_COLLAPSED_ROLES: 'OVER_COLLAPSED_ROLES',   // Ego=Persona=Shadow with low evidence
  WEAK_EVIDENCE_ROLE: 'WEAK_EVIDENCE_ROLE',       // Confidence below threshold
  EXAMPLE_GAP: 'EXAMPLE_GAP',                     // Role assigned but no examples
  LOW_COVERAGE: 'LOW_COVERAGE',                   // Assessment coverage too low
};

// Engine version tracking
export const ENGINE_VERSIONS = {
  recognition: '1.0.0',
  discovery: '1.0.0',
  resonance: '1.0.0',
  synthesis: '2.0.0',
  constellation: '1.0.0',
  examples: '1.0.0',
  narrative: '1.0.0',
};

/**
 * Create a hash from input data for caching/comparison
 */
export function createInputHash(data) {
  const str = JSON.stringify(data);
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

/**
 * Generate a unique run ID
 */
export function generateRunId() {
  return `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Create a StructuralPosition object
 */
export function createStructuralPosition(primary, options = {}) {
  return {
    primary: primary || null,
    secondary: options.secondary || [],
    confidence: options.confidence || 0.5,
    evidenceFlags: options.evidenceFlags || [],
  };
}

/**
 * Create a SelfDirectionPosition object
 */
export function createSelfDirectionPosition(vector, options = {}) {
  return {
    vector: vector || ['integration', 'growth'],
    confidence: options.confidence || 0.5,
    evidenceFlags: options.evidenceFlags || [],
  };
}

/**
 * Create a MotifDistribution entry
 */
export function createMotifEntry(motif, score) {
  return {
    motif,
    score: Math.round(score * 100) / 100,
  };
}

/**
 * Compute profile stability type
 */
export function computeStabilityType(structuralPositions) {
  // Count how many roles each character appears in
  const characterRoleCount = new Map();
  
  Object.entries(structuralPositions).forEach(([role, position]) => {
    if (role === 'SELF_DIRECTION') return; // Skip non-character position
    
    const primary = position?.primary;
    if (primary) {
      characterRoleCount.set(primary, (characterRoleCount.get(primary) || 0) + 1);
    }
  });
  
  // Find max role count
  let maxCount = 0;
  let dominantChar = null;
  characterRoleCount.forEach((count, char) => {
    if (count > maxCount) {
      maxCount = count;
      dominantChar = char;
    }
  });
  
  if (maxCount >= 3) {
    return {
      profileType: ProfileType.DOMINANT,
      dominantCharacterId: dominantChar,
    };
  } else if (maxCount === 1) {
    return {
      profileType: ProfileType.DISTRIBUTED,
      dominantCharacterId: null,
    };
  } else {
    return {
      profileType: ProfileType.MIXED,
      dominantCharacterId: null,
    };
  }
}

/**
 * Compute quality flags from PsycheModel data
 */
export function computeQualityFlags(structuralPositions, motifDistribution, assessmentCoverage = 0) {
  const flags = [];
  
  // Check for over-collapsed roles (same character in Ego, Persona, Shadow)
  const ego = structuralPositions[StructuralRole.EGO]?.primary;
  const persona = structuralPositions[StructuralRole.PERSONA]?.primary;
  const shadow = structuralPositions[StructuralRole.SHADOW]?.primary;
  
  if (ego && ego === persona && ego === shadow) {
    flags.push(QualityFlag.OVER_COLLAPSED_ROLES);
  }
  
  // Check for weak evidence roles
  Object.entries(structuralPositions).forEach(([role, position]) => {
    if (role !== 'SELF_DIRECTION' && position?.confidence < 0.4) {
      flags.push(`${QualityFlag.WEAK_EVIDENCE_ROLE}:${role}`);
    }
  });
  
  // Check assessment coverage
  if (assessmentCoverage < 0.3) {
    flags.push(QualityFlag.LOW_COVERAGE);
  }
  
  return flags;
}

/**
 * Create a complete PsycheModel object
 */
export function createPsycheModel({
  userId,
  context,
  inputHashes,
  structuralPositions,
  motifDistribution,
  shadowMotifs,
  assessmentCoverage = 0,
  engineVersionsOverride = null,
}) {
  const runId = generateRunId();
  const stability = computeStabilityType(structuralPositions);
  const qualityFlags = computeQualityFlags(structuralPositions, motifDistribution, assessmentCoverage);
  
  return {
    runId,
    userId,
    context, // 'ME' or 'REL'
    createdAt: new Date().toISOString(),
    inputHashes,
    engineVersions: engineVersionsOverride || ENGINE_VERSIONS,
    
    // Structural positions (authoritative source)
    structuralPositions,
    
    // Motif data (computed by constellation engine)
    motifDistribution,
    shadowMotifs,
    
    // UI mapping (how to display structural roles)
    uiLabelMapping: UI_LABEL_MAPPING,
    
    // Stability analysis
    stability: {
      profileType: stability.profileType,
      dominantCharacterId: stability.dominantCharacterId,
      shiftSummary: [], // Populated if roles shift from previous run
    },
    
    // Quality flags for debugging/UX warnings
    qualityFlags,
  };
}

/**
 * Create a Relationship PsycheModel (extends base with partner + relationship)
 */
export function createRelationshipPsycheModel({
  userId,
  inputHashes,
  partnerStructuralPositions,
  partnerMotifDistribution,
  partnerShadowMotifs,
  relationshipConstellation,
  meSummary = null,
  assessmentCoverage = 0,
  engineVersionsOverride = null,
}) {
  const runId = generateRunId();
  const partnerStability = computeStabilityType(partnerStructuralPositions);
  const qualityFlags = computeQualityFlags(partnerStructuralPositions, partnerMotifDistribution, assessmentCoverage);
  
  return {
    runId,
    userId,
    context: 'REL',
    createdAt: new Date().toISOString(),
    inputHashes,
    engineVersions: engineVersionsOverride || ENGINE_VERSIONS,
    
    // Optional: Me summary for comparison
    meSummary,
    
    // Partner structural positions (authoritative source for partner)
    partnerStructuralPositions,
    partnerMotifDistribution,
    partnerShadowMotifs,
    
    // Partner UI mapping
    partnerUiLabelMapping: UI_LABEL_MAPPING,
    
    // Relationship constellation (shared/complementary/tensions/field)
    relationshipConstellation,
    
    // Partner stability
    stability: {
      profileType: partnerStability.profileType,
      dominantCharacterId: partnerStability.dominantCharacterId,
      shiftSummary: [],
    },
    
    qualityFlags,
  };
}

/**
 * Validate that a PsycheModel is structurally correct
 * Returns { valid: boolean, errors: string[] }
 */
export function validatePsycheModel(psycheModel) {
  const errors = [];
  
  // Check required fields
  if (!psycheModel.runId) errors.push('Missing runId');
  if (!psycheModel.userId) errors.push('Missing userId');
  if (!psycheModel.context) errors.push('Missing context');
  if (!psycheModel.structuralPositions && !psycheModel.partnerStructuralPositions) {
    errors.push('Missing structural positions');
  }
  
  // Check structural positions have required roles
  const positions = psycheModel.structuralPositions || psycheModel.partnerStructuralPositions;
  if (positions) {
    const requiredRoles = [StructuralRole.EGO, StructuralRole.PERSONA, StructuralRole.SHADOW];
    requiredRoles.forEach(role => {
      if (!positions[role]) {
        errors.push(`Missing structural position: ${role}`);
      }
    });
  }
  
  // Validate uiLabelMapping against structural positions
  const labelMapping = psycheModel.uiLabelMapping || psycheModel.partnerUiLabelMapping;
  if (labelMapping && positions) {
    Object.entries(labelMapping).forEach(([uiLabel, role]) => {
      if (role !== 'SELF_DIRECTION' && !positions[role]) {
        errors.push(`UI label ${uiLabel} maps to non-existent role ${role}`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
