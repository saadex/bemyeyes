/**
 * Functional tests: Voice command -> navigation, set location, emergency
 * Be My Eyes - automated test suite
 */
const {
  detectCommand,
  processCommand,
} = require('../../utils/commandProcessor');

describe('Functional: Voice Command System', () => {
  describe('"Navigate to home"', () => {
    it('starts navigation when home is saved', () => {
      const navigate = jest.fn();
      const result = processCommand('Navigate to home', {}, {
        savedLocations: { home: { latitude: 1, longitude: 2 } },
        navigation: { navigate },
      });
      expect(result.action).toBe('navigate');
      expect(result.type).toBe('navigateHome');
      expect(navigate).toHaveBeenCalledWith('Navigation', {
        destination: { latitude: 1, longitude: 2 },
        autoStart: true,
      });
    });
  });

  describe('"Set location to office"', () => {
    it('updates location (calls onSetOffice)', () => {
      const onSetOffice = jest.fn();
      const result = processCommand('Set location to office', { onSetOffice }, {});
      expect(result.type).toBe('setOffice');
      expect(result.message).toBe('Saving office location.');
      expect(onSetOffice).toHaveBeenCalled();
    });
  });

  describe('"Emergency"', () => {
    it('sends SOS alert (calls onEmergency)', () => {
      const onEmergency = jest.fn();
      const result = processCommand('Emergency', { onEmergency }, {});
      expect(result.type).toBe('emergency');
      expect(result.action).toBe('emergency');
      expect(onEmergency).toHaveBeenCalled();
    });

    it('"Emergency Help" detected as emergency', () => {
      expect(detectCommand('Emergency Help')).toBe('emergency');
    });
  });
});
