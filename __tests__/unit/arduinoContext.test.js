/**
 * Unit tests: Arduino distance parsing (obstacle / distance input)
 * Be My Eyes - automated test suite
 */
const { parseDistanceFromLine } = require('../../contexts/ArduinoContext');

describe('Unit: Arduino distance parsing', () => {
  it('parses "Distance: 15"', () => {
    expect(parseDistanceFromLine('Distance: 15')).toBe(15);
  });

  it('parses "15"', () => {
    expect(parseDistanceFromLine('15')).toBe(15);
  });

  it('parses "15.2" and "distance=12.5"', () => {
    expect(parseDistanceFromLine('15.2')).toBe(15.2);
    expect(parseDistanceFromLine('distance=12.5')).toBe(12.5);
  });

  it('parses "15cm"', () => {
    expect(parseDistanceFromLine('15cm')).toBe(15);
  });

  it('returns null for non-numeric or empty', () => {
    expect(parseDistanceFromLine('')).toBeNull();
    expect(parseDistanceFromLine(null)).toBeNull();
    expect(parseDistanceFromLine('no number')).toBeNull();
  });
});
