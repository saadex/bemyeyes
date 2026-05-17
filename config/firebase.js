// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore, serverTimestamp } from "firebase/firestore";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBxocAreb-ARpghCRIYFFCU-j8BqmYVEG4",
  authDomain: "bemyeyes-d1332.firebaseapp.com",
  projectId: "bemyeyes-d1332",
  storageBucket: "bemyeyes-d1332.firebasestorage.app",
  messagingSenderId: "1048849310706",
  appId: "1:1048849310706:web:bcf149422115cf09a6c16b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
const firestore = getFirestore(app);

export { app, auth, firestore, serverTimestamp };