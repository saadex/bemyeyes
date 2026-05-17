import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';

const isValidLocation = (loc) => {
  return (
    loc &&
    typeof loc.latitude === 'number' &&
    typeof loc.longitude === 'number' &&
    !Number.isNaN(loc.latitude) &&
    !Number.isNaN(loc.longitude)
  );
};

/**
 * Creates an emergency log in Firestore and updates user's lastEmergencyAlert timestamp.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {{latitude:number,longitude:number}} params.currentLocation
 * @param {Object|null} params.userProfile
 * @param {'manual'|'voiceCommand'|'chatbotVoice'|'unknown'} [params.trigger]
 */
export async function sendEmergencyAlert({
  userId,
  currentLocation,
  userProfile,
  trigger = 'unknown',
}) {
  if (!userId) {
    throw new Error('No signed-in user.');
  }
  if (!isValidLocation(currentLocation)) {
    throw new Error('Location is unavailable.');
  }

  const emergencyData = {
    userId,
    type: trigger,
    location: {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    },
    timestamp: serverTimestamp(),
    resolved: false,
    guardianNotified: false,
    userInfo: {
      name: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim(),
      phone: userProfile?.phone || '',
      emergencyContact: userProfile?.emergencyContact || '',
      emergencyName: userProfile?.emergencyName || '',
      medicalInfo: userProfile?.medicalInfo || '',
    },
  };

  await addDoc(collection(firestore, 'emergencyLogs'), emergencyData);

  // Best-effort update of user metadata (doesn't affect log creation).
  try {
    await updateDoc(doc(firestore, 'users', userId), {
      lastEmergencyAlert: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    // Intentionally ignore: emergency log was already created.
  }

  return emergencyData;
}

