# AI Models Configuration

This document describes the AI models used in the Mythic Jung backend for generating high-quality, personalized content.

## Current Models

### 1. Character Validation (`aiCharacterValidator.js`)
- **Primary Model**: `o1-mini` (OpenAI's reasoning model)
- **Fallback**: `gpt-4o` (if o1-mini is unavailable)
- **Purpose**: Validates that character names are real characters from TV, movies, books, mythology, or real life
- **Why o1-mini**: Provides better reasoning to distinguish between real characters and products/objects/household items
- **Configuration**: Set via `OPENAI_VALIDATION_MODEL` environment variable

### 2. Character Recognition (`aiCharacterRecognition.js`)
- **Primary Model**: `o1-preview` (OpenAI's advanced reasoning model)
- **Fallback**: `gpt-4o` (if o1-preview is unavailable)
- **Purpose**: Deeply analyzes characters to extract Jungian archetypal patterns, psychological traits, shadow aspects, character arcs, etc.
- **Why o1-preview**: Requires deep thinking and analysis to understand character psychology and Jungian patterns
- **Configuration**: Set via `OPENAI_RECOGNITION_MODEL` environment variable

### 3. Narrative Generation (`llmGenerator.js`)
- **Primary Model**: `o1-preview` (OpenAI's advanced reasoning model)
- **Fallback**: `gpt-4o` (if o1-preview is unavailable)
- **Purpose**: Generates complete narrative output using LLM (when `USE_LLM_GENERATION=true`)
- **Why o1-preview**: Requires sophisticated reasoning to create coherent, personalized, Jungian-based narratives
- **Configuration**: Set via `OPENAI_MODEL` environment variable

## Model Features

### o1 Models (o1-preview, o1-mini)
- **Type**: Reasoning/thinking models
- **Strengths**: 
  - Deep chain-of-thought reasoning
  - Better understanding of complex instructions
  - Higher quality outputs for analytical tasks
- **Limitations**:
  - Don't support system messages (instructions must be in user message)
  - Don't support `response_format` parameter (JSON must be requested in prompt)
  - Don't support `temperature` parameter
  - More expensive than standard models
- **Best For**: Character analysis, validation, and narrative generation requiring deep thinking

### gpt-4o
- **Type**: Standard advanced model
- **Strengths**:
  - Supports all standard parameters (system messages, response_format, temperature)
  - Good balance of quality and cost
  - Reliable JSON output
- **Best For**: Fallback when o1 models are unavailable or too expensive

## Environment Variables

```bash
# Character validation model (default: o1-mini)
OPENAI_VALIDATION_MODEL=o1-mini

# Character recognition model (default: o1-preview)
OPENAI_RECOGNITION_MODEL=o1-preview

# Narrative generation model (default: o1-preview)
OPENAI_MODEL=o1-preview

# OpenAI API Key (required)
OPENAI_API_KEY=your_api_key_here
```

## Cost Considerations

- **o1-preview**: Most expensive, highest quality (use for character recognition and narrative generation)
- **o1-mini**: Moderate cost, good quality (use for validation)
- **gpt-4o**: Standard cost, good quality (use as fallback)

## Recommendations

1. **For Production**: Use `o1-preview` for character recognition and narrative generation to ensure highest quality
2. **For Development/Testing**: Use `gpt-4o` to reduce costs while maintaining good quality
3. **For Validation**: `o1-mini` provides good balance of quality and cost

## Model Availability

- o1 models require OpenAI API access
- If o1 models are unavailable, the system automatically falls back to `gpt-4o`
- All models require `OPENAI_API_KEY` to be set
