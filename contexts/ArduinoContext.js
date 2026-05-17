import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * ArduinoContext owns the Bluetooth (JDY-31-SPP) connection at app level.
 * Connection and data reception stay active when the user leaves the Device Management
 * screen; logs and arduinoDistanceCm keep updating in the background until disconnect() is called.
 */

/**
 * Parses distance in cm from a line of Arduino serial output.
 * Handles: "Distance: 15", "15", "15.2", "distance=12.5", "15cm", etc.
 */
export function parseDistanceFromLine(line) {
  if (!line || typeof line !== 'string') return null;
  const trimmed = line.trim();
  const distanceMatch = trimmed.match(/distance[:\s=]+(\d+(?:\.\d+)?)\s*(cm)?/i);
  if (distanceMatch) return parseFloat(distanceMatch[1]);
  const numOnly = trimmed.match(/^(\d+(?:\.\d+)?)\s*(cm)?$/i);
  if (numOnly) return parseFloat(numOnly[1]);
  const anyNum = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (anyNum) return parseFloat(anyNum[1]);
  return null;
}

const CONNECTION_LOST_MESSAGE = 'Arduino connection lost. Please reconnect from Device Management.';
const READ_FAILURES_BEFORE_LOST = 6; // ~3s at 500ms interval

const ArduinoContext = createContext({
  arduinoDistanceCm: null,
  isConnected: false,
  connectionLostReason: null,
  clearConnectionLostReason: () => {},
  logs: [],
  setLogs: () => {},
  devices: [],
  scanning: false,
  status: '',
  error: '',
  scan: async () => {},
  connect: async () => {},
  disconnect: () => {},
  requestPermissions: async () => true,
});

let RNBluetoothClassic = null;
try {
  RNBluetoothClassic = require('react-native-bluetooth-classic').default;
} catch (_) {}

const JDY_NAME_PATTERNS = ['jdy', 'jdy-31', 'spp', 'hc-05', 'hc-06', 'arduino', 'bluetooth'];

/** Max log lines to keep in memory so connection can run indefinitely when screen is not visible. */
const MAX_LOG_LINES = 1000;

export function isJDYOrArduino(name) {
  if (!name) return false;
  return JDY_NAME_PATTERNS.some((p) => String(name).toLowerCase().includes(p));
}

export const ArduinoProvider = ({ children }) => {
  const [arduinoDistanceCm, setArduinoDistanceCm] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLostReason, setConnectionLostReason] = useState(null);
  const [logs, setLogs] = useState([]);
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const dataSubscriptionRef = useRef(null);
  const readPollIntervalRef = useRef(null);
  const deviceRef = useRef(null);
  const readFailureCountRef = useRef(0);

  const requestPermissions = useCallback(async () => {
    if (typeof require === 'undefined') return true;
    const { Platform, PermissionsAndroid } = require('react-native');
    if (Platform.OS !== 'android') return true;
    try {
      const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 31;
      if (apiLevel >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
        );
      }
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (_) {
      return false;
    }
  }, []);

  const appendAndParseDistance = useCallback((text) => {
    if (!text || typeof text !== 'string') return;
    const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setLogs((prev) => {
      const next = [...prev, ...lines];
      if (next.length > MAX_LOG_LINES) return next.slice(-MAX_LOG_LINES);
      return next;
    });
    for (const line of lines) {
      const cm = parseDistanceFromLine(line);
      if (cm != null && !Number.isNaN(cm)) {
        setArduinoDistanceCm(cm);
        break;
      }
    }
  }, []);

  const clearConnectionLostReason = useCallback(() => {
    setConnectionLostReason(null);
  }, []);

  const cleanupConnection = useCallback((disconnectDevice = true) => {
    if (readPollIntervalRef.current) {
      clearInterval(readPollIntervalRef.current);
      readPollIntervalRef.current = null;
    }
    if (dataSubscriptionRef.current) {
      dataSubscriptionRef.current.remove();
      dataSubscriptionRef.current = null;
    }
    const dev = deviceRef.current;
    if (disconnectDevice && dev && dev.disconnect) {
      dev.disconnect().catch(() => {});
    }
    deviceRef.current = null;
    readFailureCountRef.current = 0;
    setArduinoDistanceCm(null);
    setIsConnected(false);
  }, []);

  const disconnect = useCallback(() => {
    cleanupConnection(true);
    setConnectionLostReason(null);
    setLogs((prev) => [...prev, '[Disconnected]']);
    setStatus('Disconnected.');
  }, [cleanupConnection]);

  const handleConnectionLost = useCallback(() => {
    cleanupConnection(false);
    setConnectionLostReason(CONNECTION_LOST_MESSAGE);
    setStatus('Connection lost.');
    setLogs((prev) => [...prev, '[Connection lost]']);
  }, [cleanupConnection]);

  const connect = useCallback(
    async (item) => {
      if (!RNBluetoothClassic || deviceRef.current) return false;
      setError('');
      setStatus(`Connecting to ${item.name}...`);
      try {
        const device = item;
        await device.connect({
          CONNECTION_TYPE: 'delimited',
          DELIMITER: '',
          DEVICE_CHARSET: require('react-native').Platform.OS === 'android' ? 'utf-8' : undefined,
          READ_SIZE: 512,
        });
        deviceRef.current = device;
        setIsConnected(true);
        setConnectionLostReason(null);
        setStatus('Connected. Reading logs...');
        setLogs((prev) => [...prev, `[Connected] ${item.name} (${item.address})`]);

        dataSubscriptionRef.current = device.onDataReceived((event) => {
          const data = event?.data ?? event?.message ?? (typeof event === 'string' ? event : '');
          appendAndParseDistance(data);
        });

        readPollIntervalRef.current = setInterval(async () => {
          try {
            const dev = deviceRef.current;
            if (!dev || !dev.read) return;
            const msg = await dev.read();
            readFailureCountRef.current = 0;
            const data = typeof msg === 'string' ? msg : (msg?.data ?? msg?.message ?? '');
            appendAndParseDistance(data);
          } catch (_) {
            readFailureCountRef.current = (readFailureCountRef.current || 0) + 1;
            if (readFailureCountRef.current >= READ_FAILURES_BEFORE_LOST) {
              handleConnectionLost();
            }
          }
        }, 500);
        return true;
      } catch (e) {
        setError(e?.message || String(e));
        setStatus('Connection failed.');
        deviceRef.current = null;
        setIsConnected(false);
        return false;
      }
    },
    [appendAndParseDistance, handleConnectionLost]
  );

  const scan = useCallback(async () => {
    if (!RNBluetoothClassic) {
      setError('Bluetooth Classic not available.');
      return [];
    }
    const ok = await requestPermissions();
    if (!ok) {
      setError('Bluetooth and location permissions required.');
      return [];
    }
    setError('');
    setStatus('Scanning...');
    setScanning(true);
    setDevices([]);
    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) {
        setStatus('Bluetooth is off.');
        return [];
      }
      const bonded = await RNBluetoothClassic.getBondedDevices();
      const bondedList = Array.isArray(bonded) ? bonded : [];
      const byAddress = new Map();
      bondedList.forEach((d) => {
        const addr = d.address || d.id;
        if (addr) byAddress.set(addr, { ...d, name: d.name || 'Unknown', address: addr });
      });
      let discovered = [];
      try {
        discovered = await RNBluetoothClassic.startDiscovery();
      } catch (_) {}
      const discoveredList = Array.isArray(discovered) ? discovered : [];
      discoveredList.forEach((d) => {
        const addr = d.address || d.id;
        if (addr && !byAddress.has(addr)) byAddress.set(addr, { ...d, name: d.name || 'Unknown', address: addr });
      });
      const list = Array.from(byAddress.values());
      setDevices(list);
      setStatus(list.length ? `Found ${list.length} device(s).` : 'No devices found.');
      return list;
    } catch (e) {
      setError(e?.message || String(e));
      return [];
    } finally {
      setScanning(false);
    }
  }, [requestPermissions]);

  return (
    <ArduinoContext.Provider
      value={{
        arduinoDistanceCm,
        isConnected,
        connectionLostReason,
        clearConnectionLostReason,
        logs,
        setLogs,
        devices,
        scanning,
        status,
        error,
        setStatus,
        setError,
        scan,
        connect,
        disconnect,
        requestPermissions,
        btAvailable: !!RNBluetoothClassic,
      }}
    >
      {children}
    </ArduinoContext.Provider>
  );
};

export const useArduino = () => useContext(ArduinoContext);
