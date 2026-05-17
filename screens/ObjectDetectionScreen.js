import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { Camera } from 'expo-camera';
import { modelURI } from '../utils/objectDetection/modelHandler';
import ObjectDetectionCameraView from '../components/ObjectDetectionCameraView';
import { useTheme } from '../contexts/ThemeContext';

const CameraTypeBack = (Camera?.Constants?.Type?.back !== undefined) ? Camera.Constants.Type.back : 'back';
const CameraTypeFront = (Camera?.Constants?.Type?.front !== undefined) ? Camera.Constants.Type.front : 'front';

export default function ObjectDetectionScreen({ navigation }) {
  const theme = useTheme();
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraType, setCameraType] = useState(CameraTypeBack);
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState({ loading: true, progress: 0 });
  const [inputTensor, setInputTensor] = useState([]);
  const [error, setError] = useState(null);

  const config = { threshold: 0.25 };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!Camera || typeof Camera.requestCameraPermissionsAsync !== 'function') {
          setError('Camera native module not found. Rebuild the app: npx expo run:android');
          setLoading({ loading: false, progress: 0 });
          return;
        }
        const { status } = await Camera.requestCameraPermissionsAsync();
        if (cancelled) return;
        setHasPermission(status === 'granted');
        if (status !== 'granted') return;

        await tf.ready();
        if (cancelled) return;
        await tf.setBackend('rn-webgl');
        if (cancelled) return;

        const yolov5 = await tf.loadGraphModel(modelURI, {
          onProgress: (fractions) => {
            if (!cancelled) setLoading({ loading: true, progress: fractions });
          },
        });
        if (cancelled) return;

        const shape = yolov5.inputs[0].shape.map((s) => s || 1);
        const dummyInput = tf.ones(shape);
        await yolov5.executeAsync(dummyInput);
        tf.dispose(dummyInput);
        if (cancelled) return;

        setInputTensor(yolov5.inputs[0].shape);
        setModel(yolov5);
        setLoading({ loading: false, progress: 1 });
      } catch (e) {
        if (!cancelled) {
          const msg = e?.message || String(e);
          const isNativeModuleError = msg.includes('ExpoCamera') || msg.includes('native module') || msg.includes('Cannot find native');
          setError(isNativeModuleError
            ? 'Camera is not available in this build. Rebuild the app with: npx expo run:android'
            : msg);
          setLoading({ loading: false, progress: 0 });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dynamicStyles = {
    container: { backgroundColor: theme.colors.background },
    text: { color: theme.colors.text },
    button: { borderColor: theme.colors.text },
    buttonText: { color: theme.colors.text },
  };

  if (!Camera || typeof Camera.requestCameraPermissionsAsync !== 'function') {
    return (
      <View style={[styles.center, dynamicStyles.container]}>
        <MaterialIcons name="camera-alt" size={48} color={theme.colors.text} />
        <Text style={[styles.message, dynamicStyles.text]}>
          Camera module is not available in this build.
        </Text>
        <Text style={[styles.message, dynamicStyles.text, { marginTop: 8 }]}>
          Rebuild the app with: npx expo run:android
        </Text>
        <TouchableOpacity
          style={[styles.button, dynamicStyles.button, { marginTop: 24 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={dynamicStyles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasPermission === null) {
    return (
      <View style={[styles.center, dynamicStyles.container]}>
        <Text style={[styles.message, dynamicStyles.text]}>Requesting camera permission...</Text>
      </View>
    );
  }
  if (hasPermission === false) {
    return (
      <View style={[styles.center, dynamicStyles.container]}>
        <Text style={[styles.message, dynamicStyles.text]}>Camera permission is required for object detection.</Text>
        <TouchableOpacity
          style={[styles.button, dynamicStyles.button]}
          onPress={() => navigation.goBack()}
        >
          <Text style={dynamicStyles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, dynamicStyles.container]}>
        <MaterialIcons name="error-outline" size={48} color={theme.colors.error || '#F44336'} />
        <Text style={[styles.message, dynamicStyles.text]}>{error}</Text>
        <TouchableOpacity
          style={[styles.button, dynamicStyles.button]}
          onPress={() => navigation.goBack()}
        >
          <Text style={dynamicStyles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading.loading || !model || inputTensor.length === 0) {
    return (
      <View style={[styles.center, dynamicStyles.container]}>
        <ActivityIndicator size="large" color={theme.colors.primary || '#2196F3'} />
        <Text style={[styles.message, dynamicStyles.text]}>
          Loading model... {(loading.progress * 100).toFixed(0)}%
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, dynamicStyles.container]}>
      <ObjectDetectionCameraView
        type={cameraType === CameraTypeFront ? 'front' : 'back'}
        model={model}
        inputTensorSize={inputTensor}
        config={config}
      >
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.flipButton, dynamicStyles.button]}
            onPress={() =>
              setCameraType((t) =>
                t === CameraTypeBack ? CameraTypeFront : CameraTypeBack
              )
            }
          >
            <MaterialIcons name="flip-camera-ios" size={28} color="#fff" />
            <Text style={styles.flipButtonText}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      </ObjectDetectionCameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, textAlign: 'center', marginVertical: 12 },
  button: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderRadius: 8,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: 40,
  },
  flipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  flipButtonText: { color: '#fff', marginLeft: 8, fontSize: 16 },
});
