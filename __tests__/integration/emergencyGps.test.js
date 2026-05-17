/**
 * Integration: Emergency alert + GPS (internet ON -> send with location; OFF -> message)
 * Be My Eyes - automated test suite
 */
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn().mockResolvedValue({ id: 'log1' }),
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  updateDoc: jest.fn().mockResolvedValue(undefined),
  serverTimestamp: jest.fn(() => ({ _seconds: 123 })),
}));

jest.mock('../../config/firebase', () => ({ firestore: {} }));

const { addDoc } = require('firebase/firestore');
const { sendEmergencyAlert } = require('../../utils/emergencyAlert');

describe('Integration: Emergency Alert + GPS', () => {
  it('Press SOS button with internet ON - send alert with GPS location', async () => {
    await sendEmergencyAlert({
      userId: 'u1',
      currentLocation: { latitude: 40.7, longitude: -74.0 },
      userProfile: {},
      trigger: 'manual',
    });
    expect(addDoc).toHaveBeenCalled();
    const payload = addDoc.mock.calls[0][1];
    expect(payload.location).toEqual({ latitude: 40.7, longitude: -74.0 });
  });

  it('Internet OFF - caller displays "Connection Error" or "Enable Location Service"', async () => {
    // When Firestore fails (e.g. no network), sendEmergencyAlert throws; UI shows connection error.
    const { addDoc: addDocOrig } = require('firebase/firestore');
    addDocOrig.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(
      sendEmergencyAlert({
        userId: 'u1',
        currentLocation: { latitude: 40.7, longitude: -74.0 },
        userProfile: {},
      })
    ).rejects.toThrow('Network request failed');
  });
});
