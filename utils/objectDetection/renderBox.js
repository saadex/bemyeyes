import labels from './labels.json';
import { Colors } from './colors';

/**
 * Render YOLOv5 prediction boxes on 2D context.
 * @param {object} ctx - Expo2DContext
 * @param {number} threshold - Confidence threshold
 * @param {Float32Array|number[]} boxes_data - Boxes [x1,y1,x2,y2] per detection
 * @param {Float32Array|number[]} scores_data - Scores
 * @param {Float32Array|number[]} classes_data - Class indices
 * @param {[number,number]} ratios - [xRatio, yRatio] for scaling
 * @param {boolean} flipX - Flip horizontally (e.g. for front camera)
 */
export const renderBoxes = async (ctx, threshold, boxes_data, scores_data, classes_data, ratios, flipX = true) => {
  if (!ctx || typeof ctx.clearRect !== 'function') return;
  ctx.clearRect(0, 0, ctx.width, ctx.height);

  const font = `${Math.max(Math.round(Math.max(ctx.width, ctx.height) / 40), 14)}pt sans-serif`;
  ctx.font = font;
  ctx.textBaseline = 'top';
  const colors = new Colors();

  for (let i = 0; i < scores_data.length; ++i) {
    if (scores_data[i] > threshold) {
      const classIdx = Math.round(classes_data[i]);
      const klass = labels[classIdx] || `class ${classIdx}`;
      const color = colors.get(classIdx);
      const score = (scores_data[i] * 100).toFixed(1);

      let [x1, y1, x2, y2] = boxes_data.slice(i * 4, (i + 1) * 4);
      x1 *= ctx.width * ratios[0];
      x2 *= ctx.width * ratios[0];
      y1 *= ctx.height * ratios[1];
      y2 *= ctx.height * ratios[1];
      const width = x2 - x1;
      const height = y2 - y1;

      let x = flipX ? ctx.width - x1 - width : x1;

      ctx.fillStyle = Colors.hexToRgba(color, 0.2);
      ctx.fillRect(x, y1, width, height);

      ctx.fillStyle = color;
      const labelText = `${klass} - ${score}%`;
      const textWidth = ctx.measureText(labelText).width;
      const textHeight = parseInt(font, 10);
      const yText = y1 - (textHeight + 2);
      ctx.fillRect(x - 1, yText < 0 ? 0 : yText, textWidth + 2, textHeight + 2);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x - 1, yText < 0 ? 0 : yText);
    }
  }
  if (typeof ctx.flush === 'function') ctx.flush();
};
