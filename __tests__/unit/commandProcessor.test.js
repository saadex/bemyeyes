/**
 * Unit tests: Voice command detection and processing
 * Be My Eyes - automated test suite
 */
const {
  detectCommand,
  processCommand,
  isMatch,
  commandPatterns,
} = require('../../utils/commandProcessor');

describe('Unit: Voice Command Processor', () => {
  describe('detectCommand', () => {
    it('"navigate to home" -> navigateHome', () => {
      expect(detectCommand('navigate to home')).toBe('navigateHome');
      expect(detectCommand('Navigate to Home')).toBe('navigateHome');
    });

    it('"set location to office" -> setOffice', () => {
      expect(detectCommand('set location to office')).toBe('setOffice');
    });

    it('"emergency" / "emergency help" -> emergency', () => {
      expect(detectCommand('emergency')).toBe('emergency');
      expect(detectCommand('emergency help')).toBe('emergency');
      expect(detectCommand('Emergency Help')).toBe('emergency');
    });

    it('unknown phrase returns null', () => {
      expect(detectCommand('what time is it')).toBeNull();
      expect(detectCommand('')).toBeNull();
    });
  });

  describe('processCommand - navigation', () => {
    it('"Navigate to home" with saved home starts navigation', () => {
      const nav = { navigate: jest.fn() };
      const result = processCommand('Navigate to Home', {}, {
        savedLocations: { home: { latitude: 1, longitude: 2 } },
        navigation: nav,
      });
      expect(result.type).toBe('navigateHome');
      expect(result.message).toContain('Starting navigation to home');
      expect(result.action).toBe('navigate');
      expect(nav.navigate).toHaveBeenCalledWith('Navigation', {
        destination: { latitude: 1, longitude: 2 },
        autoStart: true,
      });
    });

    it('"Navigate to home" without saved home returns error', () => {
      const result = processCommand('navigate to home', {}, {
        savedLocations: {},
        navigation: { navigate: jest.fn() },
      });
      expect(result.type).toBe('error');
      expect(result.message).toContain('Home location not set');
    });
  });

  describe('processCommand - set location', () => {
    it('"Set location to Home" calls onSetHome and returns setHome message', () => {
      const onSetHome = jest.fn();
      const result = processCommand('Set location to Home', { onSetHome }, {});
      expect(result.type).toBe('setHome');
      expect(result.message).toBe('Saving home location.');
      expect(onSetHome).toHaveBeenCalled();
    });

    it('"Set location to office" calls onSetOffice', () => {
      const onSetOffice = jest.fn();
      const result = processCommand('set location to office', { onSetOffice }, {});
      expect(result.type).toBe('setOffice');
      expect(result.message).toBe('Saving office location.');
      expect(onSetOffice).toHaveBeenCalled();
    });
  });

  describe('processCommand - emergency', () => {
    it('"Emergency" triggers onEmergency and returns emergency message', () => {
      const onEmergency = jest.fn();
      const result = processCommand('Emergency', { onEmergency }, {});
      expect(result.type).toBe('emergency');
      expect(result.message).toContain('Emergency alert');
      expect(result.action).toBe('emergency');
      expect(onEmergency).toHaveBeenCalled();
    });
  });
});
