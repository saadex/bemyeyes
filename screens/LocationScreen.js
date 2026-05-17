import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform
} from 'react-native';
import * as Location from 'expo-location';
import { useLocation } from '../contexts/LocationContext';
import { useTheme } from '../contexts/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';

// Import WebView with error handling
let WebView = null;
try {
  WebView = require('react-native-webview').WebView;
} catch (error) {
  console.warn('react-native-webview not available:', error);
}


export default function LocationScreen() {
  const { currentLocation, savedLocations, saveLocation } = useLocation();
  const theme = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLocationType, setSelectedLocationType] = useState('');
  const [locationName, setLocationName] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mapRegion, setMapRegion] = useState(null);
  const mapRef = useRef(null);
  const [mapKey, setMapKey] = useState(0); // Key to force re-render when markers change

  const handleSaveLocation = (type) => {
    if (type === 'landmark') {
      setSelectedLocationType('landmark');
      setModalVisible(true);
    } else {
      const name = type === 'home' ? 'Home' : 'Office';
      if (saveLocation) {
        saveLocation(type, name).catch((err) => console.error('Save location error', err));
      }
    }
  };

  const handleSaveLandmark = async () => {
    if (!locationName.trim()) return;
    const locationToUse = selectedLocation || currentLocation;
    if (!locationToUse) return;
    if (saveLocation) {
      try {
        await saveLocation('landmark', locationName.trim(), locationToUse);
        setLocationName('');
        setModalVisible(false);
        setSelectedLocation(null);
        setSearchQuery('');
      } catch (error) {
        console.error('Failed to save landmark', error);
      }
    }
  };

  const formatCoordinate = (coord) => coord?.toFixed(6) || 'N/A';

  // Initialize map region with current location
  useEffect(() => {
    if (currentLocation && !mapRegion) {
      setMapRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      setSelectedLocation(currentLocation);
    }
  }, [currentLocation]);

  // Update map key when saved locations change to refresh markers
  useEffect(() => {
    if (mapRegion) {
      setMapKey(prev => prev + 1);
    }
  }, [savedLocations.home, savedLocations.office, savedLocations.landmarks]);

  // Handle map press is now handled via WebView message

  // Reverse geocode coordinates to address
  const reverseGeocode = async (latitude, longitude) => {
    try {
      const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (addresses && addresses.length > 0) {
        const address = addresses[0];
        const addressString = [
          address.street,
          address.city,
          address.region,
          address.country
        ].filter(Boolean).join(', ');
        setSearchQuery(addressString);
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
    }
  };

  // Search for locations
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await Location.geocodeAsync(searchQuery);
      if (results && results.length > 0) {
        setSearchResults(results);
        const firstResult = results[0];
        const newLocation = {
          latitude: firstResult.latitude,
          longitude: firstResult.longitude
        };
        setSelectedLocation(newLocation);
        
        // Update map region to show the searched location
        setMapRegion({
          latitude: firstResult.latitude,
          longitude: firstResult.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        
        // Center map on the location
        if (mapRef.current) {
          mapRef.current.postMessage(JSON.stringify({
            type: 'center',
            lat: firstResult.latitude,
            lng: firstResult.longitude
          }));
        }
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Select a search result
  const handleSelectSearchResult = (result) => {
    const newLocation = {
      latitude: result.latitude,
      longitude: result.longitude
    };
    setSelectedLocation(newLocation);
    setSearchQuery([
      result.street,
      result.city,
      result.region,
      result.country
    ].filter(Boolean).join(', '));
    setSearchResults([]);
    
    // Update map region
    setMapRegion({
      latitude: result.latitude,
      longitude: result.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    
    // Center map on the location
    if (mapRef.current) {
      mapRef.current.postMessage(JSON.stringify({
        type: 'center',
        lat: result.latitude,
        lng: result.longitude
      }));
    }
  };

  // Center map on current location
  const centerOnCurrentLocation = () => {
    if (currentLocation && mapRef.current) {
      const region = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setMapRegion(region);
      setSelectedLocation(currentLocation);
      // Center map via WebView message
      if (mapRef.current) {
        mapRef.current.postMessage(JSON.stringify({
          type: 'center',
          lat: currentLocation.latitude,
          lng: currentLocation.longitude
        }));
      }
      reverseGeocode(currentLocation.latitude, currentLocation.longitude);
    }
  };

  // Generate Leaflet map HTML
  const generateLeafletHTML = () => {
    const center = mapRegion || currentLocation || { latitude: 0, longitude: 0 };
    const markers = [];
    
    // Add selected location marker
    if (selectedLocation) {
      markers.push({
        lat: selectedLocation.latitude,
        lng: selectedLocation.longitude,
        title: 'Selected Location',
        color: '#4A90E2'
      });
    }
    
    // Add home marker
    if (savedLocations.home) {
      markers.push({
        lat: savedLocations.home.latitude,
        lng: savedLocations.home.longitude,
        title: 'Home',
        color: '#4CAF50'
      });
    }
    
    // Add office marker
    if (savedLocations.office) {
      markers.push({
        lat: savedLocations.office.latitude,
        lng: savedLocations.office.longitude,
        title: 'Office',
        color: '#2196F3'
      });
    }
    
    // Add landmark markers
    if (savedLocations.landmarks) {
      savedLocations.landmarks.forEach(landmark => {
        markers.push({
          lat: landmark.latitude,
          lng: landmark.longitude,
          title: landmark.name,
          color: '#FF9800'
        });
      });
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <style>
            body { margin: 0; padding: 0; }
            #map { width: 100%; height: 100vh; }
            .loading { 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              font-family: Arial, sans-serif;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <div id="loading" class="loading">Loading map...</div>
          <script>
            // Global map variable
            let map = null;
            let selectedMarker = null;
            
            // Wait for Leaflet to load
            function initMap() {
              if (typeof L === 'undefined') {
                console.error('Leaflet not loaded');
                document.getElementById('loading').innerHTML = 'Error loading map library';
                return;
              }
              
              document.getElementById('loading').style.display = 'none';
              
              try {
                map = L.map('map').setView([${center.latitude}, ${center.longitude}], 13);
            
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '© OpenStreetMap contributors',
                  maxZoom: 19
                }).addTo(map);
                
                // Add markers
                const markers = ${JSON.stringify(markers)};
                markers.forEach(marker => {
                  const icon = L.divIcon({
                    className: 'custom-marker',
                    html: \`<div style="background-color: \${marker.color}; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>\`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                    popupAnchor: [0, -30]
                  });
                  
                  L.marker([marker.lat, marker.lng], { icon: icon })
                    .addTo(map)
                    .bindPopup(marker.title);
                });
                
                // Handle map click
                map.on('click', function(e) {
                  const lat = e.latlng.lat;
                  const lng = e.latlng.lng;
                  
                  // Remove previous selected marker
                  if (selectedMarker) {
                    map.removeLayer(selectedMarker);
                  }
                  
                  // Add new selected marker
                  const icon = L.divIcon({
                    className: 'selected-marker',
                    html: '<div style="background-color: #4A90E2; width: 40px; height: 40px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>',
                    iconSize: [40, 40],
                    iconAnchor: [20, 40],
                    popupAnchor: [0, -40]
                  });
                  
                  selectedMarker = L.marker([lat, lng], { icon: icon })
                    .addTo(map)
                    .bindPopup('Selected Location')
                    .openPopup();
                  
                  // Send message to React Native
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'mapClick',
                      lat: lat,
                      lng: lng
                    }));
                  }
                });
                
              } catch (error) {
                console.error('Map initialization error:', error);
                document.getElementById('loading').innerHTML = 'Error initializing map: ' + error.message;
              }
            }
            
            // Listen for messages from React Native
            window.addEventListener('message', function(event) {
              try {
                const data = JSON.parse(event.data);
                if (map && data.type === 'center') {
                  map.setView([data.lat, data.lng], 13);
                } else if (map && data.type === 'updateMarkers') {
                  // Clear existing markers except selected
                  map.eachLayer(function(layer) {
                    if (layer instanceof L.Marker && layer !== selectedMarker) {
                      map.removeLayer(layer);
                    }
                  });
                  
                  // Add new markers
                  if (data.markers) {
                    data.markers.forEach(marker => {
                      const icon = L.divIcon({
                        className: 'custom-marker',
                        html: \`<div style="background-color: \${marker.color}; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>\`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 30],
                        popupAnchor: [0, -30]
                      });
                      
                      L.marker([marker.lat, marker.lng], { icon: icon })
                        .addTo(map)
                        .bindPopup(marker.title);
                    });
                  }
                }
              } catch (e) {
                console.error('Error parsing message:', e);
              }
            });
            
            // Handle WebView message (for react-native-webview)
            document.addEventListener('message', function(event) {
              try {
                const data = JSON.parse(event.data);
                if (map && data.type === 'center') {
                  map.setView([data.lat, data.lng], 13);
                }
              } catch (e) {
                console.error('Error parsing message:', e);
              }
            });

            // Load Leaflet script
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = function() {
              initMap();
            };
            script.onerror = function() {
              document.getElementById('loading').innerHTML = 'Error loading map library. Please check your internet connection.';
            };
            document.head.appendChild(script);
          </script>
        </body>
      </html>
    `;
  };

  // Handle WebView messages
  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapClick') {
        const newLocation = {
          latitude: data.lat,
          longitude: data.lng
        };
        setSelectedLocation(newLocation);
        reverseGeocode(data.lat, data.lng);
      }
    } catch (error) {
      console.error('Error handling WebView message:', error);
    }
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
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.colors.text
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: 4
    },
    currentLocationCard: {
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
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8
    },
    coordinates: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 2
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text
    },
    addButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.inputBackground
    },
    locationCard: {
      backgroundColor: theme.colors.card,
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    locationName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text
    },
    locationCoords: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    locationTime: {
      fontSize: 12,
      color: theme.colors.textTertiary,
      marginTop: 2
    },
    notSetText: {
      fontSize: 14,
      color: theme.colors.textTertiary,
      fontStyle: 'italic'
    },
    editButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.inputBackground
    },
    emptyState: {
      alignItems: 'center',
      padding: 40,
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    emptyStateText: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: 16,
      textAlign: 'center'
    },
    emptyStateSubtext: {
      fontSize: 14,
      color: theme.colors.textTertiary,
      marginTop: 8,
      textAlign: 'center'
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center'
    },
    modalContent: {
      backgroundColor: theme.colors.card,
      margin: 20,
      padding: 24,
      borderRadius: 12,
      width: '80%'
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 20,
      textAlign: 'center'
    },
    modalInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      marginBottom: 20,
      backgroundColor: theme.colors.inputBackground,
      color: theme.colors.text
    },
    cancelButton: {
      backgroundColor: theme.colors.inputBackground
    },
    cancelButtonText: {
      color: theme.colors.text,
      fontWeight: '500'
    },
    saveModalButton: {
      backgroundColor: '#4A90E2'
    },
    saveButtonText: {
      color: 'white',
      fontWeight: '500'
    },
    mapSection: {
      margin: 16,
      marginBottom: 24
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 8,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    searchInput: {
      flex: 1,
      padding: 12,
      fontSize: 16,
      color: theme.colors.text,
      backgroundColor: theme.colors.inputBackground,
      borderRadius: 8,
      marginRight: 8
    },
    searchButton: {
      padding: 8,
      marginRight: 4
    },
    currentLocationButton: {
      padding: 8
    },
    searchResultsContainer: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      marginBottom: 12,
      maxHeight: 200,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border
    },
    searchResultMain: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text
    },
    searchResultSub: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2
    },
    mapContainer: {
      height: 400,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    map: {
      width: '100%',
      height: '100%'
    },
    mapPlaceholder: {
      height: 400,
      borderRadius: 12,
      backgroundColor: theme.colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3
    },
    mapPlaceholderText: {
      marginTop: 12,
      fontSize: 16,
      color: theme.colors.textSecondary
    },
    mapActionButtons: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 12,
      paddingHorizontal: 8
    },
    mapActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      justifyContent: 'center'
    },
    mapActionButtonText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 6
    }
  });

  return (
    <ScrollView style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.title}>Location Management</Text>
        <Text style={dynamicStyles.subtitle}>Save and manage your important locations</Text>
      </View>

      {/* Map Section */}
      <View style={dynamicStyles.mapSection}>
        <Text style={dynamicStyles.sectionTitle}>Select Location on Map</Text>
        
        {/* Search Bar */}
        <View style={dynamicStyles.searchContainer}>
          <TextInput
            style={dynamicStyles.searchInput}
            placeholder="Search for a location..."
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            onPress={handleSearch}
            style={dynamicStyles.searchButton}
            disabled={isSearching}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color="#4A90E2" />
            ) : (
              <MaterialIcons name="search" size={24} color="#4A90E2" />
            )}
          </TouchableOpacity>
          {currentLocation && (
            <TouchableOpacity
              onPress={centerOnCurrentLocation}
              style={dynamicStyles.currentLocationButton}
            >
              <MaterialIcons name="my-location" size={24} color="#4A90E2" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <View style={dynamicStyles.searchResultsContainer}>
            {searchResults.map((result, index) => (
              <TouchableOpacity
                key={index}
                style={dynamicStyles.searchResultItem}
                onPress={() => handleSelectSearchResult(result)}
              >
                <MaterialIcons name="place" size={20} color="#4A90E2" />
                <View style={styles.searchResultText}>
                  <Text style={dynamicStyles.searchResultMain}>
                    {result.street || result.name || 'Location'}
                  </Text>
                  <Text style={dynamicStyles.searchResultSub}>
                    {[result.city, result.region, result.country].filter(Boolean).join(', ')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Map View */}
        {mapRegion ? (
          WebView ? (
            <View style={dynamicStyles.mapContainer}>
              <WebView
                key={mapKey}
                ref={mapRef}
                source={{ html: generateLeafletHTML() }}
                style={dynamicStyles.map}
                onMessage={handleWebViewMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                originWhitelist={['*']}
                mixedContentMode="always"
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('WebView error: ', nativeEvent);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('WebView HTTP error: ', nativeEvent);
                }}
                renderLoading={() => (
                  <View style={dynamicStyles.mapPlaceholder}>
                    <ActivityIndicator size="large" color="#4A90E2" />
                  </View>
                )}
              />
              
              {/* Save Location Buttons */}
              {selectedLocation && (
                <View style={dynamicStyles.mapActionButtons}>
                  <TouchableOpacity
                    onPress={() => {
                      const locationToUse = selectedLocation || currentLocation;
                      if (!locationToUse) return;
                      setSelectedLocationType('landmark');
                      setModalVisible(true);
                    }}
                    style={[dynamicStyles.mapActionButton, { backgroundColor: '#FF9800' }]}
                  >
                    <MaterialIcons name="add-location" size={20} color="white" />
                    <Text style={dynamicStyles.mapActionButtonText}>Save as Landmark</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={dynamicStyles.mapPlaceholder}>
              <MaterialIcons name="map" size={48} color={theme.colors.textSecondary} />
              <Text style={dynamicStyles.mapPlaceholderText}>Map requires native rebuild</Text>
              <Text style={[dynamicStyles.mapPlaceholderText, { fontSize: 12, marginTop: 8 }]}>
                Please rebuild the app: npx expo run:android
              </Text>
            </View>
          )
        ) : (
          <View style={dynamicStyles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#4A90E2" />
            <Text style={dynamicStyles.mapPlaceholderText}>Loading map...</Text>
          </View>
        )}
      </View>

      <View style={dynamicStyles.currentLocationCard}>
        <MaterialIcons name="my-location" size={24} color="#4A90E2" />
        <View style={styles.locationDetails}>
          <Text style={dynamicStyles.cardTitle}>Current Location</Text>
          <Text style={dynamicStyles.coordinates}>
            Lat: {formatCoordinate(currentLocation?.latitude)}
          </Text>
          <Text style={dynamicStyles.coordinates}>
            Lng: {formatCoordinate(currentLocation?.longitude)}
          </Text>
        </View>
        <View style={styles.locationActions}>
          <TouchableOpacity
            onPress={() => handleSaveLocation('home')}
            style={[styles.saveButton, { backgroundColor: '#4CAF50' }]}
          >
            <MaterialIcons name="home" size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSaveLocation('office')}
            style={[styles.saveButton, { backgroundColor: '#2196F3' }]}
          >
            <MaterialIcons name="business" size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSaveLocation('landmark')}
            style={[styles.saveButton, { backgroundColor: '#FF9800' }]}
          >
            <MaterialIcons name="add-location" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={dynamicStyles.sectionTitle}>Primary Locations</Text>
        
        <View style={dynamicStyles.locationCard}>
          <MaterialIcons name="home" size={24} color="#4CAF50" />
          <View style={styles.locationInfo}>
            <Text style={dynamicStyles.locationName}>Home</Text>
            {savedLocations.home ? (
              <>
                <Text style={dynamicStyles.locationCoords}>
                  {formatCoordinate(savedLocations.home.latitude)}, {formatCoordinate(savedLocations.home.longitude)}
                </Text>
                <Text style={dynamicStyles.locationTime}>
                  Saved: {savedLocations.home.timestamp?.toDate?.()?.toLocaleDateString() || 'Recently'}
                </Text>
              </>
            ) : (
              <Text style={dynamicStyles.notSetText}>Not set</Text>
            )}
          </View>
          {savedLocations.home && (
            <TouchableOpacity style={dynamicStyles.editButton}>
              <MaterialIcons name="edit" size={20} color="#4A90E2" />
            </TouchableOpacity>
          )}
        </View>

        <View style={dynamicStyles.locationCard}>
          <MaterialIcons name="business" size={24} color="#2196F3" />
          <View style={styles.locationInfo}>
            <Text style={dynamicStyles.locationName}>Office</Text>
            {savedLocations.office ? (
              <>
                <Text style={dynamicStyles.locationCoords}>
                  {formatCoordinate(savedLocations.office.latitude)}, {formatCoordinate(savedLocations.office.longitude)}
                </Text>
                <Text style={dynamicStyles.locationTime}>
                  Saved: {savedLocations.office.timestamp?.toDate?.()?.toLocaleDateString() || 'Recently'}
                </Text>
              </>
            ) : (
              <Text style={dynamicStyles.notSetText}>Not set</Text>
            )}
          </View>
          {savedLocations.office && (
            <TouchableOpacity style={dynamicStyles.editButton}>
              <MaterialIcons name="edit" size={20} color="#4A90E2" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={dynamicStyles.sectionTitle}>Landmarks</Text>
          <TouchableOpacity
            onPress={() => handleSaveLocation('landmark')}
            style={dynamicStyles.addButton}
          >
            <MaterialIcons name="add" size={24} color="#4A90E2" />
          </TouchableOpacity>
        </View>

        {savedLocations.landmarks?.length > 0 ? (
          savedLocations.landmarks.map((landmark, index) => (
            <View key={index} style={dynamicStyles.locationCard}>
              <MaterialIcons name="place" size={24} color="#FF9800" />
              <View style={styles.locationInfo}>
                <Text style={dynamicStyles.locationName}>{landmark.name}</Text>
                <Text style={dynamicStyles.locationCoords}>
                  {formatCoordinate(landmark.latitude)}, {formatCoordinate(landmark.longitude)}
                </Text>
                <Text style={dynamicStyles.locationTime}>
                  Saved: {landmark.timestamp?.toDate?.()?.toLocaleDateString() || 'Recently'}
                </Text>
              </View>
              <TouchableOpacity style={dynamicStyles.editButton}>
                <MaterialIcons name="edit" size={20} color="#4A90E2" />
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={dynamicStyles.emptyState}>
            <MaterialIcons name="place" size={48} color={theme.colors.textTertiary} />
            <Text style={dynamicStyles.emptyStateText}>No landmarks saved yet</Text>
            <Text style={dynamicStyles.emptyStateSubtext}>
              Tap the + button to add your first landmark
            </Text>
          </View>
        )}
      </View>

      {modalVisible && (
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalContent}>
            <Text style={dynamicStyles.modalTitle}>Save Landmark</Text>
            {(selectedLocation || currentLocation) && (
              <Text style={[dynamicStyles.coordinates, { textAlign: 'center', marginBottom: 12 }]}>
                Saving at: {formatCoordinate((selectedLocation || currentLocation).latitude)}, {formatCoordinate((selectedLocation || currentLocation).longitude)}
              </Text>
            )}
            <TextInput
              style={dynamicStyles.modalInput}
              placeholder="Enter location name (e.g., Shopping Mall, Park)"
              placeholderTextColor={theme.colors.textTertiary}
              value={locationName}
              onChangeText={setLocationName}
              autoFocus={true}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.modalButton, dynamicStyles.cancelButton]}
              >
                <Text style={dynamicStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveLandmark}
                style={[styles.modalButton, dynamicStyles.saveModalButton]}
              >
                <Text style={dynamicStyles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  locationDetails: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12
  },
  locationActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16
  },
  saveButton: {
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4
  },
  section: {
    margin: 16
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  locationInfo: {
    flex: 1,
    marginLeft: 12
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4
  },
  searchResultText: {
    flex: 1,
    marginLeft: 12
  }
});