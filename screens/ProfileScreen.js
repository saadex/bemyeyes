import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

export default function ProfileScreen({ navigation }) {
  const { userProfile, updateProfile } = useAuth();
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formData, setFormData] = useState({
    firstName: userProfile?.firstName || '',
    lastName: userProfile?.lastName || '',
    phone: userProfile?.phone || '',
    dateOfBirth: userProfile?.dateOfBirth || null,
    emergencyName: userProfile?.emergencyName || '',
    emergencyContact: userProfile?.emergencyContact || '',
    medicalInfo: userProfile?.medicalInfo || '',
    notes: userProfile?.notes || ''
  });

  const handleSave = async () => {
    try {
      await updateProfile(formData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile', error);
    }
  };

  const handleCancel = () => {
    setFormData({
      firstName: userProfile?.firstName || '',
      lastName: userProfile?.lastName || '',
      phone: userProfile?.phone || '',
      dateOfBirth: userProfile?.dateOfBirth || null,
      emergencyName: userProfile?.emergencyName || '',
      emergencyContact: userProfile?.emergencyContact || '',
      medicalInfo: userProfile?.medicalInfo || '',
      notes: userProfile?.notes || ''
    });
    setIsEditing(false);
  };

  const updateFormData = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const formatDate = (date) => {
    if (!date) return 'Not set';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString();
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      flex: 1,
      textAlign: 'center'
    },
    profileImageSection: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      paddingVertical: 30,
      marginBottom: 16
    },
    profileName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 4
    },
    profileEmail: {
      fontSize: 16,
      color: theme.colors.textSecondary
    },
    section: {
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
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 16
    },
    inputLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 6,
      fontWeight: '500'
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.text
    },
    inputDisabled: {
      backgroundColor: theme.colors.inputBackground,
      borderColor: theme.colors.border,
      opacity: 0.6
    },
    dateText: {
      fontSize: 16,
      color: theme.colors.text
    },
    placeholderText: {
      color: theme.colors.textTertiary
    },
    textArea: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.text,
      textAlignVertical: 'top',
      minHeight: 80
    },
    cancelButton: {
      backgroundColor: theme.colors.inputBackground
    },
    cancelButtonText: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '600'
    }
  });

  return (
    <KeyboardAvoidingView 
      style={dynamicStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView>
        <View style={dynamicStyles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <MaterialIcons name="arrow-back" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <Text style={dynamicStyles.title}>Profile</Text>
          <TouchableOpacity 
            onPress={isEditing ? handleSave : () => setIsEditing(true)}
            style={styles.actionButton}
          >
            <MaterialIcons name={isEditing ? "check" : "edit"} size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={dynamicStyles.profileImageSection}>
          <View style={styles.profileImageContainer}>
            <MaterialIcons name="account-circle" size={120} color={theme.colors.primary} />
            {isEditing && (
              <TouchableOpacity style={styles.editImageButton}>
                <MaterialIcons name="camera-alt" size={20} color="white" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={dynamicStyles.profileName}>
            {formData.firstName} {formData.lastName}
          </Text>
          <Text style={dynamicStyles.profileEmail}>{userProfile?.email}</Text>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Personal Information</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={dynamicStyles.inputLabel}>First Name</Text>
              <TextInput
                style={[dynamicStyles.input, !isEditing && dynamicStyles.inputDisabled]}
                value={formData.firstName}
                onChangeText={(text) => updateFormData('firstName', text)}
                editable={isEditing}
                placeholder="First Name"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={dynamicStyles.inputLabel}>Last Name</Text>
              <TextInput
                style={[dynamicStyles.input, !isEditing && dynamicStyles.inputDisabled]}
                value={formData.lastName}
                onChangeText={(text) => updateFormData('lastName', text)}
                editable={isEditing}
                placeholder="Last Name"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>Phone Number</Text>
            <TextInput
              style={[dynamicStyles.input, !isEditing && dynamicStyles.inputDisabled]}
              value={formData.phone}
              onChangeText={(text) => updateFormData('phone', text)}
              editable={isEditing}
              placeholder="Phone Number"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>Date of Birth</Text>
            <TouchableOpacity
              style={[dynamicStyles.input, styles.dateInput, !isEditing && dynamicStyles.inputDisabled]}
              onPress={isEditing ? () => setShowDatePicker(true) : null}
              disabled={!isEditing}
            >
              <Text style={[dynamicStyles.dateText, !formData.dateOfBirth && dynamicStyles.placeholderText]}>
                {formatDate(formData.dateOfBirth)}
              </Text>
              {isEditing && <MaterialIcons name="calendar-today" size={20} color={theme.colors.textSecondary} />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Emergency Contact</Text>
          
          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>Contact Name</Text>
            <TextInput
              style={[dynamicStyles.input, !isEditing && dynamicStyles.inputDisabled]}
              value={formData.emergencyName}
              onChangeText={(text) => updateFormData('emergencyName', text)}
              editable={isEditing}
              placeholder="Emergency Contact Name"
              placeholderTextColor={theme.colors.textTertiary}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>Contact Number</Text>
            <TextInput
              style={[dynamicStyles.input, !isEditing && dynamicStyles.inputDisabled]}
              value={formData.emergencyContact}
              onChangeText={(text) => updateFormData('emergencyContact', text)}
              editable={isEditing}
              placeholder="Emergency Contact Number"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Additional Information</Text>
          
          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>Medical Information</Text>
            <TextInput
              style={[dynamicStyles.textArea, !isEditing && dynamicStyles.inputDisabled]}
              value={formData.medicalInfo}
              onChangeText={(text) => updateFormData('medicalInfo', text)}
              editable={isEditing}
              placeholder="Any medical conditions, allergies, or important health information"
              placeholderTextColor={theme.colors.textTertiary}
              multiline={true}
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={dynamicStyles.inputLabel}>Notes</Text>
            <TextInput
              style={[dynamicStyles.textArea, !isEditing && dynamicStyles.inputDisabled]}
              value={formData.notes}
              onChangeText={(text) => updateFormData('notes', text)}
              editable={isEditing}
              placeholder="Additional notes or instructions"
              placeholderTextColor={theme.colors.textTertiary}
              multiline={true}
              numberOfLines={3}
            />
          </View>
        </View>

        {isEditing && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.button, dynamicStyles.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={dynamicStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        )}

        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          onConfirm={(date) => {
            updateFormData('dateOfBirth', date);
            setShowDatePicker(false);
          }}
          onCancel={() => setShowDatePicker(false)}
          maximumDate={new Date()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    padding: 4
  },
  actionButton: {
    padding: 4
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 16
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4A90E2',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  halfWidth: {
    width: '48%'
  },
  inputContainer: {
    marginBottom: 16
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 16,
    marginBottom: 30
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4
  },
  saveButton: {
    backgroundColor: '#4A90E2'
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  }
});
