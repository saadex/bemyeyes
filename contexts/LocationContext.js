import React, { createContext, useState, useEffect, useContext } from 'react';
import * as Location from 'expo-location';
import { auth, firestore } from '../config/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
      const userDocRef = doc(firestore, 'users', auth.currentUser.uid);
      const locationData = {
        ...locationToSave,
        name,
        timestamp: serverTimestamp()
      };

      let updateData = {};
      
      if (type === 'home') {
        updateData.savedHome = locationData;
      } else if (type === 'office') {
        updateData.savedOffice = locationData;
      } else if (type === 'landmark') {
        const userDocSnap = await getDoc(userDocRef);
        const existingData = userDocSnap.exists() ? userDocSnap.data() : {};
        const existingLandmarks = existingData.savedLandmarks || [];
        updateData.savedLandmarks = [...existingLandmarks, locationData];
      }

      updateData.updatedAt = serverTimestamp();
      await updateDoc(userDocRef, updateData);

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
      const userDocRef = doc(firestore, 'users', auth.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) return null;
      const data = userDocSnap.data();
      return {
        home: data.savedHome && isValidLocation(data.savedHome) ? data.savedHome : null,
        office: data.savedOffice && isValidLocation(data.savedOffice) ? data.savedOffice : null,
        landmarks: Array.isArray(data.savedLandmarks)
          ? data.savedLandmarks.filter(loc => isValidLocation(loc))
          : [],
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
