import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocationProvider } from './contexts/LocationContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ArduinoProvider } from './contexts/ArduinoContext';
import { NavigationControlProvider } from './contexts/NavigationControlContext';
import { VoiceCommandProvider } from './contexts/VoiceCommandContext';

const navigationRef = createNavigationContainerRef();

import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import ProfileScreen from './screens/ProfileScreen';

import HomeScreen from './screens/HomeScreen';
import LocationScreen from './screens/LocationScreen';
import NavigationScreen from './screens/NavigationScreen';
import SettingScreen from './screens/SettingScreen';
import VoiceCommandScreen from './screens/VoiceCommandScreen';
import ChatbotScreen from './screens/ChatbotScreen';
import ObjectDetectionScreen from './screens/ObjectDetectionScreen';
import DeviceManagementScreen from './screens/DeviceManagementScreen';
import ArduinoConnectionLostNotifier from './components/ArduinoConnectionLostNotifier';

const Stack = createStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  const theme = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '600',
          color: theme.colors.text,
        },
        cardStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Locations" component={LocationScreen} />
      <Stack.Screen name="Navigation" component={NavigationScreen} />
      <Stack.Screen name="Settings" component={SettingScreen} />
      <Stack.Screen name="VoiceCommand" component={VoiceCommandScreen} />
      <Stack.Screen name="Chatbot" component={ChatbotScreen} />
      <Stack.Screen name="ObjectDetection" component={ObjectDetectionScreen} />
      <Stack.Screen name="DeviceManagement" component={DeviceManagementScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { currentUser } = useAuth();

  return (
    <NavigationControlProvider>
      <NavigationContainer ref={navigationRef}>
        <VoiceCommandProvider navigationRef={navigationRef}>
          {currentUser ? <AppStack /> : <AuthStack />}
        </VoiceCommandProvider>
      </NavigationContainer>
    </NavigationControlProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LocationProvider>
          <ArduinoProvider>
            <ArduinoConnectionLostNotifier />
            <RootNavigator />
          </ArduinoProvider>
        </LocationProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
