import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';
import { GLView } from 'expo-gl';
import Expo2DContext from 'expo-2d-context';
import * as tf from '@tensorflow/tfjs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import { preprocess } from '../utils/objectDetection/preprocess';
import { renderBoxes } from '../utils/objectDetection/renderBox';

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default function ObjectDetectionCameraView({ type, model, inputTensorSize, config, children }) {
  const [ctx, setCtx] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef(null);
  const mountedRef = useRef(true);
  const rafIdRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraReady || !ctx || !model || !inputTensorSize || inputTensorSize.length < 4) return;
    if (!cameraRef.current) return;

    let cancelled = false;
    const detectFrame = async () => {
      if (!mountedRef.current || cancelled || !model || !ctx || !cameraRef.current) return;

      tf.engine().startScope();
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.4,
          base64: true,
          skipProcessing: true,
        });
        if (!mountedRef.current || !photo?.base64) return;

        const imageBytes = base64ToUint8Array(photo.base64);
        const imageTensor = decodeJpeg(imageBytes, 3);
        if (!mountedRef.current) {
          tf.dispose(imageTensor);
          return;
        }

        const [input, xRatio, yRatio] = preprocess(
          imageTensor,
          inputTensorSize[2],
          inputTensorSize[1]
        );
        tf.dispose(imageTensor);

        const res = await model.executeAsync(input);
        if (!mountedRef.current) {
          tf.dispose([input, res]);
          return;
        }
        const boxes = res[0];
        const scores = res[1];
        const classes = res[2];
        const boxes_data = boxes.dataSync();
        const scores_data = scores.dataSync();
        const classes_data = classes.dataSync();
        await renderBoxes(ctx, config.threshold, boxes_data, scores_data, classes_data, [xRatio, yRatio], type === 'front');
        tf.dispose([boxes, scores, classes, input]);
      } catch (e) {
        // ignore frame errors
      } finally {
        tf.engine().endScope();
      }

      if (!mountedRef.current || cancelled) return;
      rafIdRef.current = requestAnimationFrame(detectFrame);
    };

    detectFrame();
    return () => {
      cancelled = true;
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [cameraReady, ctx, model, inputTensorSize, config.threshold, type]);

  if (!inputTensorSize || inputTensorSize.length < 4) return null;

  return (
    <>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={type === 'front' ? 'front' : 'back'}
        onCameraReady={() => setCameraReady(true)}
      />
      <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
        <GLView
          style={StyleSheet.absoluteFill}
          onContextCreate={async (gl) => {
            const ctx2d = new Expo2DContext(gl);
            await ctx2d.initializeText();
            setCtx(ctx2d);
          }}
        />
      </View>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 10,
  },
});
