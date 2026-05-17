// Device Management: connect to JDY-31-SPP (Bluetooth Classic SPP) and read logs.
// Connection is owned by ArduinoContext so distance is available during Navigation.
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useArduino, isJDYOrArduino } from '../contexts/ArduinoContext';

export default function DeviceManagementScreen({ navigation }) {
  const theme = useTheme();
  const {
    btAvailable,
    scanning,
    devices,
    isConnected,
    logs,
    status,
    error,
    scan,
    connect,
    disconnect,
  } = useArduino();

  const startScan = useCallback(async () => {
    await scan();
  }, [scan]);

  const connectToDevice = useCallback(
    async (item) => {
      await connect(item);
    },
    [connect]
  );

  const dynamicStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
    title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
    status: { fontSize: 14, color: theme.colors.primary, marginBottom: 8 },
    error: { fontSize: 14, color: theme.colors.error || '#F44336', marginBottom: 8 },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
      marginBottom: 12,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { fontSize: 16, color: '#fff', fontWeight: '600', marginLeft: 8 },
    deviceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: theme.colors.card,
      borderRadius: 8,
      marginBottom: 8,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    deviceName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
    deviceId: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
    logContainer: {
      flex: 1,
      minHeight: 200,
      maxHeight: 280,
      backgroundColor: theme.isDark ? '#1a1a1a' : '#f5f5f5',
      borderRadius: 8,
      padding: 12,
      marginTop: 16,
    },
    logTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
    logLine: {
      fontSize: 12,
      color: theme.colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      marginBottom: 2,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
    notAvailable: { padding: 20, backgroundColor: theme.colors.card, borderRadius: 8, marginTop: 8 },
  });

  if (!btAvailable) {
    return (
      <ScrollView style={dynamicStyles.container}>
        <Text style={dynamicStyles.title}>Device Management</Text>
        <Text style={dynamicStyles.subtitle}>Connect to JDY-31-SPP (Arduino) over Bluetooth and read logs</Text>
        <View style={dynamicStyles.notAvailable}>
          <Text style={dynamicStyles.error}>
            Bluetooth Classic is not available. Install the dependency and rebuild:
          </Text>
          <Text style={dynamicStyles.logLine}>npm install react-native-bluetooth-classic</Text>
          <Text style={dynamicStyles.logLine}>npx expo prebuild && npx expo run:android</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      <Text style={dynamicStyles.title}>Device Management</Text>
      <Text style={dynamicStyles.subtitle}>Connect to JDY-31-SPP (Bluetooth SPP) and read serial logs. Distance is used during navigation.</Text>
      {isConnected ? (
        <Text style={[dynamicStyles.subtitle, { color: theme.colors.primary, marginBottom: 8 }]}>
          Connection stays active when you leave this screen. Logs and distance continue updating in the background.
        </Text>
      ) : null}

      {status ? <Text style={dynamicStyles.status}>{status}</Text> : null}
      {error ? <Text style={dynamicStyles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[dynamicStyles.button, (scanning || isConnected) && dynamicStyles.buttonDisabled]}
        onPress={startScan}
        disabled={scanning || isConnected}
      >
        {scanning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <MaterialIcons name="bluetooth-searching" size={24} color="#fff" />
        )}
        <Text style={dynamicStyles.buttonText}>
          {scanning ? 'Scanning...' : isConnected ? 'Connected' : 'Find JDY-31-SPP devices'}
        </Text>
      </TouchableOpacity>

      {isConnected ? (
        <TouchableOpacity
          style={[dynamicStyles.button, { backgroundColor: theme.colors.error || '#F44336' }]}
          onPress={disconnect}
        >
          <MaterialIcons name="link-off" size={24} color="#fff" />
          <Text style={dynamicStyles.buttonText}>Disconnect</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={dynamicStyles.sectionTitle}>Devices</Text>
      {devices.length === 0 && !scanning ? (
        <Text style={dynamicStyles.subtitle}>
          Tap "Find JDY-31-SPP devices" to list paired and nearby devices. Pair JDY-31-SPP in system Bluetooth first if needed.
        </Text>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(d) => d.address || d.id || String(Math.random())}
          style={{ maxHeight: 220 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                dynamicStyles.deviceCard,
                { borderLeftColor: isJDYOrArduino(item.name) ? '#4CAF50' : theme.colors.primary },
              ]}
              onPress={() => connectToDevice(item)}
              disabled={isConnected}
            >
              <View>
                <Text style={dynamicStyles.deviceName}>
                  {item.name} {isJDYOrArduino(item.name) ? '✓' : ''}
                </Text>
                <Text style={dynamicStyles.deviceId} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
              <MaterialIcons name="link" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        />
      )}

      <View style={dynamicStyles.logContainer}>
        <Text style={dynamicStyles.logTitle}>Device logs</Text>
        <ScrollView>
          {logs.length === 0 ? (
            <Text style={dynamicStyles.logLine}>No logs yet. Connect to JDY-31-SPP to stream serial output. Send distance (e.g. "15" or "Distance: 15 cm") for navigation alerts.</Text>
          ) : (
            logs.map((line, i) => (
              <Text key={i} style={dynamicStyles.logLine} numberOfLines={3}>
                {line}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}
