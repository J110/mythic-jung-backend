# Quick Start

## Backend is Ready! 🚀

The backend has been created with all necessary endpoints. Here's how to get started:

### Step 1: Install Dependencies

```bash
cd /Users/anmolmohan/Projects/flutter_app/backend
npm install
```

### Step 2: Start the Server

```bash
npm start
```

You should see:
```
Server running on http://localhost:3000
Environment: development
Mock generation: true
```

### Step 3: Connect Your Flutter App

Update your Flutter app's `lib/core/storage/repositories.dart`:

**Find this line (around line 18):**
```dart
return ApiClient(useMock: true);
```

**Replace with:**
```dart
return ApiClient(
  baseUrl: 'http://localhost:3000',  // or 'http://127.0.0.1:3000' for web
  useMock: false,
);
```

### Step 4: Test It!

1. Make sure the backend is running (`npm start` in the backend directory)
2. Run your Flutter app in Chrome
3. The app should now connect to the backend and generate outputs!

## API Endpoints Available

- `POST /v1/profile` - Save selected characters
- `POST /v1/assessments/answer` - Submit assessment answers  
- `POST /v1/generate` - Generate personalized output
- `GET /v1/output` - Get cached output

## What's Included

✅ Express server with CORS enabled  
✅ All API endpoints matching your Flutter app  
✅ Mock generation (works without API keys)  
✅ Optional OpenAI integration for advanced generation  
✅ In-memory storage (ready for database upgrade)  
✅ Error handling and validation  

## Next Steps (Optional)

- Add a database (replace `memoryStore.js`)
- Add authentication (currently uses default user)
- Configure OpenAI for LLM generation (see `.env.example`)

See `README.md` for full documentation.
