/**
 * Accelerometer-based stillness detector.
 *
 * Subscribes to expo-sensors Accelerometer at 20 Hz and computes the rolling
 * standard deviation of |a| − 1.0 (in g units). When that std-dev stays below
 * `threshold` for `stillnessMs` milliseconds, fires `onStationary` once. When
 * motion resumes, fires `onMoving` once and the watcher re-arms.
 *
 * Cost in practice:
 *   - The accelerometer chip is always on for OS purposes (screen rotation),
 *     so subscribing does NOT wake new hardware. We only pay the bridge
 *     delivery cost (~2 ms / second of JS thread time) + ~20 floating point
 *     ops per sample.
 *   - To stay cheap on low-end devices, we only recompute the stillness
 *     decision once per second instead of every sample.
 *
 * If expo-sensors isn't installed (e.g. the user hasn't rebuilt yet), this
 * module no-ops safely — the rest of the app keeps working.
 */

// Defensive import: keep working if expo-sensors isn't installed yet.
let Accelerometer = null;
try {
  // eslint-disable-next-line global-require
  Accelerometer = require('expo-sensors').Accelerometer;
  if (!Accelerometer || typeof Accelerometer.addListener !== 'function') {
    Accelerometer = null;
  }
} catch (_) {
  Accelerometer = null;
}

const DEFAULT_OPTIONS = {
  stillnessMs: 10_000,         // how long to be still before firing
  threshold: 0.015,            // std-dev (in g) below this == still
  sampleIntervalMs: 50,        // 20 Hz
  decisionIntervalMs: 1000,    // recompute the stillness decision every 1s
  bufferSeconds: 1,            // rolling window for std-dev (in seconds)
};

/**
 * Returns true if expo-sensors is available in this build.
 */
export function isMotionSensorAvailable() {
  return Accelerometer != null;
}

/**
 * Start watching for stationarity. Returns an unsubscribe function.
 *
 * @param {object} options
 * @param {number} [options.stillnessMs=10000]    ms of continuous stillness before onStationary fires
 * @param {number} [options.threshold=0.015]      std-dev threshold (in g) considered "still"
 * @param {() => void} [options.onStationary]     fired once each time stillness threshold is crossed
 * @param {() => void} [options.onMoving]         fired once each time the user starts moving again
 * @returns {{ stop: () => void }}
 */
export function createMotionWatcher(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const noop = { stop: () => {} };

  if (!Accelerometer) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[motionDetector] expo-sensors not available — stillness detection disabled. Install with: npx expo install expo-sensors');
    }
    return noop;
  }

  // Ring buffer of recent |a|−1.0 samples (in g).
  const bufferSize = Math.max(2, Math.ceil((opts.bufferSeconds * 1000) / opts.sampleIntervalMs));
  const buffer = new Float32Array(bufferSize);
  let bufferCount = 0;
  let writeIndex = 0;

  // Stillness state machine
  let stationarySince = null;  // ms timestamp when the current still-streak began, or null
  let firedStationary = false; // true between onStationary firing and the next onMoving
  let stopped = false;

  let listener = null;
  let decisionTimer = null;

  try {
    Accelerometer.setUpdateInterval(opts.sampleIntervalMs);
  } catch (_) {}

  listener = Accelerometer.addListener(({ x, y, z }) => {
    // |a| in g — when stationary, |a| ≈ 1.0 regardless of orientation.
    const magMinusG = Math.sqrt(x * x + y * y + z * z) - 1.0;
    buffer[writeIndex] = magMinusG;
    writeIndex = (writeIndex + 1) % bufferSize;
    if (bufferCount < bufferSize) bufferCount++;
  });

  // Recompute the stillness decision once per second. Cheap and predictable.
  const decide = () => {
    if (stopped) return;
    if (bufferCount < bufferSize) return; // need a full window first

    // Welford-style mean/variance over the buffer
    let mean = 0;
    for (let i = 0; i < bufferCount; i++) mean += buffer[i];
    mean /= bufferCount;

    let variance = 0;
    for (let i = 0; i < bufferCount; i++) {
      const d = buffer[i] - mean;
      variance += d * d;
    }
    variance /= bufferCount;
    const stdDev = Math.sqrt(variance);

    const now = Date.now();
    const isStill = stdDev < opts.threshold;

    if (isStill) {
      if (stationarySince == null) {
        stationarySince = now;
      }
      if (!firedStationary && now - stationarySince >= opts.stillnessMs) {
        firedStationary = true;
        if (typeof opts.onStationary === 'function') {
          try { opts.onStationary(); } catch (_) {}
        }
      }
    } else {
      if (stationarySince != null || firedStationary) {
        stationarySince = null;
        if (firedStationary) {
          firedStationary = false;
          if (typeof opts.onMoving === 'function') {
            try { opts.onMoving(); } catch (_) {}
          }
        }
      }
    }
  };

  decisionTimer = setInterval(decide, opts.decisionIntervalMs);

  return {
    stop: () => {
      stopped = true;
      if (decisionTimer) {
        clearInterval(decisionTimer);
        decisionTimer = null;
      }
      if (listener && typeof listener.remove === 'function') {
        try { listener.remove(); } catch (_) {}
      }
      listener = null;
    },
  };
}
