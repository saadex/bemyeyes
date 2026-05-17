/**
 * Unit tests: Emergency alert (SOS, voice "Help", connection error)
 * Be My Eyes - automated test suite
 */
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(),
  collection: jest.fn(() => ({ _path: 'emergencyLogs' })),
  doc: jest.fn(() => ({ _path: 'users/uid' })),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => ({ _seconds: 123 })),
}));

jest.mock('../../config/firebase', () => ({ firestore: {} }));

const { addDoc, updateDoc } = require('firebase/firestore');
const { sendEmergencyAlert } = require('../../utils/emergencyAlert');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Unit: Emergency Alert', () => {
  const validLocation = { latitude: 40.7, longitude: -74.0 };
  const userProfile = {
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    emergencyContact: '+0987654321',
    emergencyName: 'Jane',
  };

  describe('1. Press SOS button (send alert with GPS)', () => {
    it('fetches GPS location and sends alert to emergency contact (Firestore log created)', async () => {
      addDoc.mockResolvedValue({ id: 'log1' });
      updateDoc.mockResolvedValue(undefined);

      const result = await sendEmergencyAlert({
        userId: 'user1',
        currentLocation: validLocation,
        userProfile,
        trigger: 'manual',
      });

      expect(addDoc).toHaveBeenCalled();
      const call = addDoc.mock.calls[0];
      expect(call[1]).toMatchObject({
        userId: 'user1',
        type: 'manual',
        location: validLocation,
        resolved: false,
        userInfo: {
          name: 'John Doe',
          phone: userProfile.phone,
          emergencyContact: userProfile.emergencyContact,
          emergencyName: userProfile.emergencyName,
        },
      });
      expect(result).toBeDefined();
      expect(result.location).toEqual(validLocation);
    });
  });

  describe('2. Voice command "Help" (same flow as SOS)', () => {
    it('sends emergency alert when trigger is voiceCommand', async () => {
      addDoc.mockResolvedValue({ id: 'log2' });
      updateDoc.mockResolvedValue(undefined);

      await sendEmergencyAlert({
        userId: 'user2',
        currentLocation: validLocation,
        userProfile: {},
        trigger: 'voiceCommand',
      });

      expect(addDoc).toHaveBeenCalled();
      expect(addDoc.mock.calls[0][1].type).toBe('voiceCommand');
    });
  });

  describe('3. Validation - no user / no location', () => {
    it('throws when userId is missing', async () => {
      await expect(
        sendEmergencyAlert({
          userId: null,
          currentLocation: validLocation,
          userProfile: {},
        }),
      ).rejects.toThrow('No signed-in user');
    });

    it('throws when location is unavailable', async () => {
      await expect(
        sendEmergencyAlert({
          userId: 'user1',
          currentLocation: null,
          userProfile: {},
        }),
      ).rejects.toThrow('Location is unavailable');
    });

    it('throws when location has invalid coordinates', async () => {
      await expect(
        sendEmergencyAlert({
          userId: 'user1',
          currentLocation: { latitude: NaN, longitude: -74 },
          userProfile: {},
        }),
      ).rejects.toThrow('Location is unavailable');
    });
  });
});
