import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { profileRouter } from './routes/profile.js';
import { assessmentRouter } from './routes/assessments.js';
import { generateRouter } from './routes/generate.js';
import { outputRouter } from './routes/output.js';
import { relationshipRouter } from './routes/relationship.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// CORS configuration for production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:5000',
  process.env.FRONTEND_URL, // Set this in Render to your Vercel URL
].filter(Boolean);

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
          return callback(null, true);
        }
        // In production, also allow any vercel.app domain
        if (origin.includes('vercel.app')) {
          return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
      }
    : true, // Allow all origins in development
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes - Me domain
app.use('/v1/profile', profileRouter);
app.use('/v1/assessments', assessmentRouter);
app.use('/v1/generate', generateRouter);
app.use('/v1/output', outputRouter);

// API Routes - Relationship domain (independent)
app.use('/v1/relationship', relationshipRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Set ✓' : 'Not set ✗'}`);
});
