/**
 * Job Manager - Tracks async generation jobs with progress
 */

// In-memory job storage (for production, use Redis)
const jobs = new Map();

// Job statuses
export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// Generation steps for progress tracking
export const GENERATION_STEPS = [
  { id: 1, name: 'recognition', label: 'Recognizing characters...' },
  { id: 2, name: 'discovery', label: 'Discovering character profiles...' },
  { id: 3, name: 'synthesis', label: 'Synthesizing psychological model...' },
  { id: 4, name: 'narrative', label: 'Generating your narrative...' },
  { id: 5, name: 'examples', label: 'Finding character examples...' },
  { id: 6, name: 'constellation', label: 'Computing archetype constellation...' },
];

/**
 * Create a new job
 */
export function createJob(userId) {
  const jobId = `job_${userId}_${Date.now()}`;
  const job = {
    id: jobId,
    userId,
    status: JOB_STATUS.PENDING,
    currentStep: 0,
    totalSteps: GENERATION_STEPS.length,
    stepLabel: 'Starting...',
    progress: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: null,
    error: null,
  };
  jobs.set(jobId, job);
  console.log(`[JobManager] Created job ${jobId} for user ${userId}`);
  return job;
}

/**
 * Update job progress
 */
export function updateJobProgress(jobId, stepNumber, customLabel = null) {
  const job = jobs.get(jobId);
  if (!job) return null;
  
  const step = GENERATION_STEPS.find(s => s.id === stepNumber) || GENERATION_STEPS[0];
  job.status = JOB_STATUS.RUNNING;
  job.currentStep = stepNumber;
  job.stepLabel = customLabel || step.label;
  job.progress = Math.round((stepNumber / job.totalSteps) * 100);
  job.updatedAt = new Date().toISOString();
  
  console.log(`[JobManager] Job ${jobId}: Step ${stepNumber}/${job.totalSteps} - ${job.stepLabel}`);
  return job;
}

/**
 * Mark job as completed with result
 */
export function completeJob(jobId, result) {
  const job = jobs.get(jobId);
  if (!job) return null;
  
  job.status = JOB_STATUS.COMPLETED;
  job.currentStep = job.totalSteps;
  job.stepLabel = 'Complete!';
  job.progress = 100;
  job.result = result;
  job.updatedAt = new Date().toISOString();
  job.completedAt = new Date().toISOString();
  
  console.log(`[JobManager] Job ${jobId} completed`);
  return job;
}

/**
 * Mark job as failed
 */
export function failJob(jobId, error) {
  const job = jobs.get(jobId);
  if (!job) return null;
  
  job.status = JOB_STATUS.FAILED;
  job.error = error.message || String(error);
  job.updatedAt = new Date().toISOString();
  
  console.log(`[JobManager] Job ${jobId} failed: ${job.error}`);
  return job;
}

/**
 * Get job by ID
 */
export function getJob(jobId) {
  return jobs.get(jobId);
}

/**
 * Get latest job for user
 */
export function getLatestJobForUser(userId) {
  let latestJob = null;
  let latestTime = 0;
  
  for (const job of jobs.values()) {
    if (job.userId === userId) {
      const jobTime = new Date(job.createdAt).getTime();
      if (jobTime > latestTime) {
        latestTime = jobTime;
        latestJob = job;
      }
    }
  }
  
  return latestJob;
}

/**
 * Clean up old jobs (call periodically)
 */
export function cleanupOldJobs(maxAgeMs = 30 * 60 * 1000) { // 30 minutes
  const now = Date.now();
  let cleaned = 0;
  
  for (const [jobId, job] of jobs.entries()) {
    const jobAge = now - new Date(job.createdAt).getTime();
    if (jobAge > maxAgeMs && job.status !== JOB_STATUS.RUNNING) {
      jobs.delete(jobId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[JobManager] Cleaned up ${cleaned} old jobs`);
  }
}

// Clean up old jobs every 10 minutes
setInterval(() => cleanupOldJobs(), 10 * 60 * 1000);
