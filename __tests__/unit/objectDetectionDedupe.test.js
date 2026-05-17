/**
 * Unit tests: Object detection - repeated object not announced repeatedly (dedupe labels)
 * Logic under test: same label appears only once in result (mirrors navigationObstacleAlert.js).
 * Be My Eyes - automated test suite
 */

// Pure function that mirrors the dedupe logic in detectFromBase64 (scores, class indices -> labels)
function dedupeLabelsByClass(scoresData, classesData, labelsArray, threshold = 0.25) {
  const seen = new Set();
  const result = [];
  for (let i = 0; i < scoresData.length; i++) {
    if (scoresData[i] > threshold) {
      const classIdx = Math.round(classesData[i]);
      const label = labelsArray[classIdx] || `object ${classIdx}`;
      if (!seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }
  }
  return result;
}

const COCO_LABELS = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog',
];

describe('Unit: Object Detection (dedupe)', () => {
  it('1. Detect person - label "person" returned', () => {
    const scoresData = [0.9];
    const classesData = [0]; // COCO class 0 = person
    const result = dedupeLabelsByClass(scoresData, classesData, COCO_LABELS);
    expect(result).toContain('person');
    expect(result).toEqual(['person']);
  });

  it('2. Unknown object (low score) - object ignored', () => {
    const scoresData = [0.1];
    const classesData = [0];
    const result = dedupeLabelsByClass(scoresData, classesData, COCO_LABELS, 0.25);
    expect(result).toEqual([]);
  });

  it('3. Repeated object - do not announce repeatedly', () => {
    const scoresData = [0.9, 0.85, 0.88];
    const classesData = [0, 0, 0]; // person, person, person
    const result = dedupeLabelsByClass(scoresData, classesData, COCO_LABELS);
    expect(result).toEqual(['person']);
  });
});
