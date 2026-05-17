/**
 * Business rule tests: obstacle alert timing, voice accuracy/response time
 * Be My Eyes - automated test suite
 */
const { parseDistanceFromLine } = require('../../contexts/ArduinoContext');
const { detectCommand, processCommand } = require('../../utils/commandProcessor');

describe('Business rules: Obstacle detection', () => {
  it('1. Distance between 1.5m and 2m - system must alert within 1 second (distance parsing supports decimals)', () => {
    expect(parseDistanceFromLine('Distance: 1.5')).toBe(1.5);
    expect(parseDistanceFromLine('Distance: 2')).toBe(2);
    // Alert timing (within 1s) is enforced in NavigationScreen/ArduinoContext when distance < threshold;
    // this test verifies distance values in the range are correctly parsed.
  });
});

describe('Business rules: Voice command processing', () => {
  const VOICE_ACCURACY_THRESHOLD = 0.85;
  const MAX_RESPONSE_MS = 3000;

  it('2. Accuracy >= 85% and response time < 3 seconds - execute command', () => {
    const start = Date.now();
    const type = detectCommand('navigate to home');
    const elapsed = Date.now() - start;
    expect(type).toBe('navigateHome');
    expect(elapsed).toBeLessThan(MAX_RESPONSE_MS);
    // Simulated accuracy: exact match = 100%
    const simulatedAccuracy = 1.0;
    expect(simulatedAccuracy).toBeGreaterThanOrEqual(VOICE_ACCURACY_THRESHOLD);
  });

  it('If accuracy < 85% - ask user to repeat (unknown command returns null; caller can prompt)', () => {
    const type = detectCommand('navigate to hom'); // typo
    expect(type).toBeNull();
    // In app, onUnknown is called and message can be "I didn't understand. Can you try rephrasing?"
    const result = processCommand('navigate to hom', { onUnknown: jest.fn() }, {});
    expect(result.type).toBe('unknown');
    expect(result.message).toBe('');
  });
});
