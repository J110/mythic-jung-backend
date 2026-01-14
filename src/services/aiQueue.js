// AI Request Queue Service
// Prevents overwhelming OpenAI API with concurrent requests
// Uses p-queue for controlled concurrency

import PQueue from 'p-queue';

// Configuration
const AI_QUEUE_CONFIG = {
  // Max concurrent AI requests (OpenAI tier 1 = 60 RPM, tier 2+ = higher)
  concurrency: 3,
  
  // Max requests per interval (rate limiting)
  intervalCap: 50,
  interval: 60 * 1000, // 1 minute
  
  // Timeout per request (AI calls can take a while)
  timeout: 120 * 1000, // 2 minutes
  
  // Whether to throw on timeout
  throwOnTimeout: true,
};

// Create the queue
const aiQueue = new PQueue({
  concurrency: AI_QUEUE_CONFIG.concurrency,
  intervalCap: AI_QUEUE_CONFIG.intervalCap,
  interval: AI_QUEUE_CONFIG.interval,
  timeout: AI_QUEUE_CONFIG.timeout,
  throwOnTimeout: AI_QUEUE_CONFIG.throwOnTimeout,
});

// Track queue statistics
let stats = {
  totalRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  timedOutRequests: 0,
  currentlyRunning: 0,
  waitingInQueue: 0,
};

// Event listeners for monitoring
aiQueue.on('active', () => {
  stats.currentlyRunning = aiQueue.pending;
  stats.waitingInQueue = aiQueue.size;
});

aiQueue.on('completed', () => {
  stats.completedRequests++;
  stats.currentlyRunning = aiQueue.pending;
  stats.waitingInQueue = aiQueue.size;
});

aiQueue.on('error', () => {
  stats.failedRequests++;
});

aiQueue.on('idle', () => {
  stats.currentlyRunning = 0;
  stats.waitingInQueue = 0;
});

/**
 * Add an AI request to the queue
 * @param {Function} aiFunction - Async function that makes the AI call
 * @param {Object} options - Queue options
 * @returns {Promise} - Result of the AI function
 */
export async function queueAIRequest(aiFunction, options = {}) {
  stats.totalRequests++;
  
  const priority = options.priority || 0; // Higher = more priority
  const signal = options.signal; // AbortController signal
  
  try {
    const result = await aiQueue.add(aiFunction, {
      priority,
      signal,
    });
    return result;
  } catch (error) {
    if (error.name === 'TimeoutError') {
      stats.timedOutRequests++;
      console.error('[AIQueue] Request timed out');
    }
    throw error;
  }
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
  return {
    ...stats,
    pending: aiQueue.pending,
    size: aiQueue.size,
    isPaused: aiQueue.isPaused,
  };
}

/**
 * Pause the queue (for rate limit recovery)
 */
export function pauseQueue() {
  aiQueue.pause();
  console.log('[AIQueue] Queue paused');
}

/**
 * Resume the queue
 */
export function resumeQueue() {
  aiQueue.start();
  console.log('[AIQueue] Queue resumed');
}

/**
 * Clear pending requests (for shutdown)
 */
export function clearQueue() {
  aiQueue.clear();
  console.log('[AIQueue] Queue cleared');
}

/**
 * Wait for queue to be idle
 */
export async function waitForIdle() {
  await aiQueue.onIdle();
}

/**
 * Priority levels for different request types
 */
export const AI_PRIORITY = {
  CRITICAL: 10,      // User-facing real-time requests
  HIGH: 7,           // Character recognition
  NORMAL: 5,         // Generation requests
  LOW: 2,            // Background tasks
  BACKGROUND: 0,     // Non-urgent tasks
};

/**
 * Wrapper for common AI operations
 */
export const aiQueuedOps = {
  /**
   * Queue a character recognition request
   */
  async recognizeCharacters(recognizeFunction) {
    return queueAIRequest(recognizeFunction, { priority: AI_PRIORITY.HIGH });
  },

  /**
   * Queue a narrative generation request
   */
  async generateNarrative(generateFunction) {
    return queueAIRequest(generateFunction, { priority: AI_PRIORITY.NORMAL });
  },

  /**
   * Queue a tone rendering request
   */
  async renderTone(renderFunction) {
    return queueAIRequest(renderFunction, { priority: AI_PRIORITY.NORMAL });
  },

  /**
   * Queue a relationship analysis request
   */
  async analyzeRelationship(analyzeFunction) {
    return queueAIRequest(analyzeFunction, { priority: AI_PRIORITY.NORMAL });
  },
};

export { aiQueue };
