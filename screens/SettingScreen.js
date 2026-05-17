// src/screens/main/SettingsScreen.js
import { useState, useEffect } from 'react';
import {
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const defaultSettings = {
  voiceEnabled: true,
  emergencyAlerts: true,
  locationSharing: true,
  bluetoothAutoConnect: true,
  fallDetection: true,
  audioFeedback: true,
  vibrationAlerts: true,
  nightMode: false
};

export default function SettingsScreen({ navigation }) {
  const { userProfile, logout, updateProfile } = useAuth();
  const theme = useTheme();
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    if (userProfile?.settings) {
      setSettings({
        ...defaultSettings,
        ...userProfile.settings
      });
    }
  }, [userProfile]);

  const handleSettingChange = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    try {
      await updateProfile({ settings: newSettings });
    } catch (error) {
      console.error('Error updating settings:', error);
      setSettings(prev => ({ ...prev, [key]: !value }));
    }
  };

  const handleLogout = () => {
    logout();
  };

  const settingsOptions = [
    {
      title: 'Voice Commands',
      subtitle: 'Enable voice control features',
      key: 'voiceEnabled',
      icon: 'mic',
      color: '#4A90E2'
    },
    {
      title: 'Emergency Alerts',
      subtitle: 'Send alerts to emergency contacts',
      key: 'emergencyAlerts',
      icon: 'emergency',
      color: '#F44336'
    },
    {
      title: 'Location Sharing',
      subtitle: 'Share location with guardians',
      key: 'locationSharing',
      icon: 'location-on',
      color: '#4CAF50'
    },
    {
      title: 'Bluetooth Auto-Connect',
      subtitle: 'Automatically connect to Arduino device',
      key: 'bluetoothAutoConnect',
      icon: 'bluetooth',
      color: '#2196F3'
    },
    {
      title: 'Fall Detection',
      subtitle: 'Monitor for sudden altitude changes',
      key: 'fallDetection',
      icon: 'warning',
      color: '#FF9800'
    },
    {
      title: 'Audio Feedback',
      subtitle: 'Enable spoken navigation instructions',
      key: 'audioFeedback',
      icon: 'volume-up',
      color: '#9C27B0'
    },
    {
      title: 'Vibration Alerts',
      subtitle: 'Use vibration for notifications',
      key: 'vibrationAlerts',
      icon: 'vibration',
      color: '#607D8B'
    },
    {
      title: 'Night Mode',
      subtitle: 'Dark theme for better visibility',
      key: 'nightMode',
      icon: 'brightness-4',
      color: '#795548'
    }
  ];

  const menuOptions = [
    {
      title: 'Profile Information',
      subtitle: 'Edit personal details',
      icon: 'person',
      color: '#4A90E2',
      action: () => navigation.navigate('Profile')
    },
    {
      title: 'Emergency Contacts',
      subtitle: 'Manage emergency contact list',
      icon: 'contact-phone',
      color: '#F44336',
      action: () => {}
    },
    {
      title: 'Device Management',
      subtitle: 'Connect to Arduino via Bluetooth and read logs',
      icon: 'devices',
      color: '#4CAF50',
      action: () => navigation.navigate('DeviceManagement')
    },
    {
      title: 'Privacy & Security',
      subtitle: 'Data privacy and security settings',
      icon: 'security',
      color: '#FF9800',
      action: () => {}
    },
    {
      title: 'Help & Support',
      subtitle: 'Get help and contact support',
      icon: 'help',
      color: '#9C27B0',
      action: () => {}
    },
    {
      title: 'About',
      subtitle: 'App version and information',
      icon: 'info',
      color: '#607D8B',
      action: () => {}
    }
  ];

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: 20,
      paddingHorizontal: 16
    },
    header: {
      alignItems: 'center',
      marginBottom: 24
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
      paddingVertical: 16,
      paddingHorizontal: 20,
      backgroundColor: theme.colors.card,
      borderRadius: 8,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2
    },
    profileName: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    profileEmail: {
      fontSize: 14,
      color: theme.colors.textSecondary
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 12,
      color: theme.colors.text
    },
    settingCard: {
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
      elevation: 2
    },
    settingTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    settingSubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary
    },
    menuCard: {
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
      elevation: 2
    },
    menuTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    menuSubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary
    }
  });

  return (
    <ScrollView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.title}>Settings</Text>
        <Text style={dynamicStyles.subtitle}>Customize your app experience</Text>
      </View>

      <View style={dynamicStyles.profileCard}>
        <MaterialIcons name="account-circle" size={64} color={theme.colors.primary} />
        <View style={styles.profileInfo}>
          <Text style={dynamicStyles.profileName}>
            {userProfile?.firstName} {userProfile?.lastName}
          </Text>
          <Text style={dynamicStyles.profileEmail}>{userProfile?.email}</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          style={styles.editProfileButton}
        >
          <MaterialIcons name="edit" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={dynamicStyles.sectionTitle}>App Settings</Text>
        
        {settingsOptions.map((option, index) => (
          <View key={index} style={dynamicStyles.settingCard}>
            <MaterialIcons name={option.icon} size={24} color={option.color} />
            <View style={styles.settingInfo}>
              <Text style={dynamicStyles.settingTitle}>{option.title}</Text>
              <Text style={dynamicStyles.settingSubtitle}>{option.subtitle}</Text>
            </View>
            <Switch
              value={settings[option.key]}
              onValueChange={(value) => handleSettingChange(option.key, value)}
              trackColor={{ true: option.color, false: theme.colors.border }}
              thumbColor={settings[option.key] ? option.color : theme.colors.inputBackground}
            />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={dynamicStyles.sectionTitle}>Other Options</Text>
        
        {menuOptions.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={dynamicStyles.menuCard}
            onPress={option.action}
          >
            <MaterialIcons name={option.icon} size={24} color={option.color} />
            <View style={styles.menuInfo}>
              <Text style={dynamicStyles.menuTitle}>{option.title}</Text>
              <Text style={dynamicStyles.menuSubtitle}>{option.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileInfo: {
    marginLeft: 16
  },
  editProfileButton: {
    marginLeft: 'auto'
  },
  section: {
    marginBottom: 24
  },
  settingInfo: {
    marginLeft: 16,
    flex: 1
  },
  menuInfo: {
    marginLeft: 16,
    flex: 1
  },
  logoutButton: {
    paddingVertical: 16,
    backgroundColor: '#F44336',
    borderRadius: 8,
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    alignItems: 'center'
  },
  logoutButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold'
  }
});
