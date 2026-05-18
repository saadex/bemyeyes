import React, { createContext, useState, useEffect, useContext } from 'react';
import * as Location from 'expo-location';
import { auth, firestore } from '../config/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

const LocationContext = createContext({
  location: null,
  currentLocation: null,
  errorMsg: null,
  isFetching: false,
  savedLocations: { home: null, office: null, landmarks: [] },
  getLocation: () => {},
  saveLocation: async () => {},
  getSavedLocationsAsync: async () => null,
  getDistanceToLocation: () => null,
});

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [savedLocations, setSavedLocations] = useState({
    home: null,
    office: null,
    landmarks: []
  });

  const getLocation = async () => {
    try {
      setIsFetching(true);

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        setIsFetching(false);
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
      setErrorMsg(null);
    } catch (error) {
      console.error('Error getting location:', error);
      setErrorMsg('Error retrieving location');
    } finally {
      setIsFetching(false);
    }
  };

  const saveLocation = async (type, name, customLocation = null) => {
    if (!auth.currentUser) return;

    let locationToSave = customLocation || location;
    if (!locationToSave) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        locationToSave = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setLocation(locationToSave);
      } catch (_) {
        return;
      }
    }
    if (!locationToSave) return;

    try {
      const uid = auth.currentUser.uid;
      const userDocRef = doc(firestore, 'users', uid);

      if (type === 'landmark') {
        // Landmarks live in a sub-collection: users/{uid}/landmarks/{auto-id}.
        // Each landmark is its own document, so serverTimestamp() is legal
        // (Firestore disallows it inside arrays — see git history for why this
        // structure replaced the previous savedLandmarks: [] array).
        const landmarksColRef = collection(firestore, 'users', uid, 'landmarks');
        await addDoc(landmarksColRef, {
          ...locationToSave,
          name,
          timestamp: serverTimestamp(),
        });
        // Best-effort bump of updatedAt on the parent for activity tracking.
        try {
          await updateDoc(userDocRef, { updatedAt: serverTimestamp() });
        } catch (_) {}
      } else {
        // home / office stay as nested maps on the parent user doc —
        // serverTimestamp() inside a top-level nested map is allowed.
        const locationData = {
          ...locationToSave,
          name,
          timestamp: serverTimestamp(),
        };
        const updateData = { updatedAt: serverTimestamp() };
        if (type === 'home') updateData.savedHome = locationData;
        else if (type === 'office') updateData.savedOffice = locationData;
        await updateDoc(userDocRef, updateData);
      }

      await loadSavedLocations();
    } catch (error) {
      console.error('Error saving location:', error);
      throw error;
    }
  };

  const getDistanceToLocation = (destination) => {
    if (!location || !destination) return null;

    const R = 6371; 
    const dLat = (destination.latitude - location.latitude) * Math.PI / 180;
    const dLon = (destination.longitude - location.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(location.latitude * Math.PI / 180) * 
      Math.cos(destination.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    return distance;
  };

  const isValidLocation = (loc) => {
    return loc &&
           typeof loc.latitude === 'number' &&
           typeof loc.longitude === 'number' &&
           !isNaN(loc.latitude) &&
           !isNaN(loc.longitude);
  };

  /** Returns current saved locations from Firestore (avoids stale state). */
  const getSavedLocationsAsync = async () => {
    if (!auth.currentUser) return null;
    try {
      const uid = auth.currentUser.uid;
      const userDocRef = doc(firestore, 'users', uid);

      // Read the parent doc + the landmarks sub-collection in parallel.
      // No orderBy here: an offline addDoc resolves with a pending
      // serverTimestamp, and orderBy on that field would temporarily exclude
      // the doc. Cheaper and more robust to sort client-side.
      const landmarksColRef = collection(firestore, 'users', uid, 'landmarks');
      const [userDocSnap, landmarksSnap] = await Promise.all([
        getDoc(userDocRef),
        getDocs(landmarksColRef).catch(() => null),
      ]);

      if (!userDocSnap.exists()) return null;
      const data = userDocSnap.data();

      // New canonical source: per-document sub-collection entries.
      const subCollectionLandmarks = landmarksSnap
        ? landmarksSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((loc) => isValidLocation(loc))
            .sort((a, b) => {
              // Sort oldest -> newest. timestamp may be null briefly for
              // freshly-written docs whose server resolve hasn't returned.
              const ta = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
              const tb = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
              return ta - tb;
            })
        : [];

      // Backward compat: also include any landmarks still living in the old
      // savedLandmarks array on the parent doc. New writes go to the sub-
      // collection, so this list only matters for users with legacy data.
      const legacyLandmarks = Array.isArray(data.savedLandmarks)
        ? data.savedLandmarks.filter((loc) => isValidLocation(loc))
        : [];

      return {
        home: data.savedHome && isValidLocation(data.savedHome) ? data.savedHome : null,
        office: data.savedOffice && isValidLocation(data.savedOffice) ? data.savedOffice : null,
        landmarks: [...legacyLandmarks, ...subCollectionLandmarks],
      };
    } catch (error) {
      console.error('Error fetching saved locations:', error);
      return null;
    }
  };

  const loadSavedLocations = async () => {
    if (!auth.currentUser) return;

    try {
      const next = await getSavedLocationsAsync();
      if (next) {
        setSavedLocations(next);
        console.log('Loaded saved locations:', { home: !!next.home, office: !!next.office, landmarksCount: next.landmarks.length });
      }
    } catch (error) {
      console.error('Error loading saved locations:', error);
    }
  };

  useEffect(() => {
    getLocation();
  }, []);

  useEffect(() => {
    if (auth.currentUser) {
      loadSavedLocations();
    }
  }, [auth.currentUser]);

  return (
    <LocationContext.Provider
      value={{
        location,
        currentLocation: location,
        errorMsg,
        isFetching,
        savedLocations,
        getLocation,
        saveLocation,
        getSavedLocationsAsync,
        getDistanceToLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => useContext(LocationContext);
