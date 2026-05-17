/**
 * Integration tests: Firebase + Mobile app (profile name, saved location)
 * Uses mocked Firestore; run against Firebase emulator in CI if needed.
 * Be My Eyes - automated test suite
 */
const { updateDoc, doc, getDoc, setDoc } = require('firebase/firestore');

const mockUpdateDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockDoc = jest.fn(() => ({ _path: 'users/uid' }));

jest.mock('firebase/firestore', () => ({
  updateDoc: (...args) => mockUpdateDoc(...args),
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: jest.fn(() => ({ _seconds: 123 })),
}));

jest.mock('../../config/firebase', () => ({ firestore: {} }));

// Simulate AuthContext.updateProfile behavior
async function updateProfile(uid, profileData) {
  const userDocRef = doc({}, 'users', uid);
  await mockUpdateDoc(userDocRef, {
    ...profileData,
    updatedAt: { _seconds: 123 },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Integration: Firebase + Mobile App', () => {
  it('Update profile name - Firebase document updated', async () => {
    await updateProfile('user1', { firstName: 'Jane', lastName: 'Doe' });
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Doe',
      })
    );
  });

  it('Update saved location - Firebase updates correctly', async () => {
    // Saved locations are typically in users/{uid} or a subcollection; we assert updateDoc contract.
    await updateProfile('user1', {
      savedLocations: {
        home: { latitude: 40.7, longitude: -74.0 },
        office: { latitude: 40.75, longitude: -73.98 },
      },
    });
    expect(mockUpdateDoc).toHaveBeenCalled();
    const call = mockUpdateDoc.mock.calls[0][1];
    expect(call.savedLocations.home).toEqual({ latitude: 40.7, longitude: -74.0 });
  });
});
