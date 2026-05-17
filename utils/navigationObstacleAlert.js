/**
 * Run object detection on a base64 JPEG (e.g. from Camera.takePictureAsync).
 * Returns a list of detected object labels above threshold.
 * Used when Arduino distance < 150cm during navigation to notify user.
 *
 * IMPORTANT: this entire pipeline is designed to be **non-blocking**. React
 * Native's JS thread also drives the UI, so any synchronous `dataSync()` or
 * long tight loop here freezes touches, animations, and timers. We:
 *   - await tf.nextFrame() between heavy stages so the renderer can breathe
 *   - use `await tensor.data()` instead of `tensor.dataSync()` for GPU readback
 *   - measure the warm-up pass to decide if the device is fast enough to label
 *     objects; very slow devices fall back to a generic "obstacle ahead" path.
 */
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import { preprocess } from './objectDetection/preprocess';
import { modelURI } from './objectDetection/modelHandler';
import labels from './objectDetection/labels.json';

let modelCache = null;
let inputTensorSize = null;
let tfReady = false;
let preloadPromise = null;
// Time (ms) the warm-up `executeAsync` pass took. Used to gate full labelled
// detection on low-end devices — see `isDeviceFastEnough()` below.
let warmupMs = null;
// If the warm-up takes longer than this, we treat the device as too slow to
// run a labelled detection during navigation and fall back to a generic alert.
const SLOW_DEVICE_THRESHOLD_MS = 2500;

async function ensureTfAndModel() {
  if (modelCache && inputTensorSize) return { model: modelCache, inputTensorSize };
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    if (!tfReady) {
      await tf.ready();
      try { await tf.setBackend('rn-webgl'); } catch (_) {}
      tfReady = true;
    }
    const yolov5 = await tf.loadGraphModel(modelURI);
    const shape = yolov5.inputs[0].shape.map((s) => s || 1);
    // Warm up with a dummy pass so the first real detection is fast on low-end devices.
    // Time the warm-up so we can later decide if the device is fast enough.
    try {
      const dummy = tf.ones(shape);
      const start = Date.now();
      const warmRes = await yolov5.executeAsync(dummy);
      // Force a GPU sync so the timing reflects the full inference cost.
      if (Array.isArray(warmRes)) {
        try { await warmRes[0].data(); } catch (_) {}
      } else if (warmRes) {
        try { await warmRes.data(); } catch (_) {}
      }
      warmupMs = Date.now() - start;
      tf.dispose(dummy);
      tf.dispose(warmRes);
    } catch (_) {
      warmupMs = null;
    }
    modelCache = yolov5;
    inputTensorSize = shape;
    return { model: yolov5, inputTensorSize: shape };
  })();
  return preloadPromise;
}

/**
 * Eagerly load and warm up the model. Safe to call multiple times; subsequent
 * calls return the cached model. Call this when entering a screen that may
 * trigger detection soon (e.g. NavigationScreen) so the first detection is fast.
 */
export async function preloadObstacleModel() {
  try {
    await ensureTfAndModel();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Returns true if the model warmed up fast enough that we can afford to run
 * a labelled detection without freezing the UI. Falls back to true (optimistic)
 * if the warm-up timing wasn't recorded — caller can still wrap the call in a
 * try/finally to release any in-progress flags.
 */
export function isDeviceFastEnough() {
  if (warmupMs == null) return true;
  return warmupMs < SLOW_DEVICE_THRESHOLD_MS;
}

/**
 * Latest warm-up timing in milliseconds, or null if no warm-up has run.
 * Exposed primarily for diagnostics.
 */
export function getWarmupMs() {
  return warmupMs;
}

// Two flavors of yield, both cheap and both essential:
//   - microYield()  resolves on the next macrotask (~0ms). Used between every
//                   logical step so timers / setStates can interleave even
//                   when nothing repaints.
//   - frameYield()  resolves on the next requestAnimationFrame (~16ms). Used
//                   between the visually heaviest stages so the renderer can
//                   actually paint a frame.
// Mixing them keeps both timer-driven work (navigation interval, emergency
// check) and visual work flowing while detection runs in the background.
const microYield = () => new Promise((resolve) => setTimeout(resolve, 0));
const frameYield = () => tf.nextFrame();

// Decode base64 → Uint8Array in 32KB chunks, yielding to the event loop
// between chunks so the JS thread isn't pinned for large payloads.
async function base64ToUint8ArrayAsync(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  const CHUNK = 32 * 1024;
  for (let i = 0; i < binary.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, binary.length);
    for (let j = i; j < end; j++) bytes[j] = binary.charCodeAt(j);
    if (end < binary.length) {
      // Alternate microYield and frameYield: microYield keeps timers/state
      // responsive; frameYield lets the renderer paint between chunks.
      if (((i / CHUNK) & 1) === 0) await microYield();
      else await frameYield();
    }
  }
  return bytes;
}

const DEFAULT_THRESHOLD = 0.25;

/**
 * @param {string} base64Jpeg - Base64-encoded JPEG from takePictureAsync
 * @param {{ threshold?: number }} options
 * @returns {Promise<string[]>} - Detected object labels (e.g. ['person', 'chair'])
 */
export async function detectFromBase64(base64Jpeg, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const { model, inputTensorSize } = await ensureTfAndModel();
  if (!inputTensorSize || inputTensorSize.length < 4) return [];

  tf.engine().startScope();
  // Track tensors so the finally block can dispose anything still allocated
  // if an error throws partway through.
  let imageTensor = null;
  let input = null;
  let res = null;
  try {
    // Stage 1: base64 → Uint8Array (chunked, yields between chunks)
    const imageBytes = await base64ToUint8ArrayAsync(base64Jpeg);
    await microYield();

    // Stage 2: decode JPEG → tensor on the GPU
    await frameYield();
    imageTensor = decodeJpeg(imageBytes, 3);
    await microYield();

    // Stage 3: preprocess (pad + resize + normalize + add batch dim)
    await frameYield();
    const [preInput] = preprocess(
      imageTensor,
      inputTensorSize[2],
      inputTensorSize[1]
    );
    input = preInput;
    tf.dispose(imageTensor);
    imageTensor = null;
    await microYield();

    // Stage 4: inference. executeAsync yields internally for async ops but
    // sync ops in the graph (NMS, reshapes) still run on the JS thread. The
    // frameYield before and after keeps the renderer alive on either side.
    await frameYield();
    res = await model.executeAsync(input);
    await microYield();
    const boxes = res[0];
    const scores = res[1];
    const classes = res[2];

    // Stage 5: ASYNC GPU → CPU readback. `data()` returns a promise so timers,
    // animations, and gestures continue running during the readback.
    const [scoresData, classesData] = await Promise.all([
      scores.data(),
      classes.data(),
    ]);

    tf.dispose([boxes, scores, classes, input]);
    input = null;
    res = null;
    await microYield();

    // Stage 6: collate labels (cheap, runs sync but on small arrays only)
    const seen = new Set();
    const result = [];
    for (let i = 0; i < scoresData.length; i++) {
      if (scoresData[i] > threshold) {
        const classIdx = Math.round(classesData[i]);
        const label = labels[classIdx] || `object ${classIdx}`;
        if (!seen.has(label)) {
          seen.add(label);
          result.push(label);
        }
      }
    }
    return result;
  } finally {
    // Defensive cleanup: if any stage threw, the locals above may still hold
    // tensors that the scope wouldn't track.
    try { if (imageTensor) tf.dispose(imageTensor); } catch (_) {}
    try { if (input) tf.dispose(input); } catch (_) {}
    try { if (res) tf.dispose(res); } catch (_) {}
    tf.engine().endScope();
  }
}
