import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    Animated,
    Platform,
    PermissionsAndroid,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    NativeModules
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Voice from '@react-native-voice/voice';
import { useLocation } from '../contexts/LocationContext';
import { useNavigationControl } from '../contexts/NavigationControlContext';
import {
  speak as speechSpeak,
  stop as speechStop,
  PRIORITY_DEFAULT,
  PRIORITY_EMERGENCY,
} from '../utils/speechManager';

// Android registers as "RCTVoice"; iOS may use "Voice". Check both.
const isVoiceNativeAvailable = () =>
  !!(NativeModules.Voice || NativeModules.RCTVoice || NativeModules.RNVoice || NativeModules.VoiceModule);
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import * as Speech from 'expo-speech';
import { detectCommand, processCommand } from '../utils/commandProcessor';
import { sendEmergencyAlert } from '../utils/emergencyAlert';

export default function VoiceCommandScreen({ navigation }) {
  const { currentLocation, savedLocations, saveLocation, getSavedLocationsAsync } = useLocation();
  const { currentUser, userProfile } = useAuth();
  const { stopNavigationRef } = useNavigationControl();
  const theme = useTheme();
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [pulseAnim] = useState(new Animated.Value(1));
  const recognitionRef = useRef(null);
  const listenDurationTimeoutRef = useRef(null);
  const [isSupported, setIsSupported] = useState(true); // Default to true, will be updated based on actual availability
  const [voiceSupported, setVoiceSupported] = useState(true); // Default to true, will be updated based on actual availability
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(null);
  const isFocusedRef = useRef(true);

  // Stop any speech when this screen loses focus (user navigates away)
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
        speechStop();
      };
    }, [])
  );

  const voiceCommands = [
    {
      command: "Set location to home",
      description: "Save current location as home",
      icon: "home",
      color: "#4CAF50"
    },
    {
      command: "Set location to office",
      description: "Save current location as office", 
      icon: "business",
      color: "#2196F3"
    },
    {
      command: "Navigate to home",
      description: "Start navigation to home",
      icon: "navigation",
      color: "#4A90E2"
    },
    {
      command: "Navigate to office", 
      description: "Start navigation to office",
      icon: "navigation",
      color: "#4A90E2"
    },
    {
      command: "Emergency help",
      description: "Send emergency alert",
      icon: "emergency",
      color: "#F44336"
    }
  ];

  useEffect(() => {
    // Check microphone permission status
    checkMicrophonePermission();
    
    // Initialize voice recognition based on platform
    if (Platform.OS === 'web') {
      // Check Web Speech Recognition API support
      if (typeof window !== 'undefined') {
        const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        if (hasSpeechRecognition) {
          setIsSupported(true);
          initializeSpeechRecognition();
        } else {
          setIsSupported(false);
        }
      } else {
        setIsSupported(false);
      }
    } else {
      // Mobile platforms - use @react-native-voice/voice
      // Assume supported initially, will be updated based on actual availability
      setIsSupported(true);
      setVoiceSupported(true);
      initializeMobileVoiceRecognition();
    }
    
    return () => {
      if (Platform.OS === 'web' && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          // Ignore if already stopped
        }
      } else if (Platform.OS !== 'web') {
        // Cleanup voice recognition only when native module is available (avoids stopSpeech of null)
        const cleanup = async () => {
          if (!isVoiceNativeAvailable()) return;
          try {
            if (!Voice || typeof Voice !== 'object') return;
            try {
              if (Voice.stop && typeof Voice.stop === 'function') await Voice.stop();
            } catch (_) {}
            try {
              if (Voice.removeAllListeners && typeof Voice.removeAllListeners === 'function') {
                Voice.removeAllListeners();
              }
            } catch (_) {}
            try {
              if (Voice.destroy && typeof Voice.destroy === 'function') await Voice.destroy();
            } catch (_) {}
          } catch (_) {}
        };
        cleanup();
      }
    };
  }, []);

  useEffect(() => {
    if (isListening) {
      startPulseAnimation();
    } else {
      stopPulseAnimation();
    }
  }, [isListening]);

  const initializeMobileVoiceRecognition = async () => {
    try {
      // Check if Voice module is properly loaded
      if (!Voice || typeof Voice !== 'object') {
        console.error('Voice module is not available');
        setVoiceSupported(false);
        setIsSupported(false);
        return;
      }

      if (!isVoiceNativeAvailable()) {
        setVoiceSupported(false);
        setIsSupported(false);
        return;
      }

      // Try to verify the native module is actually available
      // by checking if start method exists and is callable
      if (typeof Voice.start !== 'function') {
        console.error('Voice.start is not a function - native module not linked');
        console.error('Available Voice methods:', Object.getOwnPropertyNames(Voice).filter(name => typeof Voice[name] === 'function'));
        setVoiceSupported(false);
        setIsSupported(false);
        return;
      }

      // Set up event handlers (double-check Voice exists)
      if (Voice && typeof Voice === 'object') {
        Voice.onSpeechStart = () => {
          setIsListening(true);
        };

        Voice.onSpeechEnd = () => {
          setIsListening(false);
        };

        Voice.onSpeechError = (e) => {
          setIsListening(false);
          
          let errorMessage = 'An error occurred during speech recognition.';
          if (e.error?.code === '7' || e.error?.code === 7) {
            errorMessage = 'No speech detected. Please try again.';
          } else if (e.error?.code === '4' || e.error?.code === 4) {
            errorMessage = 'Cannot access microphone.';
            setHasMicrophonePermission(false);
          } else if (e.error?.code === '9' || e.error?.code === 9) {
            errorMessage = 'Microphone permission not granted.';
            setHasMicrophonePermission(false);
          } else if (e.error?.code === '11' || e.error?.code === 11 || e.error?.message?.includes("Didn't understand")) {
            errorMessage = "Didn't understand, please try again.";
          }
          
          setRecognizedText('');
        };

        Voice.onSpeechResults = (e) => {
          if (e.value && e.value.length > 0) {
            const transcript = e.value[0];
            setRecognizedText(transcript);
            
            setTimeout(() => {
              processVoiceCommand(transcript);
            }, 500);
          }
        };
      }

      setVoiceSupported(true);
      setIsSupported(true);
    } catch (error) {
      const errorMessage = error.message || error.toString() || '';
      if (errorMessage.includes('null') || errorMessage.includes('startSpeech') || errorMessage.includes('module')) {
        setVoiceSupported(false);
        setIsSupported(false);
      } else {
        // For other errors, still allow user to try
        setVoiceSupported(true);
        setIsSupported(true);
      }
    }
  };

  const initializeSpeechRecognition = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setRecognizedText(transcript);
      setIsListening(false);
      
      setTimeout(() => {
        processVoiceCommand(transcript);
      }, 500);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      
      let errorMessage = 'An error occurred during speech recognition.';
      if (event.error === 'no-speech') {
        errorMessage = 'No speech detected. Please try again.';
      } else if (event.error === 'audio-capture') {
        errorMessage = 'Cannot access microphone.';
      } else if (event.error === 'not-allowed') {
        errorMessage = 'Microphone permission not granted.';
      }
      
      setRecognizedText('');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const checkMicrophonePermission = async () => {
    if (Platform.OS === 'web') {
      // Web permissions are handled by the browser
      setHasMicrophonePermission(true);
      return;
    }
    
    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        setHasMicrophonePermission(result);
        return result;
      } catch (err) {
        console.warn('Error checking permission:', err);
        setHasMicrophonePermission(false);
        return false;
      }
    } else {
      // iOS - permissions are requested when needed
      // We'll assume it might not be granted initially
      setHasMicrophonePermission(null);
      return null;
    }
  };

  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs access to your microphone for voice commands.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        
        // Check the result
        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        
        // Wait a moment for the permission to be fully processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify by checking the permission status again
        const verified = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        
        // Update permission status with verified result
        setHasMicrophonePermission(verified);
        
        if (verified) {
          await initializeMobileVoiceRecognition();
          return true;
        } else {
          setHasMicrophonePermission(false);
          return false;
        }
      } catch (err) {
        console.warn('Permission error:', err);
        setHasMicrophonePermission(false);
        return false;
      }
    } else {
      // iOS - permissions are requested when Voice.start() is called
      // We'll try to start and see if permission is needed
      try {
        // Clean up any existing session first (only if native module is available)
        if (isVoiceNativeAvailable()) {
          try {
            if (Voice.stop && typeof Voice.stop === 'function') {
              await Voice.stop();
            }
            if (Voice.cancel && typeof Voice.cancel === 'function') {
              await Voice.cancel();
            }
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }

        // Check if Voice module is available
        if (!Voice || typeof Voice !== 'object' || typeof Voice.start !== 'function') {
          throw new Error('Voice recognition module is not available');
        }

        // Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Double-check Voice is still available before starting
        if (!Voice || typeof Voice !== 'object' || typeof Voice.start !== 'function') {
          throw new Error('Voice recognition module is not available');
        }

        try {
          await Voice.start('en-US');
          // If successful, stop immediately and set permission to granted
          if (Voice.stop && typeof Voice.stop === 'function') {
            await Voice.stop();
          }
          setHasMicrophonePermission(true);
          return true;
        } catch (startError) {
          // If start fails due to native module issues, handle it specifically
          const startErrorMessage = startError?.message || startError?.toString() || '';
          if (startErrorMessage.includes('null') || startErrorMessage.includes('startSpeech')) {
            throw new Error('Voice recognition native module is not properly initialized');
          }
          throw startError; // Re-throw other errors
        }
      } catch (error) {
        console.error('iOS permission check error:', error);
        const errorMessage = error.message || error.toString() || '';
        if (errorMessage.includes('null') || errorMessage.includes('startSpeech') || errorMessage.includes('module') || errorMessage.includes('not properly initialized')) {
          setHasMicrophonePermission(false);
          return false;
        } else if (errorMessage.includes('permission') || errorMessage.includes('microphone') || errorMessage.includes('denied')) {
          setHasMicrophonePermission(false);
        } else {
          // For other errors, assume permission might be granted
          setHasMicrophonePermission(true);
        }
        return false;
      }
    }
  };

  const startListening = async () => {
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          // ignore
        }
      }
    } else {
      // Mobile platforms
      if (!isVoiceNativeAvailable()) {
        setVoiceSupported(false);
        setIsSupported(false);
        return;
      }

      setIsListening(true);
      // Check and request permission if needed
      if (Platform.OS === 'android') {
        let needPermission = hasMicrophonePermission === false;
        if (!needPermission && hasMicrophonePermission === null) {
          const checked = await checkMicrophonePermission();
          needPermission = checked === false;
        }
        if (needPermission) {
          const hasPermission = await requestMicrophonePermission();
          if (!hasPermission) {
            setIsListening(false);
            return;
          }
        }
      }

      try {
        // Check if Voice module is properly loaded (Voice is the RCTVoice instance; native is separate)
        if (!Voice || typeof Voice !== 'object') {
          throw new Error('Voice recognition module is not available. Please ensure the app is properly built with native modules.');
        }

        if (typeof Voice.start !== 'function') {
          throw new Error('Voice recognition module is not properly initialized. Please rebuild the app with native modules.');
        }

        // On Android, verify speech recognition service is available
        if (Platform.OS === 'android') {
          try {
            const available = await Voice.isAvailable();
            if (!available) {
              setIsListening(false);
              return;
            }
          } catch (availErr) {
            setIsListening(false);
            return;
          }
        }

        // Clean up any existing voice recognition session first (only if native module is available)
        if (isVoiceNativeAvailable()) {
          try {
            if (Voice.stop && typeof Voice.stop === 'function') {
              await Voice.stop();
            }
            if (Voice.cancel && typeof Voice.cancel === 'function') {
              await Voice.cancel();
            }
          } catch (cleanupError) {
            // Ignore cleanup errors - might not have an active session
          }
        }

        // Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Always set event handlers before starting (so this screen's handlers are used)
        if (Voice && typeof Voice === 'object') {
          Voice.onSpeechStart = () => {
            setIsListening(true);
          };
          Voice.onSpeechEnd = () => {
            setIsListening(false);
          };
          Voice.onSpeechError = (e) => {
            setIsListening(false);
            
            let errorMessage = 'An error occurred during speech recognition.';
            if (e.error?.code === '7' || e.error?.code === 7) {
              errorMessage = 'No speech detected. Please try again.';
            } else if (e.error?.code === '4' || e.error?.code === 4) {
              errorMessage = 'Cannot access microphone.';
              setHasMicrophonePermission(false);
            } else if (e.error?.code === '9' || e.error?.code === 9) {
              errorMessage = 'Microphone permission not granted.';
              setHasMicrophonePermission(false);
            } else if (e.error?.code === '11' || e.error?.code === 11 || e.error?.message?.includes("Didn't understand")) {
              errorMessage = "Didn't understand, please try again.";
            }
            
            setRecognizedText('');
          };
          Voice.onSpeechResults = (e) => {
            if (e.value && e.value.length > 0) {
              const transcript = e.value[0];
              setRecognizedText(transcript);
              
              setTimeout(() => {
                processVoiceCommand(transcript);
              }, 500);
            }
          };
        }

        // Double-check Voice is still available before starting
        if (!Voice || typeof Voice !== 'object' || typeof Voice.start !== 'function') {
          throw new Error('Voice recognition module is not available. Please rebuild the app with native modules.');
        }

        // Ensure any previous session is completely cleaned up
        try {
          if (Voice.cancel && typeof Voice.cancel === 'function') {
            await Voice.cancel();
          }
        } catch (e) {
          // Ignore
        }
        
        // Delay to let native module and mic stabilize before starting
        await new Promise(resolve => setTimeout(resolve, 500));

        // Start voice recognition
        try {
          const startPromise = Voice.start('en-US');
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Voice start timeout')), 15000)
          );
          
          await Promise.race([startPromise, timeoutPromise]);
          
          // If successful, update status and keep listening for 10 seconds then auto-stop
          setVoiceSupported(true);
          setIsSupported(true);
          if (Platform.OS === 'ios' && hasMicrophonePermission === null) {
            setHasMicrophonePermission(true);
          }
          if (listenDurationTimeoutRef.current) clearTimeout(listenDurationTimeoutRef.current);
          listenDurationTimeoutRef.current = setTimeout(async () => {
            listenDurationTimeoutRef.current = null;
            try {
              if (Voice && Voice.stop && typeof Voice.stop === 'function') await Voice.stop();
            } catch (_) {}
            setIsListening(false);
          }, 10000);
        } catch (startError) {
          // If start fails due to native module issues, handle it specifically
          const startErrorMessage = startError?.message || startError?.toString() || '';
          
          if (startErrorMessage.includes('null') || startErrorMessage.includes('startSpeech') || startErrorMessage.includes('timeout')) {
            // Check if Google Speech Recognition is available
            const errorMsg = Platform.OS === 'android' 
              ? 'Voice recognition requires Google Speech Recognition service.\n\n' +
                'On MIUI devices:\n' +
                '1. Ensure Google app is installed and updated\n' +
                '2. Settings → Apps → Google → Enable all permissions\n' +
                '3. Settings → Additional settings → Privacy → Enable microphone access\n' +
                '4. Restart the app after granting permissions'
              : 'Voice recognition native module is not properly initialized. Please rebuild the app.';
            throw new Error(errorMsg);
          }
          throw startError; // Re-throw other errors
        }
      } catch (error) {
        setIsListening(false);
        const errorMessage = error.message || error.toString() || '';
        
        // Check for specific error types
        if (errorMessage.includes('null') || errorMessage.includes('startSpeech') || errorMessage.includes('module') || errorMessage.includes('not properly initialized') || errorMessage.includes('Google Speech Recognition')) {
          setVoiceSupported(false);
          setIsSupported(false);
        } else if (errorMessage.includes('permission') || errorMessage.includes('microphone') || errorMessage.includes('denied')) {
          setHasMicrophonePermission(false);
        } else if (errorMessage.includes('not available') || errorMessage.includes('unavailable')) {
          setVoiceSupported(false);
          setIsSupported(false);
        }
      }
    }
  };

  const stopListening = async () => {
    if (listenDurationTimeoutRef.current) {
      clearTimeout(listenDurationTimeoutRef.current);
      listenDurationTimeoutRef.current = null;
    }
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          // Ignore stop errors
        }
      }
    } else {
      try {
        if (Voice && Voice.stop && typeof Voice.stop === 'function') {
          await Voice.stop();
        }
      } catch (error) {
        // Ignore stop errors
      }
    }
    setIsListening(false);
    setRecognizedText('');
  };

  // Routes through speechManager so the global priority hierarchy is honored.
  // Pass `priority` to mark emergency utterances as PRIORITY_EMERGENCY.
  const speak = (message, priority = PRIORITY_DEFAULT) => {
    if (!message || typeof message !== 'string') return;
    if (!isFocusedRef.current) return;
    speechSpeak(message, { priority });
  };

  const processVoiceCommand = async (command) => {
    const cmdType = detectCommand(command);
    const isNavigate = cmdType === 'navigateHome' || cmdType === 'navigateOffice';
    const contextSavedLocations = isNavigate && typeof getSavedLocationsAsync === 'function'
      ? (await getSavedLocationsAsync()) ?? savedLocations
      : savedLocations;

    const result = processCommand(
      command,
      {
        saveLocation: saveLocation,
        onSetHome: async () => {
          try {
            await saveLocation('home', 'Home');
            speak('Home location saved.');
          } catch (_) {
            speak('Failed to save home location.');
          }
          setRecognizedText('');
        },
        onSetOffice: async () => {
          try {
            await saveLocation('office', 'Office');
            speak('Office location saved.');
          } catch (_) {
            speak('Failed to save office location.');
          }
          setRecognizedText('');
        },
        onNavigateHome: (location) => {
          setRecognizedText('');
          if (!location) speak('Home location not set. Save your home location first.');
        },
        onNavigateOffice: (location) => {
          setRecognizedText('');
          if (!location) speak('Office location not set. Save your office location first.');
        },
        onStopNavigation: () => {
          setRecognizedText('');
          if (stopNavigationRef?.current) stopNavigationRef.current();
        },
        onEmergency: async () => {
          if (!currentUser?.uid) {
            speak('Please sign in to send an emergency alert.', PRIORITY_EMERGENCY);
            setRecognizedText('');
            return;
          }
          if (!userProfile?.emergencyContact) {
            speak('Please set your emergency contact in profile settings first.', PRIORITY_EMERGENCY);
            setRecognizedText('');
            navigation.navigate('Profile');
            return;
          }
          if (!currentLocation) {
            speak('Location unavailable. Enable location and try again.', PRIORITY_EMERGENCY);
            setRecognizedText('');
            return;
          }
          try {
            await sendEmergencyAlert({
              userId: currentUser.uid,
              currentLocation,
              userProfile,
              trigger: 'voiceCommand',
            });
            speak('Emergency alert sent. Help is on the way.', PRIORITY_EMERGENCY);
          } catch (_) {
            speak('Failed to send emergency alert. Please try again.', PRIORITY_EMERGENCY);
          }
          setRecognizedText('');
        },
        onUnknown: () => setRecognizedText('')
      },
      { savedLocations: contextSavedLocations, navigation }
    );
    setRecognizedText('');
    if (result?.message && result.type !== 'unknown' && result.type !== 'setHome' && result.type !== 'setOffice') {
      // Emergency confirmations preempt anything currently being spoken.
      const priority = result.type === 'emergency' ? PRIORITY_EMERGENCY : PRIORITY_DEFAULT;
      speak(result.message, priority);
    }
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: 20,
      paddingHorizontal: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary,
    },
    commandCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.card,
      marginBottom: 12,
      borderRadius: 8,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    commandTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    commandDescription: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    statusText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    listenButtonTouch: {
      justifyContent: 'center',
      alignItems: 'center',
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: theme.colors.card,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    recognizedTextContainer: {
      marginTop: 24,
      padding: 16,
      backgroundColor: theme.colors.inputBackground,
      borderRadius: 8,
      alignItems: 'center',
    },
    recognizedText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    permissionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: theme.colors.card,
      marginBottom: 16,
      borderRadius: 12,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
      borderLeftWidth: 4,
      borderLeftColor: '#FF9800',
    },
    permissionInfo: {
      marginLeft: 16,
      flex: 1,
    },
    permissionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 8,
    },
    permissionDescription: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 12,
      lineHeight: 20,
    },
    permissionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2196F3',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      gap: 8,
    },
    permissionButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });

  return (
    <ScrollView style={dynamicStyles.container}>
      <View style={styles.header}>
        <Text style={dynamicStyles.title}>Voice Commands</Text>
        <Text style={dynamicStyles.subtitle}>Control the app with your voice</Text>
      </View>

      <View style={styles.commandList}>
        {voiceCommands.map((command, index) => (
          <View key={index} style={dynamicStyles.commandCard}>
            <MaterialIcons name={command.icon} size={30} color={command.color} />
            <View style={styles.commandInfo}>
              <Text style={dynamicStyles.commandTitle}>{command.command}</Text>
              <Text style={dynamicStyles.commandDescription}>{command.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Microphone Permission Section */}
      {Platform.OS !== 'web' && hasMicrophonePermission === false && (
        <View style={dynamicStyles.permissionCard}>
          <MaterialIcons name="mic-off" size={40} color="#F44336" />
          <View style={styles.permissionInfo}>
            <Text style={dynamicStyles.permissionTitle}>Microphone Access Required</Text>
            <Text style={dynamicStyles.permissionDescription}>
              To use voice commands, please grant microphone access permission.
            </Text>
            <TouchableOpacity
              style={dynamicStyles.permissionButton}
              onPress={requestMicrophonePermission}
            >
              <MaterialIcons name="settings" size={20} color="#FFFFFF" />
              <Text style={dynamicStyles.permissionButtonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {Platform.OS !== 'web' && hasMicrophonePermission === null && (
        <View style={dynamicStyles.permissionCard}>
          <MaterialIcons name="mic" size={40} color="#FF9800" />
          <View style={styles.permissionInfo}>
            <Text style={dynamicStyles.permissionTitle}>Check Microphone Access</Text>
            <Text style={dynamicStyles.permissionDescription}>
              We need to verify microphone access to enable voice commands.
            </Text>
            <TouchableOpacity
              style={dynamicStyles.permissionButton}
              onPress={requestMicrophonePermission}
            >
              <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
              <Text style={dynamicStyles.permissionButtonText}>Request Permission</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.listeningStatus}>
        <Text style={dynamicStyles.statusText}>
          {isListening ? 'Listening...' : isSupported ? 'Press to speak' : 'Voice recognition unavailable'}
        </Text>
        {!isSupported && Platform.OS !== 'web' && (
          <View style={{ marginTop: 8, alignItems: 'center' }}>
            <Text style={[dynamicStyles.subtitle, { textAlign: 'center', marginBottom: 4 }]}>
              Native module not initialized
            </Text>
            <Text style={[dynamicStyles.subtitle, { textAlign: 'center', fontSize: 12 }]}>
              Rebuild app: npx expo run:android
            </Text>
          </View>
        )}
      </View>

      <Animated.View style={[styles.listenButton, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity
          style={dynamicStyles.listenButtonTouch}
          onPress={isListening ? stopListening : startListening}
        >
          <MaterialIcons 
            name={isListening ? 'mic' : 'mic-off'}
            size={80}
            color={isListening ? '#F44336' : '#4CAF50'}
          />
        </TouchableOpacity>
      </Animated.View>

      {recognizedText ? (
        <View style={dynamicStyles.recognizedTextContainer}>
          <Text style={dynamicStyles.recognizedText}>{recognizedText}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  commandList: {
    marginBottom: 24,
  },
  commandInfo: {
    marginLeft: 16,
    flex: 1,
  },
  listeningStatus: {
    marginBottom: 24,
    alignItems: 'center',
  },
  permissionInfo: {
    marginLeft: 16,
    flex: 1,
  },
  listenButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
});
