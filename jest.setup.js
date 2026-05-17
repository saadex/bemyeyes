require('@testing-library/jest-native/extend-expect');

// Mock Firebase
jest.mock('./config/firebase', () => ({
  auth: {},
  firestore: {},
  app: {},
  serverTimestamp: jest.fn(() => ({ _seconds: Date.now() / 1000 })),
}));

// Mock TensorFlow / native modules that break in Node
jest.mock('@tensorflow/tfjs', () => ({}));
jest.mock('@tensorflow/tfjs-react-native', () => ({}));
jest.mock('react-native-fs', () => ({}));
