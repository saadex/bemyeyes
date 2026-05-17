// src/screens/main/NavigationScreen.js
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import { useLocation } from '../contexts/LocationContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigationControl } from '../contexts/NavigationControlContext';
import { useArduino } from '../contexts/ArduinoContext';
import { useAuth } from '../contexts/AuthContext';
import { detectFromBase64, preloadObstacleModel } from '../utils/navigationObstacleAlert';
import { sendEmergencyAlert } from '../utils/emergencyAlert';
import {
  speak as speechSpeak,
  stop as speechStop,
  PRIORITY_DEFAULT,
  PRIORITY_OBJECT_DETECTION,
  PRIORITY_EMERGENCY,
} from '../utils/speechManager';

// Import Speech with error handling for missing native module
let Speech = null;
try {
  Speech = require('expo-speech');
  // Verify the module is actually available
  if (Speech && typeof Speech.speak === 'function') {
    console.log('expo-speech module loaded successfully in NavigationScreen');
  } else {
    console.warn('expo-speech module loaded but speak function not available');
    Speech = null;
  }
} catch (error) {
  console.warn('expo-speech native module not found. Audio feedback will be disabled.');
  Speech = null;
}

const OBSTACLE_DISTANCE_CM = 150;
// Minimum gap between two obstacle announcements (prevents back-to-back speech overlap on low-end devices)
const OBSTACLE_COOLDOWN_MS = 3000;
// While distance stays below threshold, re-run detection at this cadence
const OBSTACLE_REPEAT_MS = 4000;
const EMERGENCY_CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const EMERGENCY_ANSWER_TIMEOUT_MS = 30 * 1000;     // 30 seconds to answer

// Speak only the first 2 words of a landmark/destination name
const getSpokenName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.trim().split(/\s+/).slice(0, 2).join(' ');
};

export default function NavigationScreen({ route }) {
  const { currentLocation, savedLocations, getDistanceToLocation } = useLocation();
  const theme = useTheme();
  const { stopNavigationRef, emergencyCheckRef } = useNavigationControl();
  const { arduinoDistanceCm } = useArduino();
  const { currentUser, userProfile } = useAuth();
  const [destination, setDestination] = useState(route?.params?.destination || null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [distance, setDistance] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const navigationIntervalRef = useRef(null);
  const lastSpokenDistanceRef = useRef(null);
  const destinationNameRef = useRef(null);
  const autoStartRef = useRef(route?.params?.autoStart || false);
  const hasAutoStartedRef = useRef(false);
  const obstacleCameraRef = useRef(null);
  const obstacleCooldownUntilRef = useRef(0);
  const lastArduinoDistanceAbove10Ref = useRef(null);
  const obstacleCameraReadyRef = useRef(false);
  const obstacleCheckInProgressRef = useRef(false);
  const emergencyCheckTimerRef = useRef(null);
  const emergencyAnswerTimeoutRef = useRef(null);
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

  // 3-minute emergency check: ask "Do you have an emergency? Say yes or no."
  const scheduleNextEmergencyCheck = useCallback(() => {
    if (emergencyCheckTimerRef.current) return;
    emergencyCheckTimerRef.current = setTimeout(() => {
      emergencyCheckTimerRef.current = null;
      // Emergency check question — always preempts any other speech
      speakText('Do you have an emergency? Say yes or no.', 0, PRIORITY_EMERGENCY);

      const answerTimeout = setTimeout(() => {
        emergencyAnswerTimeoutRef.current = null;
        if (emergencyCheckRef?.current?.awaiting) {
          emergencyCheckRef.current = null;
          scheduleNextEmergencyCheck();
        }
      }, EMERGENCY_ANSWER_TIMEOUT_MS);
      emergencyAnswerTimeoutRef.current = answerTimeout;

      emergencyCheckRef.current = {
        awaiting: true,
        onAnswer: (answer) => {
          if (emergencyAnswerTimeoutRef.current) {
            clearTimeout(emergencyAnswerTimeoutRef.current);
            emergencyAnswerTimeoutRef.current = null;
          }
          emergencyCheckRef.current = null;
          if (answer === 'yes') {
            if (currentUser?.uid && userProfile?.emergencyContact && currentLocation) {
              sendEmergencyAlert({
                userId: currentUser.uid,
                currentLocation,
                userProfile,
                trigger: 'navigationCheck',
              })
                .then(() => speakText('Emergency alert sent. Help is on the way.', 0, PRIORITY_EMERGENCY))
                .catch(() => speakText('Failed to send emergency alert.', 0, PRIORITY_EMERGENCY));
            } else {
              speakText('Please set your emergency contact in profile settings first.', 0, PRIORITY_EMERGENCY);
            }
          } else {
            speakText('Continuing navigation.', 0, PRIORITY_EMERGENCY);
          }
          scheduleNextEmergencyCheck();
        },
      };
    }, EMERGENCY_CHECK_INTERVAL_MS);
  }, [currentUser?.uid, userProfile, currentLocation]);

  // Update destination and autoStart when route params change
  useEffect(() => {
    if (route?.params?.destination) {
      setDestination(route.params.destination);
    }
    if (route?.params?.autoStart) {
      autoStartRef.current = true;
      hasAutoStartedRef.current = false; // Reset so it can auto-start
    }
  }, [route?.params]);

  const runObstacleCheck = useCallback(async () => {
    if (obstacleCheckInProgressRef.current) return;
    obstacleCheckInProgressRef.current = true;
    try {
      let labels = [];
      const cam = obstacleCameraRef.current;
      if (cam && typeof cam.takePictureAsync === 'function' && obstacleCameraReadyRef.current) {
        try {
          // Low-end-device friendly capture: tiny frame, no processing, no shutter sound
          const photo = await cam.takePictureAsync({
            quality: 0.2,
            base64: true,
            skipProcessing: true,
            exif: false,
            shutterSound: false,
          });
          if (photo?.base64) {
            labels = await detectFromBase64(photo.base64, { threshold: 0.25 });
          }
        } catch (_) {}
      }

      // Announce the result immediately — no preamble, no delay.
      // Uses PRIORITY_OBJECT_DETECTION so it interrupts default navigation
      // guidance but never an emergency announcement.
      const message = labels.length > 0
        ? `${labels.join(', ')} ahead. Proceed with caution.`
        : 'Obstacle ahead. Proceed with caution.';
      speakText(message, 0, PRIORITY_OBJECT_DETECTION);
    } finally {
      obstacleCheckInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (isNavigating && Camera?.requestCameraPermissionsAsync) {
      Camera.requestCameraPermissionsAsync().catch(() => {});
    }
  }, [isNavigating]);

  // Warm up the YOLO model the moment NavigationScreen mounts so the first
  // obstacle check on a low-end device doesn't pay the model-load cost.
  useEffect(() => {
    preloadObstacleModel();
  }, []);

  useEffect(() => {
    if (isNavigating) {
      scheduleNextEmergencyCheck();
    } else {
      if (emergencyCheckTimerRef.current) {
        clearTimeout(emergencyCheckTimerRef.current);
        emergencyCheckTimerRef.current = null;
      }
      if (emergencyAnswerTimeoutRef.current) {
        clearTimeout(emergencyAnswerTimeoutRef.current);
        emergencyAnswerTimeoutRef.current = null;
      }
      if (emergencyCheckRef?.current) emergencyCheckRef.current = null;
    }
    return () => {
      if (emergencyCheckTimerRef.current) clearTimeout(emergencyCheckTimerRef.current);
      if (emergencyAnswerTimeoutRef.current) clearTimeout(emergencyAnswerTimeoutRef.current);
    };
  }, [isNavigating, scheduleNextEmergencyCheck]);

  // Track the last time we ran detection so we can throttle while distance stays below threshold
  const lastObstacleRunAtRef = useRef(0);

  useEffect(() => {
    if (!isNavigating || arduinoDistanceCm == null) {
      if (arduinoDistanceCm != null && arduinoDistanceCm >= OBSTACLE_DISTANCE_CM) {
        lastArduinoDistanceAbove10Ref.current = true;
      }
      return;
    }
    if (arduinoDistanceCm >= OBSTACLE_DISTANCE_CM) {
      lastArduinoDistanceAbove10Ref.current = true;
      return;
    }

    const now = Date.now();
    const wasAbove = lastArduinoDistanceAbove10Ref.current !== false;
    const cooldownPassed = now > obstacleCooldownUntilRef.current;
    const enoughTimeSinceLastRun = now - lastObstacleRunAtRef.current >= OBSTACLE_REPEAT_MS;

    // Re-trigger detection EVERY time the value drops below the threshold (rising edge),
    // AND keep re-triggering on a slow cadence while the value remains below threshold.
    const shouldRun = cooldownPassed && (wasAbove || enoughTimeSinceLastRun);

    if (shouldRun) {
      lastArduinoDistanceAbove10Ref.current = false;
      obstacleCooldownUntilRef.current = now + OBSTACLE_COOLDOWN_MS;
      lastObstacleRunAtRef.current = now;
      runObstacleCheck();
    }
  }, [isNavigating, arduinoDistanceCm, runObstacleCheck]);

  // Centralized speech function - THE ONLY PLACE speech is called from.
  // Routes through speechManager so the global priority hierarchy is honored:
  //   PRIORITY_EMERGENCY > PRIORITY_OBJECT_DETECTION > PRIORITY_DEFAULT
  const speakText = (text, delay = 0, priority = PRIORITY_DEFAULT) => {
    // Suppress speech once the user has navigated away from this screen
    if (!isFocusedRef.current) {
      return;
    }

    // Clean text for speech
    const cleanText = (text || '')
      .replace(/km/g, 'kilometers')
      .replace(/m/g, 'meters')
      .replace(/min/g, 'minutes')
      .replace(/\n/g, '. ')
      .trim();

    if (!cleanText) return;

    const fire = () => speechSpeak(cleanText, { priority });
    if (delay > 0) {
      setTimeout(fire, delay);
    } else {
      fire();
    }
  };

  useEffect(() => {
    if (destination && currentLocation) {
      const dist = getDistanceToLocation(destination);
      setDistance(dist);
      if (dist) {
        const timeInMinutes = (dist / 5) * 60;
        setEstimatedTime(Math.round(timeInMinutes));
      }
    }
  }, [destination, currentLocation]);

  // Auto-start navigation when destination and distance are ready
  useEffect(() => {
    if (autoStartRef.current && destination && distance !== null && estimatedTime !== null && !hasAutoStartedRef.current && !isNavigating) {
      hasAutoStartedRef.current = true; // Prevent multiple auto-starts
      autoStartRef.current = false; // Reset flag
      // Small delay to ensure everything is ready
      setTimeout(() => {
        startNavigation();
      }, 800);
    }
  }, [destination, distance, estimatedTime, isNavigating]);

  // Audio feedback when destination is selected
  useEffect(() => {
    if (destination && distance !== null && estimatedTime !== null) {
      // Only speak if destination name actually changed
      if (destinationNameRef.current !== destination.name) {
        destinationNameRef.current = destination.name;
        const spokenName = getSpokenName(destination.name);
        const message = `Destination set to ${spokenName}. Distance is ${distance.toFixed(1)} kilometers. Estimated walking time is ${estimatedTime} minutes.`;
        speakText(message, 300);
      }
    }
  }, [destination?.name, distance, estimatedTime]);

  // Navigation instructions while navigating
  useEffect(() => {
    if (isNavigating && destination && distance !== null) {
      // Initial navigation instruction
      const direction = getDirectionIcon();
      const spokenName = getSpokenName(destination.name);
      const initialMessage = `Navigation started. Head ${direction} towards ${spokenName}. Distance remaining is ${distance.toFixed(1)} kilometers.`;
      speakText(initialMessage, 500);
      
      // Set up periodic navigation updates
      navigationIntervalRef.current = setInterval(() => {
        if (isNavigating && currentLocation && destination) {
          const currentDist = getDistanceToLocation(destination);
          
          // Update distance
          if (currentDist !== null) {
            setDistance(currentDist);
            const timeInMinutes = (currentDist / 5) * 60;
            setEstimatedTime(Math.round(timeInMinutes));
            
            // Speak distance updates at intervals
            const distKm = currentDist;
            const roundedDist = Math.round(distKm * 10) / 10; // Round to 0.1 km
            
            // Speak updates at key distances (only if distance changed significantly)
            if (lastSpokenDistanceRef.current === null || 
                Math.abs(lastSpokenDistanceRef.current - roundedDist) >= 0.2) {
              
              const direction = getDirectionIcon();
              const spokenName = getSpokenName(destination.name);
              let instruction = '';
              if (roundedDist < 0.1) {
                instruction = `You have arrived at ${spokenName}.`;
                setIsNavigating(false);
                if (navigationIntervalRef.current) {
                  clearInterval(navigationIntervalRef.current);
                  navigationIntervalRef.current = null;
                }
              } else if (roundedDist < 0.5) {
                instruction = `Continue straight. You are ${(roundedDist * 1000).toFixed(0)} meters away from ${spokenName}.`;
              } else {
                instruction = `Continue heading ${direction}. ${roundedDist.toFixed(1)} kilometers remaining. Estimated time ${Math.round(timeInMinutes)} minutes.`;
              }
              
              if (instruction) {
                speakText(instruction);
                lastSpokenDistanceRef.current = roundedDist;
              }
            }
          }
        }
      }, 10000); // Update every 10 seconds
      
      return () => {
        if (navigationIntervalRef.current) {
          clearInterval(navigationIntervalRef.current);
          navigationIntervalRef.current = null;
        }
        lastSpokenDistanceRef.current = null;
      };
    } else {
      // Clear interval when not navigating
      if (navigationIntervalRef.current) {
        clearInterval(navigationIntervalRef.current);
        navigationIntervalRef.current = null;
      }
      lastSpokenDistanceRef.current = null;
    }
  }, [isNavigating, destination, distance, currentLocation, getDistanceToLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNavigation = () => {
    if (!destination) {
      const message = 'Please select a destination first';
      speakText(message, 300);
      return;
    }
    setIsNavigating(true);
    const spokenName = getSpokenName(destination.name);
    const message = `Navigation started to ${spokenName}. Distance is ${distance?.toFixed(1)} kilometers. Estimated time is ${estimatedTime} minutes.`;
    speakText(message, 300);
    // Audio feedback handled by useEffect when isNavigating changes
  };

  const stopNavigation = () => {
    setIsNavigating(false);

    // Stop any ongoing speech (manual override regardless of priority)
    speechStop();

    const message = 'Navigation stopped';
    speakText(message, 300);

    // Clear navigation interval
    if (navigationIntervalRef.current) {
      clearInterval(navigationIntervalRef.current);
      navigationIntervalRef.current = null;
    }
    lastSpokenDistanceRef.current = null;
  };

  // Expose stopNavigation for voice command "stop navigation"
  useEffect(() => {
    if (stopNavigationRef) stopNavigationRef.current = stopNavigation;
    return () => {
      if (stopNavigationRef) stopNavigationRef.current = null;
    };
  }, [stopNavigationRef, stopNavigation]);

  const selectDestination = (location, name) => {
    setDestination({ ...location, name });
    // Audio feedback will be handled by useEffect when destination changes
  };

  // Compute the actual bearing (in degrees, 0 = north, clockwise) from
  // currentLocation to destination using the great-circle forward-azimuth
  // formula. Then map to one of 8 compass headings.
  const getDirectionIcon = () => {
    if (
      !currentLocation ||
      !destination ||
      typeof currentLocation.latitude !== 'number' ||
      typeof currentLocation.longitude !== 'number' ||
      typeof destination.latitude !== 'number' ||
      typeof destination.longitude !== 'number'
    ) {
      return 'north';
    }

    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;

    const lat1 = toRad(currentLocation.latitude);
    const lat2 = toRad(destination.latitude);
    const dLon = toRad(destination.longitude - currentLocation.longitude);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;

    const directions = [
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
      'north-west',
    ];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  };

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    header: {
      backgroundColor: theme.colors.surface,
      paddingTop: 50,
      paddingBottom: 20,
      paddingHorizontal: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: 4
    },
    destinationCard: {
      backgroundColor: theme.colors.card,
      margin: 16,
      padding: 20,
      borderRadius: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    destinationName: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text
    },
    destinationCoords: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    distanceText: {
      fontSize: 16,
      color: theme.colors.primary,
      fontWeight: '500'
    },
    timeText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    navigationCard: {
      backgroundColor: theme.colors.card,
      margin: 16,
      padding: 20,
      borderRadius: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    directionText: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: 8
    },
    instructionText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 4
    },
    statValue: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.primary
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 16
    },
    destinationOption: {
      backgroundColor: theme.colors.card,
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    destinationOptionText: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.colors.text
    },
    destinationOptionCoords: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    emptyState: {
      alignItems: 'center',
      padding: 40,
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    emptyStateText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: 16,
      textAlign: 'center'
    },
    emptyStateSubtext: {
      fontSize: 14,
      color: theme.colors.textTertiary,
      marginTop: 8,
      textAlign: 'center'
    },
    safetyCard: {
      backgroundColor: theme.colors.card,
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    safetyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text
    },
    safetyDescription: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    statusText: {
      fontSize: 12,
      color: theme.colors.textSecondary
    }
  });

  return (
    <>
      {isNavigating && CameraView && (
        <View style={{ position: 'absolute', left: -10000, width: 320, height: 240, overflow: 'hidden', zIndex: -1 }}>
          <CameraView
            ref={obstacleCameraRef}
            style={{ width: 320, height: 240 }}
            facing="back"
            onCameraReady={() => { obstacleCameraReadyRef.current = true; }}
          />
        </View>
      )}
      <ScrollView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.title}>Navigation</Text>
        <Text style={dynamicStyles.subtitle}>Choose your destination and start navigating</Text>
      </View>

      {destination && (
        <View style={dynamicStyles.destinationCard}>
          <View style={styles.destinationHeader}>
            <MaterialIcons name="place" size={24} color={theme.colors.primary} />
            <View style={styles.destinationInfo}>
              <Text style={dynamicStyles.destinationName}>{destination.name}</Text>
              <Text style={dynamicStyles.destinationCoords}>
                {destination.latitude?.toFixed(6)}, {destination.longitude?.toFixed(6)}
              </Text>
              {distance && (
                <View style={styles.routeInfo}>
                  <Text style={dynamicStyles.distanceText}>
                    Distance: {distance.toFixed(2)} km
                  </Text>
                  <Text style={dynamicStyles.timeText}>
                    Est. time: {estimatedTime} min walking
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          <TouchableOpacity
            style={[styles.navButton, isNavigating ? styles.stopButton : styles.startButton]}
            onPress={isNavigating ? stopNavigation : startNavigation}
          >
            <MaterialIcons 
              name={isNavigating ? "stop" : "navigation"} 
              size={24} 
              color="white" 
            />
            <Text style={styles.navButtonText}>
              {isNavigating ? 'Stop' : 'Start'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isNavigating && (
        <View style={dynamicStyles.navigationCard}>
          <View style={styles.directionInfo}>
            <MaterialIcons name={`keyboard-arrow-up`} size={48} color={theme.colors.primary} />
            <Text style={dynamicStyles.directionText}>Head {getDirectionIcon()}</Text>
            <Text style={dynamicStyles.instructionText}>Continue straight for 200m</Text>
          </View>
          
          <View style={styles.navigationStats}>
            <View style={styles.stat}>
              <Text style={dynamicStyles.statValue}>{distance?.toFixed(1)} km</Text>
              <Text style={dynamicStyles.statLabel}>Remaining</Text>
            </View>
            <View style={styles.stat}>
              <Text style={dynamicStyles.statValue}>{estimatedTime} min</Text>
              <Text style={dynamicStyles.statLabel}>ETA</Text>
            </View>
            <View style={styles.stat}>
              <Text style={dynamicStyles.statValue}>5.2</Text>
              <Text style={dynamicStyles.statLabel}>km/h</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.destinationsSection}>
        <Text style={dynamicStyles.sectionTitle}>Quick Destinations</Text>
        
        {savedLocations.home && (
          <TouchableOpacity
            style={dynamicStyles.destinationOption}
            onPress={() => selectDestination(savedLocations.home, 'Home')}
          >
            <MaterialIcons name="home" size={24} color="#4CAF50" />
            <View style={styles.destinationOptionInfo}>
              <Text style={dynamicStyles.destinationOptionText}>Home</Text>
              <Text style={dynamicStyles.destinationOptionCoords}>
                {savedLocations.home.latitude?.toFixed(4)}, {savedLocations.home.longitude?.toFixed(4)}
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}

        {savedLocations.office && (
          <TouchableOpacity
            style={dynamicStyles.destinationOption}
            onPress={() => selectDestination(savedLocations.office, 'Office')}
          >
            <MaterialIcons name="business" size={24} color="#2196F3" />
            <View style={styles.destinationOptionInfo}>
              <Text style={dynamicStyles.destinationOptionText}>Office</Text>
              <Text style={dynamicStyles.destinationOptionCoords}>
                {savedLocations.office.latitude?.toFixed(4)}, {savedLocations.office.longitude?.toFixed(4)}
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}

        {savedLocations.landmarks?.map((landmark, index) => (
          <TouchableOpacity
            key={index}
            style={dynamicStyles.destinationOption}
            onPress={() => selectDestination(landmark, landmark.name)}
          >
            <MaterialIcons name="place" size={24} color="#FF9800" />
            <View style={styles.destinationOptionInfo}>
              <Text style={dynamicStyles.destinationOptionText}>{landmark.name}</Text>
              <Text style={dynamicStyles.destinationOptionCoords}>
                {landmark.latitude?.toFixed(4)}, {landmark.longitude?.toFixed(4)}
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {(!savedLocations.home && !savedLocations.office && !savedLocations.landmarks?.length) && (
          <View style={dynamicStyles.emptyState}>
            <MaterialIcons name="location-off" size={48} color={theme.colors.textTertiary} />
            <Text style={dynamicStyles.emptyStateText}>No saved locations</Text>
            <Text style={dynamicStyles.emptyStateSubtext}>
              Add locations in the Locations tab to navigate to them
            </Text>
          </View>
        )}
      </View>

      <View style={styles.safetySection}>
        <Text style={dynamicStyles.sectionTitle}>Safety Features</Text>
        
        <View style={dynamicStyles.safetyCard}>
          <MaterialIcons name="warning" size={24} color="#FF9800" />
          <View style={styles.safetyInfo}>
            <Text style={dynamicStyles.safetyTitle}>Obstacle Detection</Text>
            <Text style={dynamicStyles.safetyDescription}>
              HC-SR04 sensor monitors path ahead
            </Text>
          </View>
          <View style={styles.safetyStatus}>
            <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={dynamicStyles.statusText}>Active</Text>
          </View>
        </View>

        <View style={dynamicStyles.safetyCard}>
          <MaterialIcons name="bluetooth" size={24} color="#2196F3" />
          <View style={styles.safetyInfo}>
            <Text style={dynamicStyles.safetyTitle}>Device Connection</Text>
            <Text style={dynamicStyles.safetyDescription}>
              Arduino sensors connected via Bluetooth
            </Text>
          </View>
          <View style={styles.safetyStatus}>
            <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={dynamicStyles.statusText}>Connected</Text>
          </View>
        </View>

        <View style={dynamicStyles.safetyCard}>
          <MaterialIcons name="emergency" size={24} color="#F44336" />
          <View style={styles.safetyInfo}>
            <Text style={dynamicStyles.safetyTitle}>Fall Detection</Text>
            <Text style={dynamicStyles.safetyDescription}>
              BMP280 monitors altitude changes
            </Text>
          </View>
          <View style={styles.safetyStatus}>
            <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={dynamicStyles.statusText}>Monitoring</Text>
          </View>
        </View>
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  destinationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  destinationInfo: {
    flex: 1,
    marginLeft: 12
  },
  routeInfo: {
    marginTop: 8
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8
  },
  startButton: {
    backgroundColor: '#4CAF50'
  },
  stopButton: {
    backgroundColor: '#F44336'
  },
  navButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8
  },
  directionInfo: {
    alignItems: 'center',
    marginBottom: 20
  },
  navigationStats: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  stat: {
    alignItems: 'center'
  },
  destinationsSection: {
    margin: 16
  },
  destinationOptionInfo: {
    flex: 1,
    marginLeft: 12
  },
  safetySection: {
    margin: 16
  },
  safetyInfo: {
    flex: 1,
    marginLeft: 12
  },
  safetyStatus: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  }
});