import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { auth, firestore } from '../config/firebase';
import { setAudioFeedbackEnabled } from '../utils/speechManager';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Push the audioFeedback setting into the speech manager whenever it
  // changes. The speech manager is a plain JS module (no React state) so
  // every screen / context that calls speak() picks up the new value for
  // free, with no extra prop drilling.
  useEffect(() => {
    setAudioFeedbackEnabled(userProfile?.settings?.audioFeedback !== false);
  }, [userProfile?.settings?.audioFeedback]);

  const fetchUserProfile = async (uid) => {
    try {
      const userDocRef = doc(firestore, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
        const profileData = userDocSnap.data();
        if (profileData.dateOfBirth && profileData.dateOfBirth.toDate) {
          profileData.dateOfBirth = profileData.dateOfBirth.toDate();
        }
        setUserProfile(profileData);
        return profileData;
      } else {
        const userEmail = auth.currentUser?.email || currentUser?.email || '';
        const defaultProfile = {
          email: userEmail,
          firstName: '',
          lastName: '',
          phone: '',
          dateOfBirth: null,
          emergencyName: '',
          emergencyContact: '',
          medicalInfo: '',
          notes: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await setDoc(userDocRef, defaultProfile);
        setUserProfile(defaultProfile);
        return defaultProfile;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  };

  const signup = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDocRef = doc(firestore, 'users', user.uid);
      const defaultProfile = {
        email: email,
        firstName: '',
        lastName: '',
        phone: '',
        dateOfBirth: null,
        emergencyName: '',
        emergencyContact: '',
        medicalInfo: '',
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(userDocRef, defaultProfile);
      await fetchUserProfile(user.uid);
      
      return user;
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await fetchUserProfile(user.uid);
      return user;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const updateProfile = async (profileData) => {
    if (!currentUser) {
      throw new Error('No user is currently signed in');
    }

    try {
      const userDocRef = doc(firestore, 'users', currentUser.uid);
      
      const updateData = {
        ...profileData,
        updatedAt: serverTimestamp()
      };

      if (profileData.dateOfBirth instanceof Date) {
        updateData.dateOfBirth = Timestamp.fromDate(profileData.dateOfBirth);
      } else if (profileData.dateOfBirth === null) {
        updateData.dateOfBirth = null;
      }

      await updateDoc(userDocRef, updateData);
      await fetchUserProfile(currentUser.uid);
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          await fetchUserProfile(user.uid);
        } catch (error) {
          console.error('Error fetching profile on auth state change:', error);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    login,
    signup,
    logout,
    updateProfile,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

