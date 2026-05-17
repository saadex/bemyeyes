/**
 * Centralized speech manager with a strict priority hierarchy:
 *
 *   PRIORITY_EMERGENCY (3)       — emergency alerts, emergency check Q&A
 *   PRIORITY_OBJECT_DETECTION (2) — obstacle / object detection announcements
 *   PRIORITY_DEFAULT (1)          — navigation guidance, chatbot replies, status
 *
 * Rules:
 *   - A higher-priority utterance always interrupts an in-flight utterance.
 *   - An equal-priority utterance also interrupts (most recent wins so the user
 *     hears the latest information).
 *   - A lower-priority utterance is dropped while a higher-priority one is
 *     still speaking — it must NEVER cut off an emergency or an object label.
 *   - stop() always succeeds regardless of priority (manual override).
 *
 * This module is plain JS (no React hooks) so it can be used from contexts,
 * utility functions, and screens uniformly.
 */

let Speech = null;
try {
  Speech = require('expo-speech');
  if (!Speech || typeof Speech.speak !== 'function') Speech = null;
} catch (_) {
  Speech = null;
}

export const PRIORITY_DEFAULT = 1;
export const PRIORITY_OBJECT_DETECTION = 2;
export const PRIORITY_EMERGENCY = 3;

let activePriority = 0;     // 0 = nothing speaking
let activeId = 0;           // monotonic id for the currently speaking utterance
let nextId = 1;

function isSpeechAvailable() {
  return !!(Speech && typeof Speech.speak === 'function');
}

/**
 * Try to speak `text` with the given priority.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.priority=PRIORITY_DEFAULT]
 * @param {string} [options.language='en']
 * @param {number} [options.rate=0.9]
 * @param {number} [options.pitch=1.0]
 * @param {function} [options.onDone]
 * @param {function} [options.onError]
 * @returns {boolean} true if the utterance was queued, false if dropped.
 */
export function speak(text, options = {}) {
  if (!isSpeechAvailable()) return false;
  if (!text || typeof text !== 'string') return false;
  const cleaned = text.trim();
  if (!cleaned) return false;

  const priority = options.priority ?? PRIORITY_DEFAULT;

  // If something higher priority is currently speaking, drop this utterance.
  if (activePriority > priority) {
    return false;
  }

  // Equal or higher priority: stop whatever is in flight, then speak.
  try { Speech.stop(); } catch (_) {}

  const myId = nextId++;
  activeId = myId;
  activePriority = priority;

  const finish = () => {
    // Only clear if we are still the active utterance — protects against a
    // higher-priority utterance that already preempted us.
    if (activeId === myId) {
      activePriority = 0;
    }
  };

  try {
    Speech.speak(cleaned, {
      language: options.language || 'en',
      rate: options.rate ?? 0.9,
      pitch: options.pitch ?? 1.0,
      onDone: () => {
        finish();
        if (typeof options.onDone === 'function') {
          try { options.onDone(); } catch (_) {}
        }
      },
      onStopped: () => {
        finish();
      },
      onError: (err) => {
        finish();
        if (typeof options.onError === 'function') {
          try { options.onError(err); } catch (_) {}
        }
      },
    });
  } catch (_) {
    finish();
    return false;
  }
  return true;
}

/**
 * Hard stop. Always succeeds regardless of priority.
 */
export function stop() {
  activePriority = 0;
  if (!isSpeechAvailable()) return;
  try { Speech.stop(); } catch (_) {}
}

/**
 * Returns the priority of the currently speaking utterance, or 0 if idle.
 */
export function getCurrentPriority() {
  return activePriority;
}

export default { speak, stop, getCurrentPriority, PRIORITY_DEFAULT, PRIORITY_OBJECT_DETECTION, PRIORITY_EMERGENCY };
