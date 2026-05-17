import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Animated,
  Platform,
  PermissionsAndroid,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  NativeModules
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const CHATBOT_GREETING_KEY = 'chatbot_greeting_spoken';

const isVoiceNativeAvailable = () =>
  !!(NativeModules.Voice || NativeModules.RCTVoice || NativeModules.RNVoice || NativeModules.VoiceModule);
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { processCommand, detectCommand } from '../utils/commandProcessor';
import { processUserInput, getContextualResponse } from '../utils/aiChatbot';
import { sendEmergencyAlert } from '../utils/emergencyAlert';

// Import Speech with error handling for missing native module
let Speech = null;
try {
  Speech = require('expo-speech');
  // Verify the module is actually available
  if (Speech && typeof Speech.speak === 'function') {
    console.log('expo-speech module loaded successfully');
  } else {
    console.warn('expo-speech module loaded but speak function not available');
    Speech = null;
  }
} catch (error) {
  console.warn('expo-speech native module not found. Audio feedback will be disabled.');
  console.warn('To enable audio feedback, rebuild the app: npx expo run:android or npx expo run:ios');
  Speech = null;
}

export default function ChatbotScreen({ navigation }) {
  const { currentLocation, savedLocations, saveLocation } = useLocation();
  const { currentUser, userProfile } = useAuth();
  const { stopNavigationRef } = useNavigationControl();
  const theme = useTheme();
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your AI assistant. I can help you with:\n\n• Setting locations (home/office)\n• Navigation\n• Emergency help\n• Answering questions\n• General conversation\n\nYou can type or use voice commands! Feel free to chat with me!",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const recognitionRef = useRef(null);
  const [isSupported, setIsSupported] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef(null);
  const typingAnim1 = useRef(new Animated.Value(0)).current;
  const typingAnim2 = useRef(new Animated.Value(0)).current;
  const typingAnim3 = useRef(new Animated.Value(0)).current;
  const pendingErrorRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const errorShownRef = useRef(false);
  const lastMicStopTimeRef = useRef(null);
  const listenDurationTimeoutRef = useRef(null);
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

  useEffect(() => {
    checkMicrophonePermission();
    
    if (Platform.OS === 'web') {
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

  useEffect(() => {
    if (isTyping) {
      // Animate typing dots
      const animateDot = (animValue, delay) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(animValue, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(animValue, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        );
      };

      const anim1 = animateDot(typingAnim1, 0);
      const anim2 = animateDot(typingAnim2, 200);
      const anim3 = animateDot(typingAnim3, 400);

      anim1.start();
      anim2.start();
      anim3.start();

      return () => {
        anim1.stop();
        anim2.stop();
        anim3.stop();
        typingAnim1.setValue(0);
        typingAnim2.setValue(0);
        typingAnim3.setValue(0);
      };
    }
  }, [isTyping]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages are added
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  // Speak initial greeting only the first time the chatbot is ever opened
  useEffect(() => {
    let timer = null;
    let cancelled = false;
    if (messages.length === 1 && messages[0].sender === 'bot') {
      (async () => {
        try {
          const alreadySpoken = await AsyncStorage.getItem(CHATBOT_GREETING_KEY);
          if (alreadySpoken === 'true' || cancelled) return;
          timer = setTimeout(() => {
            if (Speech && Speech.speak) {
              console.log('Speaking initial greeting (first open)');
              speakText(messages[0].text, 0);
            } else {
              console.warn('Speech not available for initial greeting');
            }
            AsyncStorage.setItem(CHATBOT_GREETING_KEY, 'true').catch(() => {});
          }, 1500);
        } catch (err) {
          console.warn('Failed to read greeting flag', err);
        }
      })();
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Test Speech availability on mount
  useEffect(() => {
    if (Speech) {
      console.log('Speech module loaded:', typeof Speech.speak);
    } else {
      console.warn('Speech module not available. Install expo-speech: npm install expo-speech');
    }
  }, []);

  const initializeMobileVoiceRecognition = async () => {
    try {
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
      if (typeof Voice.start !== 'function') {
        console.error('Voice.start is not a function');
        setVoiceSupported(false);
        setIsSupported(false);
        return;
      }

      if (Voice && typeof Voice === 'object') {
        Voice.onSpeechStart = () => {
          setIsListening(true);
        };

        Voice.onSpeechEnd = () => {
          setIsListening(false);
          lastMicStopTimeRef.current = Date.now(); // Track when mic stops (RULE: Delay speech after mic stop)
          
          // Show pending error after listening ends (for every session)
          if (pendingErrorRef.current && !errorShownRef.current) {
            // Clear the fallback timeout since we're showing it now
            if (errorTimeoutRef.current) {
              clearTimeout(errorTimeoutRef.current);
              errorTimeoutRef.current = null;
            }
            
            setTimeout(() => {
              if (pendingErrorRef.current && !errorShownRef.current) {
                addMessage('bot', pendingErrorRef.current);
                pendingErrorRef.current = null;
                errorShownRef.current = true;
              }
            }, 300);
          }
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
          
          // Store error and wait for onSpeechEnd to show it
          pendingErrorRef.current = errorMessage;
          errorShownRef.current = false; // Reset flag when new error occurs
          
          // Clear any existing timeout
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
          }
          
          // Fallback: show error after longer delay if onSpeechEnd doesn't fire
          // Increased to 2000ms to ensure onSpeechEnd fires first
          errorTimeoutRef.current = setTimeout(() => {
            if (pendingErrorRef.current && !errorShownRef.current) {
              addMessage('bot', pendingErrorRef.current);
              pendingErrorRef.current = null;
              errorShownRef.current = true;
            }
          }, 2000);
        };

        Voice.onSpeechResults = (e) => {
          // Clear any pending error since we got results
          if (pendingErrorRef.current) {
            pendingErrorRef.current = null;
          }
          if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = null;
          }
          
          if (e.value && e.value.length > 0) {
            const transcript = e.value[0];
            addMessage('user', transcript);
            
            setTimeout(() => {
              handleCommand(transcript);
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
      
      // Clear any pending error since we got results
      if (pendingErrorRef.current) {
        pendingErrorRef.current = null;
      }
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
      errorShownRef.current = false; // Reset flag on successful results
      
      addMessage('user', transcript);
      setIsListening(false);
      
      setTimeout(() => {
        handleCommand(transcript);
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
      
      // Store error and wait for onend to show it
      pendingErrorRef.current = errorMessage;
      errorShownRef.current = false; // Reset flag when new error occurs
      
      // Clear any existing timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      
      // Fallback: show error after longer delay if onend doesn't fire
      // Increased to 2000ms to ensure onend fires first
      errorTimeoutRef.current = setTimeout(() => {
        if (pendingErrorRef.current && !errorShownRef.current) {
          addMessage('bot', pendingErrorRef.current);
          pendingErrorRef.current = null;
          errorShownRef.current = true;
        }
      }, 2000);
    };

    recognition.onend = () => {
      setIsListening(false);
      lastMicStopTimeRef.current = Date.now(); // Track when mic stops (RULE: Delay speech after mic stop)
      
      // Show pending error after listening ends
      if (pendingErrorRef.current && !errorShownRef.current) {
        // Clear the fallback timeout since we're showing it now
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        
        setTimeout(() => {
          if (pendingErrorRef.current && !errorShownRef.current) {
            addMessage('bot', pendingErrorRef.current);
            pendingErrorRef.current = null;
            errorShownRef.current = true;
          }
        }, 300);
      }
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
        
        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const verified = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        
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
      // iOS
      try {
        if (Voice.stop && typeof Voice.stop === 'function') {
          await Voice.stop();
        }
        if (Voice.cancel && typeof Voice.cancel === 'function') {
          await Voice.cancel();
        }
      } catch (cleanupError) {
        // Ignore
      }

      if (!Voice || typeof Voice !== 'object' || typeof Voice.start !== 'function') {
        throw new Error('Voice recognition module is not available');
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await Voice.start('en-US');
        if (Voice.stop && typeof Voice.stop === 'function') {
          await Voice.stop();
        }
        setHasMicrophonePermission(true);
        return true;
      } catch (startError) {
        setHasMicrophonePermission(false);
        return false;
      }
    }
  };

  const startListening = async () => {
    // Clear any pending errors from previous session
    if (pendingErrorRef.current) {
      pendingErrorRef.current = null;
    }
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    errorShownRef.current = false; // Reset error shown flag
    
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          addMessage('bot', 'Cannot start speech recognition.');
        }
      }
    } else {
      if (!isVoiceNativeAvailable()) {
        addMessage('bot', 'Voice recognition is not available. Rebuild the app with: npx expo run:android');
        setVoiceSupported(false);
        setIsSupported(false);
        return;
      }

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

      setIsListening(true);
      try {
        if (!Voice || typeof Voice !== 'object' || typeof Voice.start !== 'function') {
          throw new Error('Voice recognition module is not available.');
        }

        if (Platform.OS === 'android') {
          try {
            const available = await Voice.isAvailable();
            if (!available) {
              setIsListening(false);
              addMessage('bot', 'Google Speech Recognition is not available on this device. Install or update the Google app.');
              return;
            }
          } catch (availErr) {
            setIsListening(false);
            addMessage('bot', (availErr && (availErr.message || availErr.toString())) || 'Could not check speech recognition.');
            return;
          }
        }

        try {
          if (Voice.stop && typeof Voice.stop === 'function') {
            await Voice.stop();
          }
          if (Voice.cancel && typeof Voice.cancel === 'function') {
            await Voice.cancel();
          }
        } catch (cleanupError) {
          // Ignore
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        // Always set up handlers to ensure they work on every press
        if (Voice && typeof Voice === 'object') {
          Voice.onSpeechStart = () => setIsListening(true);
          
          Voice.onSpeechEnd = () => {
            setIsListening(false);
            lastMicStopTimeRef.current = Date.now(); // Track when mic stops (RULE: Delay speech after mic stop)
            
            // Show pending error after listening ends (for every session)
            if (pendingErrorRef.current && !errorShownRef.current) {
              // Clear the fallback timeout since we're showing it now
              if (errorTimeoutRef.current) {
                clearTimeout(errorTimeoutRef.current);
                errorTimeoutRef.current = null;
              }
              
              setTimeout(() => {
                if (pendingErrorRef.current && !errorShownRef.current) {
                  addMessage('bot', pendingErrorRef.current);
                  pendingErrorRef.current = null;
                  errorShownRef.current = true;
                }
              }, 300);
            }
          };
          
          Voice.onSpeechError = (e) => {
            setIsListening(false);
            
            let errorMessage = 'Speech recognition error. Please try again.';
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
            
            // Store error and wait for onSpeechEnd to show it
            pendingErrorRef.current = errorMessage;
            errorShownRef.current = false; // Reset flag when new error occurs
            
            // Clear any existing timeout
            if (errorTimeoutRef.current) {
              clearTimeout(errorTimeoutRef.current);
            }
            
            // Fallback: show error after longer delay if onSpeechEnd doesn't fire
            // Increased to 2000ms to ensure onSpeechEnd fires first
            errorTimeoutRef.current = setTimeout(() => {
              if (pendingErrorRef.current && !errorShownRef.current) {
                addMessage('bot', pendingErrorRef.current);
                pendingErrorRef.current = null;
                errorShownRef.current = true;
              }
            }, 2000);
          };
          
          Voice.onSpeechResults = (e) => {
            // Clear any pending error since we got results
            if (pendingErrorRef.current) {
              pendingErrorRef.current = null;
            }
            if (errorTimeoutRef.current) {
              clearTimeout(errorTimeoutRef.current);
              errorTimeoutRef.current = null;
            }
            errorShownRef.current = false; // Reset flag on successful results
            
            if (e.value && e.value.length > 0) {
              const transcript = e.value[0];
              addMessage('user', transcript);
              setTimeout(() => {
                handleCommand(transcript);
              }, 500);
            }
          };
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          await Voice.start('en-US');
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
          setIsListening(false);
          const errorMessage = startError?.message || startError?.toString() || '';
          if (errorMessage.includes('null') || errorMessage.includes('startSpeech')) {
            setVoiceSupported(false);
            setIsSupported(false);
            addMessage('bot', 'Voice recognition is not available on this device.');
          }
        }
      } catch (error) {
        setIsListening(false);
        const errorMessage = error.message || error.toString() || '';
        addMessage('bot', `Error: ${errorMessage}`);
      }
    }
  };

  const stopListening = async () => {
    if (listenDurationTimeoutRef.current) {
      clearTimeout(listenDurationTimeoutRef.current);
      listenDurationTimeoutRef.current = null;
    }
    // Clear any pending errors when manually stopping
    if (pendingErrorRef.current) {
      pendingErrorRef.current = null;
    }
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    errorShownRef.current = false; // Reset flag when stopping
    
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          // Ignore
        }
      }
    } else {
      try {
        if (Voice && Voice.stop && typeof Voice.stop === 'function') {
          await Voice.stop();
        }
      } catch (error) {
        // Ignore
      }
    }
    setIsListening(false);
  };

  // Centralized speech function. Routes through speechManager so the global
  // priority hierarchy is honored: PRIORITY_EMERGENCY > PRIORITY_OBJECT_DETECTION
  // > PRIORITY_DEFAULT. Emergency-related chatbot announcements are passed at
  // PRIORITY_EMERGENCY by the caller; everything else is PRIORITY_DEFAULT.
  const speakText = (text, delayAfterMicStop = 0, priority = PRIORITY_DEFAULT) => {
    // Suppress speech once the user has navigated away from this screen
    if (!isFocusedRef.current) {
      return;
    }

    // Clean text for speech (remove emojis and special characters)
    const cleanText = (text || '')
      .replace(/✅/g, 'success')
      .replace(/❌/g, 'error')
      .replace(/🚗/g, '')
      .replace(/🚨/g, 'emergency')
      .replace(/📍/g, 'location')
      .replace(/🏠/g, 'home')
      .replace(/🏢/g, 'office')
      .replace(/\n/g, '. ')
      .replace(/\*/g, '')
      .replace(/•/g, '')
      .trim();

    if (!cleanText) return;

    const fire = () => speechSpeak(cleanText, { priority });
    if (delayAfterMicStop > 0) {
      setTimeout(fire, delayAfterMicStop);
    } else {
      fire();
    }
  };

  const addMessage = (sender, text) => {
    const newMessage = {
      id: Date.now() + Math.random(),
      text,
      sender,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
    
    // Note: Speech is handled centrally in handleCommand, not here
    // This follows the rule: Speak from one place only
  };

  const handleCommand = (command) => {
    // Show typing indicator
    setIsTyping(true);
    
    // Use AI chatbot processor which handles both commands and conversation
    const handlers = {
      saveLocation: saveLocation,
      onSetHome: async () => {
        try {
          await saveLocation('home', 'Home');
          const message = '✅ Home location saved successfully!';
          addMessage('bot', message);
          // Speech handled centrally in handleCommand
        } catch (error) {
          const message = '❌ Failed to save home location. Please try again.';
          addMessage('bot', message);
          // Speech handled centrally in handleCommand
        }
      },
      onSetOffice: async () => {
        try {
          await saveLocation('office', 'Office');
          const message = '✅ Office location saved successfully!';
          addMessage('bot', message);
          // Speech handled centrally in handleCommand
        } catch (error) {
          const message = '❌ Failed to save office location. Please try again.';
          addMessage('bot', message);
          // Speech handled centrally in handleCommand
        }
      },
      onNavigateHome: (location) => {
        if (location) {
          addMessage('bot', '🚗 Starting navigation to home...');
        } else {
          addMessage('bot', '❌ Home location not set. Would you like me to save your current location as home?');
        }
        // Speech handled centrally in handleCommand
      },
      onNavigateOffice: (location) => {
        if (location) {
          addMessage('bot', '🚗 Starting navigation to office...');
        } else {
          addMessage('bot', '❌ Office location not set. Would you like me to save your current location as office?');
        }
        // Speech handled centrally in handleCommand
      },
      onStopNavigation: () => {
        if (stopNavigationRef?.current) stopNavigationRef.current();
        addMessage('bot', '🛑 Navigation stopped.');
      },
      onEmergency: () => {
        // Emergency side effects are handled centrally after command parsing
      },
      onUnknown: (cmd) => {
        // Handled by AI chatbot
      }
    };

    const context = {
      savedLocations,
      navigation,
      currentLocation,
      currentTime: new Date()
    };

    // Process input with AI chatbot (handles both commands and conversation)
    const result = processUserInput(
      command,
      (input, handlers, context) => processCommand(input, handlers, context),
      handlers,
      context
    );

    // Add bot response with a slight delay for more natural conversation flow
    // Simulate thinking time based on response length
    const responseDelay = Math.min(500 + (result.response.length * 10), 1500);
    
    setTimeout(() => {
      setIsTyping(false);

      // Calculate delay after mic stop (RULE: Delay speech slightly after mic stop)
      let delayAfterMicStop = 0;
      if (lastMicStopTimeRef.current) {
        const timeSinceMicStop = Date.now() - lastMicStopTimeRef.current;
        if (timeSinceMicStop < 2000) {
          delayAfterMicStop = 500 - timeSinceMicStop;
          if (delayAfterMicStop < 0) delayAfterMicStop = 0;
        }
      }
      
      if (result.isCommand && result.commandResult) {
        // It's a command - handle it
        const cmdResult = result.commandResult;

        // Emergency command: actually create Firestore log (and avoid duplicate bot messages)
        if (cmdResult.type === 'emergency') {
          const uid = currentUser?.uid;
          if (!uid) {
            const msg = '❌ You are not signed in. Please sign in to send an emergency alert.';
            addMessage('bot', msg);
            speakText(msg, delayAfterMicStop, PRIORITY_EMERGENCY);
            return;
          }
          if (!userProfile?.emergencyContact) {
            const msg = '❌ Emergency contact is not set. Please update your profile first.';
            addMessage('bot', msg);
            speakText(msg, delayAfterMicStop, PRIORITY_EMERGENCY);
            return;
          }
          if (!currentLocation) {
            const msg = '❌ Location is unavailable. Please enable location services and try again.';
            addMessage('bot', msg);
            speakText(msg, delayAfterMicStop, PRIORITY_EMERGENCY);
            return;
          }

          const sendingMsg = '🚨 Sending emergency alert now...';
          addMessage('bot', sendingMsg);
          speakText(sendingMsg, delayAfterMicStop, PRIORITY_EMERGENCY);

          (async () => {
            try {
              await sendEmergencyAlert({
                userId: uid,
                currentLocation,
                userProfile,
                trigger: 'chatbotVoice',
              });
              const okMsg = '✅ Emergency alert sent and your location was logged.';
              addMessage('bot', okMsg);
              speakText(okMsg, 0, PRIORITY_EMERGENCY);
            } catch (error) {
              const errMsg = `❌ Failed to send emergency alert. ${error?.message || ''}`.trim();
              addMessage('bot', errMsg);
              speakText(errMsg, 0, PRIORITY_EMERGENCY);
            }
          })();

          return;
        }
        
        // Handle setHome/setOffice: execute directly, no confirmation
        if (cmdResult.type === 'setHome' || cmdResult.type === 'setOffice') {
          const locationType = cmdResult.type === 'setHome' ? 'home' : 'office';
          (async () => {
            try {
              await saveLocation(locationType, locationType.charAt(0).toUpperCase() + locationType.slice(1));
              const message = `✅ ${locationType.charAt(0).toUpperCase() + locationType.slice(1)} location saved successfully!`;
              addMessage('bot', message);
              let delayAfterMicStop = 0;
              if (lastMicStopTimeRef.current) {
                const timeSinceMicStop = Date.now() - lastMicStopTimeRef.current;
                if (timeSinceMicStop < 2000) {
                  delayAfterMicStop = Math.max(0, 500 - timeSinceMicStop);
                }
              }
              speakText(message, delayAfterMicStop);
            } catch (error) {
              const message = `❌ Failed to save ${locationType} location. Please try again.`;
              addMessage('bot', message);
              let delayAfterMicStop = 0;
              if (lastMicStopTimeRef.current) {
                const timeSinceMicStop = Date.now() - lastMicStopTimeRef.current;
                if (timeSinceMicStop < 2000) {
                  delayAfterMicStop = Math.max(0, 500 - timeSinceMicStop);
                }
              }
              speakText(message, delayAfterMicStop);
            }
          })();
        } else {
          // For other commands, just show the response
          if (cmdResult.message) {
            addMessage('bot', cmdResult.message);
          }
        }
      } else {
        // It's a conversation - show AI response
        addMessage('bot', result.response);
      }
      
      // CENTRALIZED SPEECH HANDLING - THE ONLY PLACE speech is called from (RULE: Speak from one place only)
      // Get the bot message text to speak
      const botMessageText = result.isCommand && result.commandResult?.message 
        ? result.commandResult.message 
        : result.response;
      
      // Speak the bot response (speakText handles stopping previous speech)
      if (botMessageText) {
        speakText(botMessageText, delayAfterMicStop);
      }
    }, responseDelay);
  };

  const handleSend = () => {
    if (inputText.trim()) {
      addMessage('user', inputText.trim());
      handleCommand(inputText.trim());
      setInputText('');
    }
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    chatContainer: {
      flex: 1,
      padding: 16,
      paddingBottom: 16, // Normal padding since mic is in separate section
      zIndex: 1,
    },
    messageContainer: {
      marginBottom: 16,
      flexDirection: 'row',
    },
    messageBubble: {
      maxWidth: '80%',
      padding: 12,
      borderRadius: 16,
    },
    userMessage: {
      backgroundColor: theme.colors.primary || '#2196F3',
      alignSelf: 'flex-end',
      marginLeft: 'auto',
    },
    botMessage: {
      backgroundColor: theme.colors.card || '#E0E0E0',
      alignSelf: 'flex-start',
    },
    messageText: {
      fontSize: 16,
      color: theme.colors.text,
    },
    userMessageText: {
      color: '#FFFFFF',
    },
    inputContainer: {
      flexDirection: 'row',
      padding: 16,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border || '#E0E0E0',
      alignItems: 'center',
      minHeight: 80, // Ensure consistent height
    },
    textInput: {
      flex: 1,
      backgroundColor: theme.colors.inputBackground || '#F5F5F5',
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.text,
      marginRight: 8,
      maxHeight: 100,
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.primary || '#2196F3',
      justifyContent: 'center',
      alignItems: 'center',
    },
    micSection: {
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border || '#E0E0E0',
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    largeMicContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    largeMicButtonWrapper: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    largeMicButton: {
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: '#4CAF50',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 5,
      borderColor: '#FFFFFF',
    },
    largeMicButtonActive: {
      backgroundColor: '#F44336',
    },
    largeMicButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: 'bold',
      marginTop: 4,
    },
    voiceButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isListening ? '#F44336' : '#4CAF50',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
    },
    permissionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: theme.colors.card,
      marginBottom: 8,
      borderRadius: 8,
      borderLeftWidth: 4,
      borderLeftColor: '#FF9800',
    },
  });

  return (
    <KeyboardAvoidingView
      style={dynamicStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        style={[dynamicStyles.chatContainer, { zIndex: 1 }]}
        contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {Platform.OS !== 'web' && hasMicrophonePermission === false && (
          <View style={dynamicStyles.permissionCard}>
            <MaterialIcons name="mic-off" size={24} color="#F44336" />
            <TouchableOpacity
              onPress={requestMicrophonePermission}
              style={{ marginLeft: 8, flex: 1 }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 14 }}>
                Tap to enable microphone for voice commands
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              dynamicStyles.messageContainer,
              message.sender === 'user' && { justifyContent: 'flex-end' }
            ]}
          >
            <View
              style={[
                dynamicStyles.messageBubble,
                message.sender === 'user' ? dynamicStyles.userMessage : dynamicStyles.botMessage
              ]}
            >
              <Text
                style={[
                  dynamicStyles.messageText,
                  message.sender === 'user' && dynamicStyles.userMessageText
                ]}
              >
                {message.text}
              </Text>
            </View>
          </View>
        ))}
        
        {isTyping && (
          <View
            style={[
              dynamicStyles.messageContainer,
              { justifyContent: 'flex-start' }
            ]}
          >
            <View
              style={[
                dynamicStyles.messageBubble,
                dynamicStyles.botMessage
              ]}
            >
              <View style={styles.typingIndicator}>
                <Animated.View 
                  style={[
                    [styles.typingDot, { backgroundColor: theme.colors.textSecondary || '#999' }],
                    {
                      opacity: typingAnim1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 1],
                      }),
                      transform: [{
                        scale: typingAnim1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      }],
                    }
                  ]} 
                />
                <Animated.View 
                  style={[
                    [styles.typingDot, { backgroundColor: theme.colors.textSecondary || '#999' }],
                    {
                      opacity: typingAnim2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 1],
                      }),
                      transform: [{
                        scale: typingAnim2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      }],
                    }
                  ]} 
                />
                <Animated.View 
                  style={[
                    [styles.typingDot, { backgroundColor: theme.colors.textSecondary || '#999' }],
                    {
                      opacity: typingAnim3.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 1],
                      }),
                      transform: [{
                        scale: typingAnim3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      }],
                    }
                  ]} 
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Mic Button Section - Below chat */}
      <View style={dynamicStyles.micSection}>
        <View style={dynamicStyles.largeMicContainer}>
          <Animated.View style={[dynamicStyles.largeMicButtonWrapper, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity
              style={[
                dynamicStyles.largeMicButton,
                isListening && dynamicStyles.largeMicButtonActive
              ]}
              onPress={isListening ? stopListening : startListening}
              disabled={!isSupported}
              activeOpacity={0.8}
              accessibilityLabel={isListening ? "Stop listening" : "Start voice input"}
              accessibilityHint="Double tap to start or stop voice recording"
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <MaterialIcons
                name={isListening ? 'mic' : 'mic-none'}
                size={90}
                color="#FFFFFF"
              />
              {isListening && (
                <Text style={dynamicStyles.largeMicButtonText}>Listening...</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* Text Input Container - At bottom */}
      <View style={dynamicStyles.inputContainer}>
        <TextInput
          style={dynamicStyles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors.textSecondary}
          multiline
          onSubmitEditing={handleSend}
          accessibilityLabel="Text input"
          accessibilityHint="Type your message here or use the large microphone button for voice input"
        />
        
        <TouchableOpacity
          style={dynamicStyles.sendButton}
          onPress={handleSend}
          disabled={!inputText.trim()}
          accessibilityLabel="Send message"
        >
          <MaterialIcons
            name="send"
            size={24}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#999',
    marginHorizontal: 3,
  },
});

