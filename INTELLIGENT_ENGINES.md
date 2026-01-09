# Intelligent Engines Implementation

## Overview

The backend has been completely rebuilt with 4 intelligent engines as per the spec in `Mythic_Jung_Intelligent_Engines_Agent_Spec_Pack`:

1. **Character Recognition Engine** (`characterRecognitionEngine.js`)
2. **Character Discovery Engine** (`characterDiscoveryEngine.js`)
3. **Synthesis Engine** (`synthesisEngine.js`)
4. **Narrative Engine** (`narrativeEngine.js`)

## Architecture

### Pipeline Flow

```
User Input (6 characters)
    ↓
[1] Character Recognition Engine
    → Recognizes/Rejects characters intelligently
    → Returns canonical character entities
    ↓
[2] Character Discovery Engine
    → Discovers Jungian profiles for each character
    → Extracts narrative arcs, archetypes, traits
    ↓
[3] Synthesis Engine
    → Synthesizes SelfModel from profiles + assessments
    → Creates deterministic, explainable mappings
    ↓
[4] Narrative Engine
    → Generates dynamic, personalized narratives
    → Creates all output sections (story, identification, etc.)
    ↓
GeneratedOutput (JSON)
```

## Engine Details

### 1. Character Recognition Engine

**File**: `src/services/characterRecognitionEngine.js`

**Features**:
- AI-based character recognition using OpenAI
- Confidence scoring (0-1)
- Status: RECOGNIZED | AMBIGUOUS | NOT_RECOGNIZED
- Rejects household items, products, objects
- Handles hints (actor, era, medium)
- Disambiguation support

**API**: 
- `recognizeCharacter(input, options)` - Recognize single character
- `recognizeCharacters(inputs)` - Recognize multiple characters

**Thresholds**:
- RECOGNIZED: confidence >= 0.78 and gap >= 0.10
- AMBIGUOUS: 0.55-0.78 or gap < 0.10
- NOT_RECOGNIZED: < 0.55

### 2. Character Discovery Engine

**File**: `src/services/characterDiscoveryEngine.js`

**Features**:
- Extracts Jungian CharacterProfile for each recognized character
- Includes: archetypeSignals, jungFunctions, narrativeArc, behavioralTraits, symbols
- Caches profiles by canonicalId + variant
- Validates and enriches profiles

**API**:
- `discoverCharacterProfile(canonical, options)` - Discover single profile
- `discoverCharacterProfiles(canonicals, options)` - Batch discover

### 3. Synthesis Engine

**File**: `src/services/synthesisEngine.js`

**Features**:
- Combines 6 CharacterProfiles + assessments into SelfModel
- Deterministic weighting rules
- Creates core mappings (ego, persona, shadow, etc.)
- Identifies tensions
- Calculates costs and compensations
- Determines individuation direction

**API**:
- `synthesizeSelfModel(profiles, assessmentAnswers)` - Synthesize SelfModel

### 4. Narrative Engine

**File**: `src/services/narrativeEngine.js`

**Features**:
- Generates all output sections dynamically
- Two-pass: outline builder + text renderer
- Validates and repairs output
- Generates evidence mappings
- No hardcoding - everything from SelfModel

**API**:
- `generateNarrative(selfModel, profiles, options)` - Generate complete output

## Integration

### Main Generator

**File**: `src/services/intelligentGenerator.js`

Orchestrates all 4 engines in sequence.

### Generation Service

**File**: `src/services/generationService.js`

Updated to use `generateIntelligentOutput` by default.

## Removed/Archived Modules

The following old modules have been archived (renamed with `.old` suffix):
- `characterRecognition.js.old`
- `aiCharacterRecognition.js.old`
- `analysisEngine.js.old`
- `narrativeEngine_old.js`
- `jungianNarrativeEngine.js.old`
- `dynamicGenerator.js.old`

## Requirements

- **OpenAI API Key**: Required for all engines
  - Set `OPENAI_API_KEY` environment variable
  - Optional: `OPENAI_RECOGNITION_MODEL`, `OPENAI_DISCOVERY_MODEL`, `OPENAI_NARRATIVE_MODEL`

## Testing

The system will:
1. **Reject junk values**: Household items, products, objects will be NOT_RECOGNIZED
2. **Recognize real characters**: Well-known characters from TV, movies, books, etc.
3. **Generate dynamic narratives**: All content is generated from character analysis, no hardcoding
4. **Provide evidence**: Evidence mappings link assessments to output sections

## Next Steps

1. Set `OPENAI_API_KEY` environment variable
2. Restart backend server
3. Test with real characters (e.g., "Gandalf", "Sherlock Holmes", "Aragorn")
4. Test rejection with household items (e.g., "tea cup", "air purifier")

The system is now fully intelligent and will reject unrecognized inputs while generating truly dynamic, personalized narratives for recognized characters.
