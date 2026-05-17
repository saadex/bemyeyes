/**
 * Run object detection on a base64 JPEG (e.g. from Camera.takePictureAsync).
 * Returns a list of detected object labels above threshold.
 * Used when Arduino distance < 150cm during navigation to notify user.
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
    // Warm up with a dummy pass so the first real detection is fast on low-end devices
    try {
      const dummy = tf.ones(shape);
      const warmRes = await yolov5.executeAsync(dummy);
      tf.dispose(dummy);
      tf.dispose(warmRes);
    } catch (_) {}
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

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
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
  try {
    const imageBytes = base64ToUint8Array(base64Jpeg);
    const imageTensor = decodeJpeg(imageBytes, 3);
    const [input, ,] = preprocess(
      imageTensor,
      inputTensorSize[2],
      inputTensorSize[1]
    );
    tf.dispose(imageTensor);

    const res = await model.executeAsync(input);
    const boxes = res[0];
    const scores = res[1];
    const classes = res[2];
    const scoresData = scores.dataSync();
    const classesData = classes.dataSync();
    tf.dispose([boxes, scores, classes, input]);

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
    tf.engine().endScope();
  }
}
