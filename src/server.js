import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Import routes
import { profileRouter } from './routes/profile.js';
import { assessmentRouter } from './routes/assessments.js';
import { generateRouter } from './routes/generate.js';
import { outputRouter } from './routes/output.js';
import { relationshipRouter } from './routes/relationship.js';
import { resonanceRouter } from './routes/resonance.js';
import { toneRouter } from './routes/tone.js';
import { archetypesRouter } from './routes/archetypes.js';
import { runsRouter } from './routes/runs.js';
import { usersRouter } from './routes/users.js';

// Import infrastructure services
import { initDatabase, closeDatabase, db } from './storage/database.js';
import { initCache, closeCache, cache } from './services/cacheService.js';
import { getQueueStats, clearQueue, waitForIdle } from './services/aiQueue.js';
import { generalLimiter, authLimiter } from './middleware/rateLimiter.js';

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// CORS CONFIGURATION - Allow all origins for now to debug
// ============================================================================

// Simple CORS - allow all origins (safe for this app type)
app.use(cors({
  origin: true,  // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Requested-With'],
}));

// Also add manual CORS headers as fallback (runs before other middleware)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// ============================================================================
// REQUEST PARSING
// ============================================================================

app.use(express.json({ limit: '10mb' }));

// ============================================================================
// RATE LIMITING (applies to all routes)
// ============================================================================

if (process.env.NODE_ENV === 'production') {
  app.use(generalLimiter);
}

// ============================================================================
// REQUEST LOGGING (development)
// ============================================================================

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path !== '/health') {
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      }
    });
    next();
  });
}

// ============================================================================
// HEALTH CHECK & STATUS ENDPOINTS
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

app.get('/v1/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
  });
});

// Detailed status endpoint (internal use)
app.get('/v1/status', async (req, res) => {
  try {
    const queueStats = getQueueStats();
    const cacheStats = await cache.getStats();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: db.isUsingDatabase(),
        type: db.isUsingDatabase() ? 'postgresql' : 'memory',
      },
      cache: {
        connected: cache.isUsingRedis(),
        type: cache.isUsingRedis() ? 'redis' : 'memory',
        ...cacheStats,
      },
      aiQueue: queueStats,
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

// ============================================================================
// API ROUTES
// ============================================================================

// Users (authentication) - with auth rate limiting
app.use('/v1/users', authLimiter, usersRouter);

// Resonance (clarification flow)
app.use('/v1/resonance', resonanceRouter);

// Me domain
app.use('/v1/profile', profileRouter);
app.use('/v1/assessments', assessmentRouter);
app.use('/v1/generate', generateRouter);
app.use('/v1/output', outputRouter);

// Relationship domain (independent)
app.use('/v1/relationship', relationshipRouter);

// Tone (narrative presentation)
app.use('/v1/tone', toneRouter);

// Archetypes (constellation)
app.use('/v1', archetypesRouter);

// Runs (unified PsycheModel)
app.use('/v1/runs', runsRouter);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handling middleware - ensures CORS headers are set even on errors
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Always set CORS headers on errors
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Rate limit errors
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: err.message,
      retryAfter: err.retryAfter,
    });
  }
  
  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS error',
      message: 'Origin not allowed',
    });
  }
  
  // Generic error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let server;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);
  
  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('[Server] HTTP server closed');
    });
  }
  
  try {
    // Wait for AI queue to drain (with timeout)
    console.log('[Server] Waiting for AI queue to drain...');
    const queueTimeout = setTimeout(() => {
      console.log('[Server] Queue drain timeout, clearing...');
      clearQueue();
    }, 10000); // 10 second timeout
    
    await waitForIdle();
    clearTimeout(queueTimeout);
    console.log('[Server] AI queue drained');
    
    // Close database connection
    await closeDatabase();
    
    // Close cache connection
    await closeCache();
    
    console.log('[Server] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Server] Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer() {
  try {
    console.log('[Server] Starting Mythic Jung Backend...');
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize database
    const dbConnected = await initDatabase();
    console.log(`[Server] Database: ${dbConnected ? 'PostgreSQL connected' : 'Using in-memory storage'}`);
    
    // Initialize cache
    const cacheConnected = await initCache();
    console.log(`[Server] Cache: ${cacheConnected ? 'Redis connected' : 'Using in-memory cache'}`);
    
    // Check OpenAI
    console.log(`[Server] OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Not set ✗'}`);
    
    // Start HTTP server
    server = app.listen(PORT, HOST, () => {
      console.log(`[Server] Running on http://${HOST}:${PORT}`);
      console.log('[Server] Ready to accept connections');
    });
    
    // Set server timeout for long-running AI requests
    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 65000; // Slightly higher than ALB timeout
    server.headersTimeout = 66000;
    
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
