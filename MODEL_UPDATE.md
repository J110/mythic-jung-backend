# Model Update to gpt-4o-mini

## ✅ All Models Updated

All OpenAI models have been changed from `gpt-4o` to `gpt-4o-mini` for cost efficiency.

### Updated Files:

1. **characterRecognitionEngine.js**
   - `OPENAI_RECOGNITION_MODEL` default: `gpt-4o` → `gpt-4o-mini`
   - Used for: Character recognition and candidate retrieval

2. **characterDiscoveryEngine.js**
   - `OPENAI_DISCOVERY_MODEL` default: `gpt-4o` → `gpt-4o-mini`
   - Used for: Extracting Jungian character profiles

3. **narrativeEngine.js**
   - `OPENAI_NARRATIVE_MODEL` default: `gpt-4o` → `gpt-4o-mini`
   - Used for: Generating narrative text from outlines

4. **llmGenerator.js**
   - `OPENAI_MODEL` default: `o1-preview` → `gpt-4o-mini`
   - Used for: Legacy LLM generation (if enabled)

## Test Results

✅ **Minimal test passed** with `gpt-4o-mini`:
- Tested with 2 characters: "james bond", "nelson mandela"
- Both recognized with 100% confidence
- API calls: 2 (one per character)
- Model: `gpt-4o-mini`

## Cost Savings

`gpt-4o-mini` is significantly cheaper than `gpt-4o`:
- **Input**: ~$0.15 per 1M tokens (vs $2.50 for gpt-4o)
- **Output**: ~$0.60 per 1M tokens (vs $10.00 for gpt-4o)
- **Savings**: ~94% on input, ~94% on output

## Override Models (Optional)

You can still override models via environment variables in `.env`:
```bash
OPENAI_RECOGNITION_MODEL=gpt-4o-mini
OPENAI_DISCOVERY_MODEL=gpt-4o-mini
OPENAI_NARRATIVE_MODEL=gpt-4o-mini
```

## Testing

Run minimal test:
```bash
node test_minimal.js
```

This test uses only 2 API calls (one per character) to verify recognition works.
