/**
 * Global media processing queue (semaphore).
 *
 * On a single-core server, running multiple FFmpeg/Sharp jobs in parallel
 * will saturate the CPU and stall the Node.js event loop. This queue
 * ensures that at most `maxConcurrent` heavy jobs run at the same time
 * across ALL commands (stiker, gambar).
 *
 * When the queue is full, incoming requests are queued and processed in
 * FIFO order, so no user is silently rejected.
 */

const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_QUEUE_LIMIT = 5;

let activeJobs = 0;
let maxConcurrent = DEFAULT_MAX_CONCURRENT;
let queueLimit = DEFAULT_QUEUE_LIMIT;
const waitingQueue = [];

/**
 * Configure the queue. Call once at startup from settings.
 */
function configureMediaQueue(options = {}) {
  if (options.maxConcurrent !== undefined) {
    maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent));
  }

  if (options.queueLimit !== undefined) {
    queueLimit = Math.max(1, Math.floor(options.queueLimit));
  }

  console.log(
    `[MEDIA QUEUE] Max concurrent: ${maxConcurrent}, queue limit: ${queueLimit}`
  );
}

/**
 * Returns how many jobs are currently running and waiting.
 */
function getMediaQueueStatus() {
  return {
    active: activeJobs,
    waiting: waitingQueue.length,
    maxConcurrent,
    queueLimit
  };
}

/**
 * Run a heavy media job through the queue.
 *
 * @param {Function} jobFn  - Async function that does the actual work.
 * @returns {Promise<*>}    - Resolves with the return value of jobFn.
 * @throws If the queue is full (over queueLimit), throws immediately so the
 *         caller can reply with a "please wait" message.
 */
async function runMediaJob(jobFn) {
  if (activeJobs >= maxConcurrent) {
    if (waitingQueue.length >= queueLimit) {
      const error = new Error("MEDIA_QUEUE_FULL");
      error.code = "MEDIA_QUEUE_FULL";
      throw error;
    }

    await new Promise((resolve, reject) => {
      waitingQueue.push({ resolve, reject });
    });
  }

  activeJobs += 1;

  try {
    return await jobFn();
  } finally {
    activeJobs -= 1;

    if (waitingQueue.length > 0) {
      const next = waitingQueue.shift();
      next.resolve();
    }
  }
}

// ── Cooldown per pengirim ────────────────────────────────────────────────────
// Mencegah satu user memenuhi antrean global sendirian.
const userLastJobAt = new Map();
const USER_COOLDOWN_SWEEP_LIMIT = 500;

/**
 * Cek & tandai cooldown media untuk seorang pengirim.
 * @returns {number} 0 kalau boleh lanjut, atau sisa detik tunggu.
 */
function takeUserMediaSlot(userId, cooldownMs) {
  if (!userId || !cooldownMs) return 0;

  const now = Date.now();
  const last = userLastJobAt.get(userId) || 0;
  const remainingMs = cooldownMs - (now - last);

  if (remainingMs > 0) {
    return Math.ceil(remainingMs / 1000);
  }

  if (userLastJobAt.size >= USER_COOLDOWN_SWEEP_LIMIT) {
    for (const [key, timestamp] of userLastJobAt) {
      if (now - timestamp > cooldownMs) userLastJobAt.delete(key);
    }
  }

  userLastJobAt.set(userId, now);
  return 0;
}

/**
 * Reject all waiting jobs (e.g., on graceful shutdown).
 */
function drainMediaQueue() {
  while (waitingQueue.length > 0) {
    const waiter = waitingQueue.shift();
    const error = new Error("MEDIA_QUEUE_DRAINED");
    error.code = "MEDIA_QUEUE_DRAINED";
    waiter.reject(error);
  }
}

module.exports = {
  configureMediaQueue,
  getMediaQueueStatus,
  runMediaJob,
  drainMediaQueue,
  takeUserMediaSlot
};
