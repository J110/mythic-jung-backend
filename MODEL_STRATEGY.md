# Model Usage Strategy (Quality-First)

## Core Principle (Non-Negotiable)

**User-facing narrative quality is the product.**

Cost optimization must NEVER degrade symbolic depth, coherence, or specificity.
If a cheaper model produces flatter, generic, or psychologically shallow output, DO NOT use it.

---

## Approved Model Strategy

### Primary Model: GPT-4o (Full)

Use for ALL user-facing narrative generation:
- Story
- Identification (all subcategories)
- Functioning
- Actions
- Life Domains
- Reevaluation regeneration

**Required for:**
- Mythic coherence
- Symbolic continuity
- Holding multiple Jungian constraints
- Non-generic, emotionally resonant output

### Auxiliary Model: GPT-4o-mini

Use ONLY for short, non-symbolic tasks:
- Character recognition disambiguation (1-2 sentences)
- Short delta summaries ("What changed")
- Draft CharacterProfile extraction (if validated)

**NEVER use for:**
- Story
- Identity synthesis narrative
- Life meaning or relational guidance
- Long multi-section JSON outputs

---

## Engine-by-Engine Configuration

### 1. Character Recognition Engine
- **Model**: `gpt-4o-mini`
- **Use**: Rerank candidates, generate clarification prompts
- **ENV**: `OPENAI_RECOGNITION_MODEL`

### 2. Character Discovery Engine
- **Model**: `gpt-4o` (required)
- **Use**: Extract CharacterProfile with archetypal depth
- **ENV**: `OPENAI_DISCOVERY_MODEL`
- **Note**: Discovery quality affects EVERYTHING downstream

### 3. Synthesis Engine
- **Model**: NONE (deterministic)
- **Use**: Weight-based mapping, tension identification
- **Note**: Must be explainable and stable across runs

### 4. Narrative Engine (MOST IMPORTANT)
- **Model**: `gpt-4o` (required)
- **Use**: All user-facing content generation
- **ENV**: `OPENAI_NARRATIVE_MODEL`
- **Note**: This IS the product differentiation

---

## Cost Control Strategy

Cost savings achieved via **architecture**, not cheaper models:

### 1. Aggressive Caching
- CharacterProfiles cached by `canonicalId`
- SelfModel cached by `inputHash`
- GeneratedOutput cached by `inputHash`
- 24-hour cache validity

### 2. Debounced Regeneration
- Don't regenerate on every keystroke
- Batch assessment updates
- Frontend debounce: 500ms

### 3. Partial Reevaluation
- `regenerateNarrativeOnly()` - reuses cached SelfModel
- Update only affected sections when possible

### 4. Two-Pass Generation
- Outline: Deterministic (from SelfModel)
- Final render: GPT-4o

---

## Environment Variables

```env
# Model configuration (defaults shown)
OPENAI_RECOGNITION_MODEL=gpt-4o-mini
OPENAI_DISCOVERY_MODEL=gpt-4o
OPENAI_NARRATIVE_MODEL=gpt-4o

# Required
OPENAI_API_KEY=your-key-here
```

---

## Automatic Escalation Rule

If any of the following are detected, retry with GPT-4o:
- Repeated phrases
- Generic advice language
- Loss of symbolic continuity
- Flattened archetypes
- Psychology clichés
- Weak emotional resonance

---

## What NOT To Do

❌ Do not prioritize token cost over narrative quality
❌ Do not force GPT-4o-mini to do symbolic work
❌ Do not add prompt hacks to compensate for model limits
❌ Do not silently degrade quality
❌ Do not hardcode fallback text

---

## Acceptance Criteria

Implementation is correct ONLY IF:
- ✅ Users feel **seen**, not summarized
- ✅ Outputs are **specific to their characters**
- ✅ Story reads like **myth**, not analysis
- ✅ Reevaluation feels like a **shift in inner relationship**, not a "score update"
- ✅ Cost savings come from **less regeneration**, not worse models

---

## Monthly Cost Estimate

Under realistic usage (1000 users/month, 3 generations each):
- Recognition: ~$2 (gpt-4o-mini, short prompts)
- Discovery: ~$45 (gpt-4o, cached profiles)
- Narrative: ~$90 (gpt-4o, full output)
- **Total: ~$137/month**

With caching (90% hit rate):
- **Effective: ~$30-40/month**
