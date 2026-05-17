import * as tf from '@tensorflow/tfjs';

/**
 * Preprocess image/frame before feeding into YOLOv5 model.
 * @param {tf.Tensor} img - Input image tensor
 * @param {number} modelWidth - Model input width
 * @param {number} modelHeight - Model input height
 * @returns {[tf.Tensor, number, number]} [input tensor, xRatio, yRatio]
 */
export const preprocess = (img, modelWidth, modelHeight) => {
  let xRatio, yRatio;

  const input = tf.tidy(() => {
    const [h, w] = img.shape.slice(0, 2);
    const maxSize = Math.max(w, h);
    const imgPadded = img.pad([
      [0, maxSize - h],
      [0, maxSize - w],
      [0, 0],
    ]);
    xRatio = maxSize / w;
    yRatio = maxSize / h;
    return tf.image
      .resizeBilinear(imgPadded, [modelWidth, modelHeight])
      .div(255.0)
      .expandDims(0);
  });
  return [input, xRatio, yRatio];
};
