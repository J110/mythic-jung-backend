/**
 * Jungian Archetype Taxonomy
 * 
 * This is the SINGLE SOURCE OF TRUTH for archetype definitions.
 * Do not expand dynamically - changes require version increment.
 */

export const TAXONOMY_VERSION = '1.0.0';

// ============================================================================
// STRUCTURAL ARCHETYPES (Jung's core psychological components)
// ============================================================================

export const StructuralArchetype = {
  EGO: 'EGO',
  PERSONA: 'PERSONA',
  SHADOW: 'SHADOW',
  ANIMA_ANIMUS: 'ANIMA_ANIMUS',
  SELF_DIRECTION: 'SELF_DIRECTION',
};

export const STRUCTURAL_ARCHETYPES = Object.values(StructuralArchetype);

// Display labels per tone
export const STRUCTURAL_LABELS = {
  EGO: { plain: 'Core Self', mythic: 'The Ego', analytical: 'Ego Complex' },
  PERSONA: { plain: 'Social Self', mythic: 'The Mask', analytical: 'Persona' },
  SHADOW: { plain: 'Hidden Self', mythic: 'The Shadow', analytical: 'Shadow Complex' },
  ANIMA_ANIMUS: { plain: 'Inner Opposite', mythic: 'The Soul Image', analytical: 'Anima/Animus' },
  SELF_DIRECTION: { plain: 'Life Direction', mythic: 'The Self', analytical: 'Individuation Vector' },
};

// ============================================================================
// MOTIF ARCHETYPES (Archetypal figure images - max 12)
// ============================================================================

export const MotifArchetype = {
  HERO: 'HERO',
  TRICKSTER: 'TRICKSTER',
  WISE_OLD_MAN: 'WISE_OLD_MAN',
  GREAT_MOTHER: 'GREAT_MOTHER',
  FATHER_AUTHORITY: 'FATHER_AUTHORITY',
  CHILD: 'CHILD',
  LOVER_EROS: 'LOVER_EROS',
  WARRIOR: 'WARRIOR',
  MAGICIAN: 'MAGICIAN',
  CAREGIVER_HEALER: 'CAREGIVER_HEALER',
  OUTLAW_REBEL: 'OUTLAW_REBEL',
  SEEKER_WANDERER: 'SEEKER_WANDERER',
};

export const MOTIF_ARCHETYPES = Object.values(MotifArchetype);

// Display labels per tone
export const MOTIF_LABELS = {
  HERO: { plain: 'Hero', mythic: 'The Hero', analytical: 'Hero Archetype' },
  TRICKSTER: { plain: 'Trickster', mythic: 'The Trickster', analytical: 'Trickster Archetype' },
  WISE_OLD_MAN: { plain: 'Sage', mythic: 'The Wise Old Man', analytical: 'Senex/Wise Old Man' },
  GREAT_MOTHER: { plain: 'Nurturer', mythic: 'The Great Mother', analytical: 'Great Mother Archetype' },
  FATHER_AUTHORITY: { plain: 'Authority', mythic: 'The Father', analytical: 'Father/Authority Archetype' },
  CHILD: { plain: 'Inner Child', mythic: 'The Divine Child', analytical: 'Puer/Puella Archetype' },
  LOVER_EROS: { plain: 'Lover', mythic: 'The Lover', analytical: 'Eros/Lover Archetype' },
  WARRIOR: { plain: 'Warrior', mythic: 'The Warrior', analytical: 'Warrior Archetype' },
  MAGICIAN: { plain: 'Transformer', mythic: 'The Magician', analytical: 'Magician/Alchemist Archetype' },
  CAREGIVER_HEALER: { plain: 'Healer', mythic: 'The Healer', analytical: 'Caregiver/Healer Archetype' },
  OUTLAW_REBEL: { plain: 'Rebel', mythic: 'The Outlaw', analytical: 'Shadow Hero/Rebel Archetype' },
  SEEKER_WANDERER: { plain: 'Seeker', mythic: 'The Wanderer', analytical: 'Seeker/Wanderer Archetype' },
};

// Motif descriptions for narrative context
export const MOTIF_DESCRIPTIONS = {
  HERO: 'courage, transformation through challenge, proving oneself',
  TRICKSTER: 'boundary-crossing, disruption, playful subversion',
  WISE_OLD_MAN: 'wisdom, guidance, accumulated knowledge',
  GREAT_MOTHER: 'nurturing, protection, unconditional acceptance',
  FATHER_AUTHORITY: 'structure, rules, discipline, order',
  CHILD: 'innocence, wonder, vulnerability, new beginnings',
  LOVER_EROS: 'passion, connection, intimacy, desire',
  WARRIOR: 'strength, discipline, courage, protection',
  MAGICIAN: 'transformation, vision, making the impossible possible',
  CAREGIVER_HEALER: 'compassion, service, restoration, care',
  OUTLAW_REBEL: 'liberation, disruption of status quo, authenticity',
  SEEKER_WANDERER: 'quest, exploration, restlessness, meaning-seeking',
};

// ============================================================================
// TENSION MAP (Static pairs that create archetypal tension)
// ============================================================================

export const TENSION_PAIRS = [
  { a: 'FATHER_AUTHORITY', b: 'OUTLAW_REBEL', theme: 'control_vs_freedom' },
  { a: 'GREAT_MOTHER', b: 'TRICKSTER', theme: 'nurture_vs_chaos' },
  { a: 'WARRIOR', b: 'LOVER_EROS', theme: 'strength_vs_vulnerability' },
  { a: 'HERO', b: 'TRICKSTER', theme: 'order_vs_subversion' },
  { a: 'WISE_OLD_MAN', b: 'CHILD', theme: 'wisdom_vs_innocence' },
  { a: 'FATHER_AUTHORITY', b: 'CHILD', theme: 'structure_vs_spontaneity' },
  { a: 'CAREGIVER_HEALER', b: 'WARRIOR', theme: 'care_vs_combat' },
  { a: 'MAGICIAN', b: 'SEEKER_WANDERER', theme: 'transformation_vs_seeking' },
  { a: 'OUTLAW_REBEL', b: 'CAREGIVER_HEALER', theme: 'disruption_vs_stability' },
];

// Tension theme labels per tone
export const TENSION_THEME_LABELS = {
  control_vs_freedom: { plain: 'Control vs Freedom', mythic: 'The Throne and the Open Road', analytical: 'Authority-Autonomy Axis' },
  nurture_vs_chaos: { plain: 'Care vs Chaos', mythic: 'The Hearth and the Wild', analytical: 'Containment-Disruption Axis' },
  strength_vs_vulnerability: { plain: 'Strength vs Softness', mythic: 'The Sword and the Heart', analytical: 'Ares-Eros Polarity' },
  order_vs_subversion: { plain: 'Order vs Mischief', mythic: 'The Quest and the Jest', analytical: 'Hero-Trickster Polarity' },
  wisdom_vs_innocence: { plain: 'Knowing vs Wonder', mythic: 'The Sage and the Child', analytical: 'Senex-Puer Polarity' },
  structure_vs_spontaneity: { plain: 'Rules vs Play', mythic: 'The Law and the Leap', analytical: 'Structure-Spontaneity Axis' },
  care_vs_combat: { plain: 'Healing vs Fighting', mythic: 'The Healer and the Warrior', analytical: 'Care-Combat Polarity' },
  transformation_vs_seeking: { plain: 'Change vs Search', mythic: 'The Crucible and the Quest', analytical: 'Transformation-Seeking Axis' },
  disruption_vs_stability: { plain: 'Disruption vs Stability', mythic: 'The Storm and the Shelter', analytical: 'Chaos-Order Axis' },
};

// ============================================================================
// SHADOW-LIKELY MOTIFS (motifs more associated with shadow material)
// ============================================================================

export const SHADOW_LIKELY_MOTIFS = [
  'TRICKSTER',
  'OUTLAW_REBEL',
  'SHADOW', // meta-reference
];

// ============================================================================
// TRAIT-TO-MOTIF MAPPING (deterministic mapping from character traits)
// ============================================================================

export const TRAIT_TO_MOTIF_MAP = {
  // Primary archetype signals
  'hero': { motif: 'HERO', weight: 0.8 },
  'warrior': { motif: 'WARRIOR', weight: 0.8 },
  'mentor': { motif: 'WISE_OLD_MAN', weight: 0.7 },
  'sage': { motif: 'WISE_OLD_MAN', weight: 0.8 },
  'trickster': { motif: 'TRICKSTER', weight: 0.8 },
  'lover': { motif: 'LOVER_EROS', weight: 0.8 },
  'caregiver': { motif: 'CAREGIVER_HEALER', weight: 0.8 },
  'healer': { motif: 'CAREGIVER_HEALER', weight: 0.7 },
  'rebel': { motif: 'OUTLAW_REBEL', weight: 0.8 },
  'outlaw': { motif: 'OUTLAW_REBEL', weight: 0.8 },
  'innocent': { motif: 'CHILD', weight: 0.7 },
  'child': { motif: 'CHILD', weight: 0.6 },
  'explorer': { motif: 'SEEKER_WANDERER', weight: 0.8 },
  'seeker': { motif: 'SEEKER_WANDERER', weight: 0.8 },
  'wanderer': { motif: 'SEEKER_WANDERER', weight: 0.7 },
  'magician': { motif: 'MAGICIAN', weight: 0.8 },
  'creator': { motif: 'MAGICIAN', weight: 0.6 },
  'ruler': { motif: 'FATHER_AUTHORITY', weight: 0.7 },
  'authority': { motif: 'FATHER_AUTHORITY', weight: 0.7 },
  'father': { motif: 'FATHER_AUTHORITY', weight: 0.6 },
  'mother': { motif: 'GREAT_MOTHER', weight: 0.7 },
  'nurturer': { motif: 'GREAT_MOTHER', weight: 0.7 },
  
  // Behavioral traits
  'courageous': { motif: 'HERO', weight: 0.5 },
  'brave': { motif: 'HERO', weight: 0.5 },
  'protective': { motif: 'WARRIOR', weight: 0.5 },
  'disciplined': { motif: 'WARRIOR', weight: 0.4 },
  'wise': { motif: 'WISE_OLD_MAN', weight: 0.5 },
  'knowing': { motif: 'WISE_OLD_MAN', weight: 0.4 },
  'playful': { motif: 'TRICKSTER', weight: 0.5 },
  'mischievous': { motif: 'TRICKSTER', weight: 0.6 },
  'chaotic': { motif: 'TRICKSTER', weight: 0.5 },
  'passionate': { motif: 'LOVER_EROS', weight: 0.5 },
  'romantic': { motif: 'LOVER_EROS', weight: 0.5 },
  'sensual': { motif: 'LOVER_EROS', weight: 0.4 },
  'caring': { motif: 'CAREGIVER_HEALER', weight: 0.5 },
  'nurturing': { motif: 'GREAT_MOTHER', weight: 0.5 },
  'compassionate': { motif: 'CAREGIVER_HEALER', weight: 0.5 },
  'rebellious': { motif: 'OUTLAW_REBEL', weight: 0.6 },
  'defiant': { motif: 'OUTLAW_REBEL', weight: 0.5 },
  'innocent': { motif: 'CHILD', weight: 0.5 },
  'naive': { motif: 'CHILD', weight: 0.4 },
  'curious': { motif: 'SEEKER_WANDERER', weight: 0.5 },
  'adventurous': { motif: 'SEEKER_WANDERER', weight: 0.5 },
  'transformative': { motif: 'MAGICIAN', weight: 0.5 },
  'visionary': { motif: 'MAGICIAN', weight: 0.5 },
  'controlling': { motif: 'FATHER_AUTHORITY', weight: 0.5 },
  'structured': { motif: 'FATHER_AUTHORITY', weight: 0.4 },
  'maternal': { motif: 'GREAT_MOTHER', weight: 0.6 },
  'unconditional': { motif: 'GREAT_MOTHER', weight: 0.4 },
};

// ============================================================================
// SCORING CONSTANTS
// ============================================================================

export const SCORING = {
  MIN_MOTIF_SCORE: 0.25,       // Minimum score to include a motif
  TOP_MOTIFS_COUNT: 5,          // Max top motifs to return
  SHADOW_MOTIFS_COUNT: 2,       // Max shadow motifs to return
  
  // Multipliers
  PHASE_MATCH_MULTIPLIER: 1.2,  // Boost when phase matches selection
  PHASE_EXCLUDE_MULTIPLIER: 0,  // Hard exclude
  
  // Resonance adjustments (per context/signal)
  CONTEXT_BOOST: 0.05,          // Per matching context
  CONTEXT_CAP: 0.2,             // Max context boost
  EMOTION_BOOST: 0.1,           // For Energized/Seen/Challenged
  NEGATIVE_PENALTY: -0.1,       // For negativeText match
  NEGATIVE_CAP: -0.2,           // Max negative penalty
  ADMIRATION_BOOST: 0.1,        // For admiration match
  ADMIRATION_CAP: 0.2,          // Max admiration boost
  
  // Assessment adjustments
  ROLE_ALIGN_BOOST: 0.1,        // Character in aligned role
  SHADOW_ROLE_SHADOW_MOTIF: 0.05, // Shadow role + shadow-likely motif
  SHADOW_ROLE_OTHER_MOTIF: -0.05, // Shadow role + non-shadow motif
  ASSESSMENT_CAP: 0.2,          // Max assessment adjustment
  
  // Relationship thresholds
  SHARED_THRESHOLD: 0.30,       // Both sides must exceed for "shared"
  COMPLEMENTARY_DELTA: 0.35,    // Difference threshold for complementary
  COMPLEMENTARY_MIN: 0.35,      // Minimum score for higher side
  TENSION_MIN_SCORE: 0.40,      // Minimum score for tension detection
};

// ============================================================================
// FIELD LABELS (for relationship constellation)
// ============================================================================

export const FIELD_LABELS = {
  // Single motif fields (when shared)
  HERO: { plain: 'Heroic Field', mythic: 'The Quest Field', analytical: 'Hero-Dominant Field' },
  TRICKSTER: { plain: 'Playful Field', mythic: 'The Trickster Field', analytical: 'Trickster-Dominant Field' },
  WISE_OLD_MAN: { plain: 'Wisdom Field', mythic: 'The Sage Field', analytical: 'Senex-Dominant Field' },
  GREAT_MOTHER: { plain: 'Nurturing Field', mythic: 'The Mother Field', analytical: 'Maternal-Dominant Field' },
  FATHER_AUTHORITY: { plain: 'Structured Field', mythic: 'The Authority Field', analytical: 'Paternal-Dominant Field' },
  CHILD: { plain: 'Innocent Field', mythic: 'The Child Field', analytical: 'Puer-Dominant Field' },
  LOVER_EROS: { plain: 'Passionate Field', mythic: 'The Eros Field', analytical: 'Eros-Dominant Field' },
  WARRIOR: { plain: 'Protective Field', mythic: 'The Warrior Field', analytical: 'Warrior-Dominant Field' },
  MAGICIAN: { plain: 'Transformative Field', mythic: 'The Magician Field', analytical: 'Alchemical Field' },
  CAREGIVER_HEALER: { plain: 'Healing Field', mythic: 'The Healer Field', analytical: 'Therapeutic Field' },
  OUTLAW_REBEL: { plain: 'Rebellious Field', mythic: 'The Outlaw Field', analytical: 'Anti-Hero Field' },
  SEEKER_WANDERER: { plain: 'Seeking Field', mythic: 'The Wanderer Field', analytical: 'Quest-Dominant Field' },
  
  // Fallback
  COMPLEMENTARY: { plain: 'Complementary Field', mythic: 'The Dance of Opposites', analytical: 'Compensatory Field' },
};

export default {
  TAXONOMY_VERSION,
  StructuralArchetype,
  STRUCTURAL_ARCHETYPES,
  STRUCTURAL_LABELS,
  MotifArchetype,
  MOTIF_ARCHETYPES,
  MOTIF_LABELS,
  MOTIF_DESCRIPTIONS,
  TENSION_PAIRS,
  TENSION_THEME_LABELS,
  SHADOW_LIKELY_MOTIFS,
  TRAIT_TO_MOTIF_MAP,
  SCORING,
  FIELD_LABELS,
};
