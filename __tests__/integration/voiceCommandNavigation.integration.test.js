/**
 * Integration: Voice command -> Navigation / Emergency / Set location
 * Be My Eyes - automated test suite
 */
const { processCommand } = require('../../utils/commandProcessor');

describe('Integration: Voice Command → Navigation', () => {
  it('Voice command "Navigate to Home" - navigation starts', () => {
    const navigate = jest.fn();
    processCommand('Navigate to Home', {}, {
      savedLocations: { home: { latitude: 1, longitude: 2 } },
      navigation: { navigate },
    });
    expect(navigate).toHaveBeenCalledWith('Navigation', {
      destination: { latitude: 1, longitude: 2 },
      autoStart: true,
    });
  });

  it('Voice command "Emergency Help" - SOS alert triggered', () => {
    const onEmergency = jest.fn();
    const result = processCommand('Emergency Help', { onEmergency }, {});
    expect(result.action).toBe('emergency');
    expect(onEmergency).toHaveBeenCalled();
  });

  it('Voice command "Set location to Home" - location saved (handler called)', () => {
    const onSetHome = jest.fn();
    const result = processCommand('Set location to Home', { onSetHome }, {});
    expect(result.type).toBe('setHome');
    expect(onSetHome).toHaveBeenCalled();
  });
});
