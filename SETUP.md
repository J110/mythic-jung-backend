# Quick Setup Guide

## 1. Install Dependencies

```bash
cd backend
npm install
```

## 2. Create Environment File

```bash
cp .env.example .env
```

The default `.env` will use mock generation (no API key needed).

## 3. Start the Backend Server

```bash
npm start
```

The server will run on `http://localhost:3000`

## 4. Update Flutter App to Use Backend

In your Flutter app, update `lib/core/storage/repositories.dart`:

Change line 18 from:
```dart
return ApiClient(useMock: true);
```

To:
```dart
return ApiClient(
  baseUrl: 'http://localhost:3000',
  useMock: false,
);
```

For web testing in Chrome, you may need to use `http://127.0.0.1:3000` instead of `localhost`.

## 5. Test the Connection

1. Start the backend server
2. Run your Flutter app in Chrome
3. The app should now connect to the backend API

## Optional: Enable LLM Generation

If you want to use OpenAI for more sophisticated generation:

1. Get an OpenAI API key
2. Update `.env`:
   ```
   OPENAI_API_KEY=your_key_here
   USE_MOCK_GENERATION=false
   ```
3. Restart the server

## Troubleshooting

- **CORS errors**: The backend already has CORS enabled. If you still see errors, check that the backend is running.
- **Connection refused**: Make sure the backend server is running on port 3000.
- **404 errors**: Verify the API endpoints match what the Flutter app expects.
