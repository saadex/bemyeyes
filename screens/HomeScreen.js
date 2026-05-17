import { useEffect, useState } from 'react';
import {
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { useTheme } from '../contexts/ThemeContext';
import { auth, firestore } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { sendEmergencyAlert as sendEmergencyAlertToFirestore } from '../utils/emergencyAlert';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const { userProfile } = useAuth();
  const { location: currentLocation } = useLocation();
  const theme = useTheme();
  const [savedLocations, setSavedLocations] = useState({});
  const [greeting, setGreeting] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  useEffect(() => {
    const loadSavedLocations = async () => {
      if (!auth.currentUser) return;
      
      try {
        const userDocRef = doc(firestore, 'users', auth.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          const locations = {
            home: data.savedHome || null,
            office: data.savedOffice || null,
            landmarks: data.savedLandmarks || []
          };
          setSavedLocations(locations);
        }
      } catch (error) {
        console.error('Error loading saved locations:', error);
      }
    };

    loadSavedLocations();
  }, [auth.currentUser]);

  const quickActions = [
    {
      title: 'Go Home',
      icon: 'home',
      color: '#4CAF50',
      action: () => navigateToLocation('home')
    },
    {
      title: 'Go to Office',
      icon: 'business',
      color: '#2196F3',
      action: () => navigateToLocation('office')
    },
    {
      title: 'Object Detection',
      icon: 'photo-camera',
      color: '#00BCD4',
      action: () => navigation.navigate('ObjectDetection')
    },
    {
      title: 'Emergency',
      icon: 'emergency',
      color: '#F44336',
      action: () => handleEmergency()
    }
  ];

  const navigateToLocation = (locationType) => {
    if (!savedLocations[locationType]) {
      navigation.navigate('Locations');
      return;
    }
    navigation.navigate('Navigation', { destination: savedLocations[locationType] });
  };

  const handleEmergency = () => {
    if (!userProfile?.emergencyContact) {
      navigation.navigate('Profile');
      return;
    }
    sendEmergencyAlert();
  };

  const sendEmergencyAlert = async () => {
    if (!auth.currentUser || !currentLocation) return;

    setIsLoading(true);
    try {
      await sendEmergencyAlertToFirestore({
        userId: auth.currentUser.uid,
        currentLocation,
        userProfile,
        trigger: 'manual',
      });
    } catch (error) {
      console.error('Error sending emergency alert:', error);
    } finally {
      setIsLoading(false);
    }
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
    greeting: {
      fontSize: 16,
      color: theme.colors.textSecondary
    },
    userName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    settingsButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.inputBackground,
      marginRight: 12
    },
    statusCard: {
      backgroundColor: theme.colors.card,
      margin: 16,
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    statusText: {
      marginLeft: 12,
      fontSize: 14,
      color: theme.colors.textSecondary,
      flex: 1
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 16
    },
    quickActionCard: {
      backgroundColor: theme.colors.card,
      width: (width - 48) / 2,
      padding: 20,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 12,
      borderLeftWidth: 4,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    quickActionText: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.text,
      textAlign: 'center'
    },
    locationCard: {
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
    locationName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text
    },
    locationStatus: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    navigateButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.inputBackground
    },
    emergencyCard: {
      backgroundColor: theme.isDark ? '#2D1F1F' : '#fff5f5',
      margin: 16,
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      borderLeftWidth: 4,
      borderLeftColor: '#F44336'
    },
    emergencyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text
    },
    emergencyContact: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    emergencyButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.isDark ? '#3D2F2F' : '#fff0f0'
    }
  });

  return (
    <ScrollView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <View style={styles.headerContent}>
          <View style={styles.greetingContainer}>
            <Text style={dynamicStyles.greeting}>{greeting},</Text>
            <Text style={dynamicStyles.userName}>
              {userProfile?.firstName || 'User'}
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={dynamicStyles.settingsButton}
              onPress={() => navigation.navigate('Settings')}
              accessible={true}
              accessibilityLabel="Go to Settings"
            >
              <MaterialIcons name="settings" size={32} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => navigation.navigate('Profile')}
              accessible={true}
              accessibilityLabel="Go to Profile"
            >
              <MaterialIcons name="account-circle" size={64} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={dynamicStyles.statusCard}>
        <MaterialIcons 
          name={currentLocation ? "location-on" : "location-off"} 
          size={24} 
          color={currentLocation ? theme.colors.primary : theme.colors.error} 
        />
        <Text style={dynamicStyles.statusText}>
          {currentLocation 
            ? `Location: ${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`
            : 'Acquiring location...'
          }
        </Text>
      </View>

      <View style={styles.quickActionsContainer}>
        <Text style={dynamicStyles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={[
                dynamicStyles.quickActionCard, 
                { borderLeftColor: action.color },
                isLoading && action.title === 'Emergency' && styles.disabledCard
              ]}
              onPress={action.action}
              disabled={isLoading && action.title === 'Emergency'}
              accessible={true}
              accessibilityLabel={action.title}
            >
              <MaterialIcons name={action.icon} size={32} color={action.color} />
              <Text style={dynamicStyles.quickActionText}>
                {isLoading && action.title === 'Emergency' ? 'Sending...' : action.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.savedLocationsContainer}>
        <Text style={dynamicStyles.sectionTitle}>Saved Locations</Text>
        
        <View style={dynamicStyles.locationCard}>
          <MaterialIcons name="home" size={24} color="#4CAF50" />
          <View style={styles.locationInfo}>
            <Text style={dynamicStyles.locationName}>Home</Text>
            <Text style={dynamicStyles.locationStatus}>
              {savedLocations.home ? 'Set' : 'Not set'}
            </Text>
          </View>
          {savedLocations.home && (
            <TouchableOpacity
              onPress={() => navigateToLocation('home')}
              style={dynamicStyles.navigateButton}
            >
              <MaterialIcons name="navigation" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={dynamicStyles.locationCard}>
          <MaterialIcons name="business" size={24} color="#2196F3" />
          <View style={styles.locationInfo}>
            <Text style={dynamicStyles.locationName}>Office</Text>
            <Text style={dynamicStyles.locationStatus}>
              {savedLocations.office ? 'Set' : 'Not set'}
            </Text>
          </View>
          {savedLocations.office && (
            <TouchableOpacity
              onPress={() => navigateToLocation('office')}
              style={dynamicStyles.navigateButton}
            >
              <MaterialIcons name="navigation" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={dynamicStyles.locationCard}>
          <MaterialIcons name="place" size={24} color="#FF9800" />
          <View style={styles.locationInfo}>
            <Text style={dynamicStyles.locationName}>Landmarks</Text>
            <Text style={dynamicStyles.locationStatus}>
              {savedLocations.landmarks?.length || 0} saved
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Locations')}
            style={dynamicStyles.navigateButton}
          >
            <MaterialIcons name="arrow-forward" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={dynamicStyles.emergencyCard}>
        <MaterialIcons name="emergency" size={24} color="#F44336" />
        <View style={styles.emergencyInfo}>
          <Text style={dynamicStyles.emergencyTitle}>Emergency Contact</Text>
          <Text style={dynamicStyles.emergencyContact}>
            {userProfile?.emergencyName ? 
              `${userProfile.emergencyName} - ${userProfile.emergencyContact}` : 
              'Not set'
            }
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            if (userProfile?.emergencyContact) {
              handleEmergency();
            } else {
              navigation.navigate('Profile');
            }
          }}
          style={dynamicStyles.emergencyButton}
        >
          <MaterialIcons 
            name={userProfile?.emergencyContact ? "phone" : "person-add"} 
            size={20} 
            color="#F44336" 
          />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  greetingContainer: {
    flex: 1
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  profileButton: {
    padding: 4
  },
  quickActionsContainer: {
    margin: 16
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  disabledCard: {
    opacity: 0.6
  },
  savedLocationsContainer: {
    margin: 16
  },
  locationInfo: {
    flex: 1,
    marginLeft: 12
  },
  emergencyInfo: {
    flex: 1,
    marginLeft: 12
  }
});