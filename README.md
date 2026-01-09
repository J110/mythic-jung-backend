# Mythic Jung Backend API

Backend server for the Mythic Jung Flutter application. Provides API endpoints for profile management, assessment answers, and generating personalized Jungian archetypal profiles.

## Features

- RESTful API endpoints matching the Flutter app's `ApiClient`
- In-memory storage (easily replaceable with a database)
- Mock generation mode for testing without LLM
- Optional OpenAI integration for sophisticated output generation
- CORS enabled for web testing

## API Endpoints

### Profile
- `POST /v1/profile` - Update user profile with selected characters
- `GET /v1/profile` - Get current user profile

### Assessments
- `POST /v1/assessments/answer` - Submit an assessment answer
- `GET /v1/assessments` - Get all assessment answers for user

### Generation
- `POST /v1/generate` - Generate output (with optional `force` flag)
  - Body: `{ "force": false }` (optional)

### Output
- `GET /v1/output` - Get cached/last generated output

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. (Optional) Configure OpenAI API key in `.env` for LLM-based generation:
```
OPENAI_API_KEY=your_key_here
USE_MOCK_GENERATION=false
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3000` by default.

## Configuration

Environment variables (in `.env`):

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `OPENAI_API_KEY` - OpenAI API key for LLM generation (optional)
- `USE_MOCK_GENERATION` - Use mock generator instead of LLM (default: true)
- `MODEL_VERSION` - Model version string for meta output
- `PROMPT_VERSION` - Prompt version string for meta output
- `SCHEMA_VERSION` - Schema version number (default: 1)

## Testing with Flutter App

1. Update the Flutter app's `ApiClient` to use the backend:
   - Set `useMock: false`
   - Set `baseUrl: 'http://localhost:3000'` (or your server URL)

2. For web testing, ensure CORS is enabled (already configured).

3. The backend uses a default user ID. For production, implement proper authentication and pass user ID via headers (`x-user-id`).

## Development Notes

- Storage is currently in-memory. For production, replace `src/storage/memoryStore.js` with a database adapter.
- Mock generation creates sample output based on selected characters.
- LLM generation uses OpenAI GPT-4 by default (configurable via `OPENAI_MODEL`).
- All endpoints return JSON and follow RESTful conventions.

## Project Structure

```
backend/
├── src/
│   ├── server.js           # Main Express server
│   ├── routes/             # API route handlers
│   │   ├── profile.js
│   │   ├── assessments.js
│   │   ├── generate.js
│   │   └── output.js
│   ├── services/           # Business logic
│   │   ├── generationService.js
│   │   ├── mockGenerator.js
│   │   └── llmGenerator.js
│   └── storage/            # Data storage
│       └── memoryStore.js
├── package.json
├── .env.example
└── README.md
```
