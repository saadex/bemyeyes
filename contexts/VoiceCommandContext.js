import React, { createContext, useContext, useRef, useEffect } from 'react';
import { Platform, NativeModules, PermissionsAndroid } from 'react-native';
import Voice from '@react-native-voice/voice';
import { useLocation } from './LocationContext';
import { useAuth } from './AuthContext';
import { useNavigationControl } from './NavigationControlContext';
import { detectCommand, processCommand } from '../utils/commandProcessor';
import { sendEmergencyAlert } from '../utils/emergencyAlert';
import {
  speak as speechSpeak,
  PRIORITY_DEFAULT,
  PRIORITY_EMERGENCY,
} from '../utils/speechManager';

const isVoiceNativeAvailable = () =>
  !!(NativeModules.Voice || NativeModules.RCTVoice || NativeModules.RNVoice || NativeModules.VoiceModule);

const VoiceCommandContext = createContext({});

export const VoiceCommandProvider = ({ children, navigationRef }) => {
  const { currentLocation, savedLocations, saveLocation, getSavedLocationsAsync } = useLocation();
  const { currentUser, userProfile } = useAuth();
  const { stopNavigationRef, emergencyCheckRef } = useNavigationControl();
  const listeningRef = useRef(false);
  const permissionCheckedRef = useRef(false);
  const restartTimeoutRef = useRef(null);

  // Routes through speechManager so the global priority hierarchy is honored.
  // Pass `priority: PRIORITY_EMERGENCY` for emergency announcements.
  const speak = (message, options = {}) => {
    if (!message || typeof message !== 'string') return;
    speechSpeak(message, {
      priority: options.priority ?? PRIORITY_DEFAULT,
      language: options.language || 'en-US',
      pitch: options.pitch ?? 1,
      rate: options.rate ?? 0.9,
    });
  };

  const runCommand = async (transcript) => {
    const text = (transcript || '').trim().toLowerCase();
    if (emergencyCheckRef?.current?.awaiting && typeof emergencyCheckRef.current.onAnswer === 'function') {
      // Be permissive about phrasing — match yes/no anywhere in the utterance,
      // not just as the whole transcript. E.g. "yes please send help" -> yes,
      // "no I'm fine thanks" -> no.
      const isYes = /\b(yes|yeah|yep|yup|sure|correct|affirmative|help|emergency)\b/.test(text);
      const isNo = /\b(no|nope|nah|negative|fine|okay|ok|all good|alright|continue)\b/.test(text);
      const onAnswer = emergencyCheckRef.current.onAnswer;
      emergencyCheckRef.current = null;
      if (isYes && !isNo) {
        onAnswer('yes');
      } else if (isNo && !isYes) {
        onAnswer('no');
      } else {
        // Anything else — empty, ambiguous, both matched, garbled — is
        // routed as 'unintelligible' so the caller can decide what to do.
        // For the stillness check, that means: send the emergency alert.
        onAnswer('unintelligible');
      }
      return;
    }

    // NOTE: don't short-circuit on detectCommand === null. detectCommand only
    // recognizes the FIXED patterns (setHome / setOffice / navigateHome / ...).
    // The dynamic patterns — "save current location as <name>" and
    // navigate-to-saved-landmark by word overlap — are tested inside
    // processCommand. If we bail here, those new commands never run.
    const cmdType = detectCommand(transcript);

    const nav = navigationRef?.current;
    // Pre-fetch fresh saved locations for any potentially-navigation utterance.
    // We can't know it's a landmark-navigate command until processCommand runs,
    // so we err on the side of fetching when no fixed command matched.
    const isNavigate =
      cmdType === 'navigateHome' || cmdType === 'navigateOffice' || cmdType === null;
    const contextSavedLocations = isNavigate && typeof getSavedLocationsAsync === 'function'
      ? (await getSavedLocationsAsync()) ?? savedLocations
      : savedLocations;

    const result = processCommand(
      transcript,
      {
        onSetHome: async () => {
          try {
            await saveLocation('home', 'Home');
            speak('Home location saved.');
          } catch (_) {
            speak('Failed to save home location.');
          }
        },
        onSetOffice: async () => {
          try {
            await saveLocation('office', 'Office');
            speak('Office location saved.');
          } catch (_) {
            speak('Failed to save office location.');
          }
        },
        onSaveLandmark: async (name) => {
          try {
            await saveLocation('landmark', name);
            speak(`Saved current location as ${name}.`);
          } catch (_) {
            speak(`Failed to save landmark ${name}.`);
          }
        },
        onNavigateLandmark: (landmark) => {
          // navigation.navigate(...) is already handled inside processCommand;
          // here we just announce. The result.message handler at the bottom
          // also speaks "Starting navigation to <name>" but we want the more
          // specific phrasing for this case.
          speak(`Starting navigation to ${landmark?.name || 'landmark'}.`);
        },
        saveLocation: saveLocation,
        onNavigateHome: () => {},
        onNavigateOffice: () => {},
        onStopNavigation: () => {
          if (stopNavigationRef?.current) stopNavigationRef.current();
        },
        onEmergency: async () => {
          if (!currentUser?.uid) {
            speak('Please sign in to send an emergency alert.', { priority: PRIORITY_EMERGENCY });
            return;
          }
          if (!userProfile?.emergencyContact) {
            speak('Please set your emergency contact in profile settings first.', { priority: PRIORITY_EMERGENCY });
            return;
          }
          if (!currentLocation) {
            speak('Location unavailable. Enable location and try again.', { priority: PRIORITY_EMERGENCY });
            return;
          }
          try {
            await sendEmergencyAlert({
              userId: currentUser.uid,
              currentLocation,
              userProfile,
              trigger: 'voiceCommand',
            });
            speak('Emergency alert sent. Help is on the way.', { priority: PRIORITY_EMERGENCY });
          } catch (_) {
            speak('Failed to send emergency alert. Please try again.', { priority: PRIORITY_EMERGENCY });
          }
        },
        onUnknown: () => {},
      },
      {
        savedLocations: contextSavedLocations,
        navigation: nav,
      }
    );

    if (!result?.message || result.type === 'unknown') return;
    // These types handle their own speech inside their handlers — skip the
    // generic "speak result.message" path to avoid duplicate announcements.
    if (
      result.type === 'setHome' ||
      result.type === 'setOffice' ||
      result.type === 'saveLandmark' ||
      result.type === 'navigateLandmark'
    ) return;
    // Emergency confirmations preempt anything currently being spoken.
    const priority = result.type === 'emergency' ? PRIORITY_EMERGENCY : PRIORITY_DEFAULT;
    speak(result.message, { priority });
  };

  const startListeningLoop = () => {
    if (!currentUser || !isVoiceNativeAvailable() || !Voice || typeof Voice.start !== 'function') return;
    if (listeningRef.current) return;

    const scheduleRestart = () => {
      restartTimeoutRef.current = setTimeout(() => {
        restartTimeoutRef.current = null;
        if (!listeningRef.current) return;
        try {
          Voice.start('en-US');
        } catch (_) {}
      }, 800);
    };

    Voice.onSpeechResults = (e) => {
      if (e?.value?.[0]) {
        const text = e.value[0].trim();
        if (text) runCommand(text);
      }
      scheduleRestart();
    };

    Voice.onSpeechError = () => {
      scheduleRestart();
    };

    Voice.onSpeechEnd = () => {
      scheduleRestart();
    };

    listeningRef.current = true;
    try {
      Voice.start('en-US');
    } catch (_) {
      listeningRef.current = false;
    }
  };

  const stopListeningLoop = () => {
    listeningRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    try {
      if (Voice?.stop && typeof Voice.stop === 'function') Voice.stop();
      if (Voice?.cancel && typeof Voice.cancel === 'function') Voice.cancel();
    } catch (_) {}
  };

  useEffect(() => {
    if (!currentUser) {
      stopListeningLoop();
      return;
    }

    const init = async () => {
      if (Platform.OS === 'android') {
        if (permissionCheckedRef.current) {
          startListeningLoop();
          return;
        }
        try {
          let granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (!granted) {
            granted = (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
              title: 'Microphone',
              message: 'Used for voice commands.',
              buttonNeutral: 'Ask Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            })) === PermissionsAndroid.RESULTS.GRANTED;
          }
          permissionCheckedRef.current = true;
          if (granted) startListeningLoop();
        } catch (_) {}
      } else {
        permissionCheckedRef.current = true;
        startListeningLoop();
      }
    };

    init();
    return () => stopListeningLoop();
  }, [currentUser?.uid]);

  return (
    <VoiceCommandContext.Provider value={{}}>
      {children}
    </VoiceCommandContext.Provider>
  );
};

export const useVoiceCommand = () => useContext(VoiceCommandContext);
