# API Key Setup

## OpenAI API Key

The intelligent engines require an OpenAI API key to function. The API key has been saved to `.env` file.

## Environment Variables

The `.env` file contains:
```
OPENAI_API_KEY=your-openai-api-key-here
```

## Optional Model Overrides

You can override the default models by adding to `.env`:
```
OPENAI_RECOGNITION_MODEL=gpt-4o
OPENAI_DISCOVERY_MODEL=gpt-4o
OPENAI_NARRATIVE_MODEL=gpt-4o
```

## Loading .env File

Make sure your backend loads the `.env` file. If using `dotenv`:

```bash
npm install dotenv
```

Then in `server.js`:
```javascript
import 'dotenv/config';
```

Or if using `node --env-file`:
```bash
node --env-file=.env src/server.js
```

## Testing

Once the API key is set and the backend is restarted, the system will:
1. **Recognize real characters** (e.g., "Gandalf", "Sherlock Holmes")
2. **Reject household items** (e.g., "tea cup", "air purifier")
3. **Generate dynamic narratives** based on character analysis

## Note on Quota

If you see "insufficient_quota" errors, check your OpenAI account billing and quota limits.
