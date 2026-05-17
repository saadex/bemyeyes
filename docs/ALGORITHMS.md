# Be My Eyes – Algorithms (matching app implementation)

These algorithms describe the logic actually implemented in the app codebase.

---

## 1. Object detection (obstacle alert during navigation)

```
1:  Load TensorFlow.js and set backend to 'rn-webgl'
2:  Load YOLO model (yolov5n-320) via bundleResourceIO; read input shape (modelWidth, modelHeight)
3:  Load COCO-style class labels from labels.json
4:  Set default confidence threshold ← 0.25
5:  While navigation is active do:
6:        Read arduinoDistanceCm from ArduinoContext (Bluetooth serial)
7:        If arduinoDistanceCm is null or arduinoDistanceCm ≥ OBSTACLE_DISTANCE_CM (150 cm) then
8:             If arduinoDistanceCm ≥ 150 then set lastArduinoDistanceAboveThreshold ← true
9:             Skip obstacle check; continue
10:       End if
11:       If lastArduinoDistanceAboveThreshold was false then skip (already in “near” state)
12:       If current time < obstacleCooldownUntil then skip (cooldown OBSTACLE_COOLDOWN_MS = 20 s)
13:       Set lastArduinoDistanceAboveThreshold ← false
14:       Set obstacleCooldownUntil ← now + 20 s
15:       Speak("Obstacle detected. Checking in front of you.")
16:       Capture frame: camera.takePictureAsync({ quality: 0.5, base64: true }) → base64Jpeg
17:       base64 → atob → Uint8Array (imageBytes)
18:       imageTensor ← decodeJpeg(imageBytes, 3)
19:       Preprocess: pad to square, resizeBilinear to (modelWidth, modelHeight), div(255), expandDims(0) → input blob
20:       net.setInput(blob)
21:       outs ← model.executeAsync(input)   // [boxes, scores, classes]
22:       scoresData ← scores.dataSync(); classesData ← classes.dataSync()
23:       detected ← []; seen ← empty set
24:       For each index i in scoresData do:
25:            If scoresData[i] > threshold then
26:                 classIdx ← round(classesData[i])
27:                 label ← labels[classIdx] or "object {classIdx}"
28:                 If label not in seen then
29:                      Add label to detected; add label to seen
30:                 End if
31:            End if
32:       End for
33:       Dispose tensors (boxes, scores, classes, input, imageTensor)
34:       If detected not empty then
35:            text ← "Object in front: " + join(detected, ", ") + ". Please proceed with caution."
36:       Else
37:            text ← "Obstacle in front. Please check in front of you and proceed with caution."
38:       End if
39:       Speak(text) after 800 ms
40:  End while
41:  (No ORB/PKR or currency detection in app; camera released when navigation stops)
```

**Files:** `utils/navigationObstacleAlert.js`, `utils/objectDetection/preprocess.js`, `utils/objectDetection/modelHandler.js`, `screens/NavigationScreen.js` (obstacle trigger and runObstacleCheck).

---

## 2. Navigation and GPS tracking

```
1:  On app load: LocationProvider requests foreground location permission
2:  getLocation(): requestForegroundPermissionsAsync; getCurrentPositionAsync(Accuracy.High) → set location state
3:  currentLocation ← location (same value; no continuous watch in this app)
4:  Saved destinations loaded from Firestore: savedHome, savedOffice, savedLandmarks (user doc)
5:  User selects destination (Home / Office / landmark) → destination ← { latitude, longitude, name }
6:  getDistanceToLocation(destination):
7:        If location or destination null then return null
8:        R ← 6371  // Earth radius km
9:        dLat ← (dest.lat - loc.lat) * π/180; dLon ← (dest.lon - loc.lon) * π/180
10:       a ← sin²(dLat/2) + cos(loc.lat) cos(dest.lat) sin²(dLon/2)
11:       c ← 2 atan2(√a, √(1−a))
12:       return R * c   // distance in km (Haversine)
13:  When destination and currentLocation exist:
14:       dist ← getDistanceToLocation(destination); setDistance(dist)
15:       estimatedTime ← round((dist / 5) * 60)   // walking ~5 km/h → minutes
16:  If route params include autoStart and destination and distance and estimatedTime and not yet started:
17:       After 800 ms call startNavigation()
18:  When destination is set: Speak("Destination set to {name}. Distance is {dist} kilometers. Estimated walking time is {estimatedTime} minutes.")
19:  getDirectionIcon(): return random element of ['north','north-east','east','south-east','south','south-west','west','north-west']   // placeholder; not GPS bearing
20:  When user starts navigation (isNavigating ← true):
21:       Speak("Navigation started to {name}. Distance is {dist} km. Estimated time is {estimatedTime} minutes.")
22:       Speak("Navigation started. Head {direction} towards {name}. Distance remaining is {dist} kilometers.")
23:       Start interval every 10 seconds:
24:            currentDist ← getDistanceToLocation(destination)   // uses current location from context
25:            setDistance(currentDist); setEstimatedTime(round((currentDist/5)*60))
26:            roundedDist ← round(currentDist * 10) / 10
27:            If roundedDist < 0.1 then
28:                 Speak("You have arrived at {name}."); setIsNavigating(false); clear interval
29:            Else if roundedDist < 0.5 then
30:                 instruction ← "Continue straight. You are {roundedDist*1000} meters away from {name}."
31:            Else
32:                 instruction ← "Continue heading {direction}. {roundedDist} km remaining. Estimated time {timeInMinutes} minutes."
33:            End if
34:            If instruction and (lastSpokenDistance is null or |lastSpokenDistance − roundedDist| ≥ 0.2) then
35:                 Speak(instruction); lastSpokenDistance ← roundedDist
36:            End if
37:  End interval when navigation stops
38:  stopNavigation(): setIsNavigating(false); Speech.stop()
```

**Files:** `contexts/LocationContext.js` (getLocation, getDistanceToLocation), `screens/NavigationScreen.js` (destination, distance, ETA, interval, speakText).

---

## 3. Emergency alert system

```
1:  Caller has: currentUser (auth), userProfile (Firestore users doc), currentLocation (from LocationContext)
2:  On trigger (SOS button / voice "Help" or "Emergency" / navigation emergency check "yes"):
3:        userId ← currentUser.uid
4:        If userId is null or missing then
5:             Throw "No signed-in user." (caller shows or speaks error)
6:        End if
7:        If currentLocation is null or not valid (lat/lon missing or NaN) then
8:             Throw "Location is unavailable." (caller may show "Enable Location Service")
9:        End if
10:       (If network fails later, addDoc/updateDoc throw; caller shows "Connection Error" or speaks "Enable Location Service")
11:       emergencyData ← {
12:            userId,
13:            type: trigger,   // 'manual' | 'voiceCommand' | 'chatbotVoice' | 'navigationCheck' | 'unknown'
14:            location: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
15:            timestamp: serverTimestamp(),
16:            resolved: false,
17:            guardianNotified: false,
18:            userInfo: {
19:                 name: trim(profile.firstName + ' ' + profile.lastName),
20:                 phone: profile.phone,
21:                 emergencyContact: profile.emergencyContact,
22:                 emergencyName: profile.emergencyName,
23:                 medicalInfo: profile.medicalInfo
24:            }
25:       }
26:       addDoc(collection(firestore, 'emergencyLogs'), emergencyData)
27:       Try: updateDoc(doc(firestore, 'users', userId), { lastEmergencyAlert: serverTimestamp(), updatedAt: serverTimestamp() })
28:       Catch: ignore (log already created)
29:       Return emergencyData
30:  Caller on success: e.g. Speak("Emergency alert sent. Help is on the way.")
31:  Caller on failure: e.g. Speak("Failed to send emergency alert.") or show "Connection Error"
```

**Files:** `utils/emergencyAlert.js`, callers in `screens/NavigationScreen.js`, `screens/VoiceCommandScreen.js`, etc.

---

## 4. Audio feedback system (TTS)

```
1:  Load expo-speech (Speech.speak, Speech.stop)
2:  Default options: language 'en', pitch 1.0, rate 0.9
3:  speakText(text, delay) in NavigationScreen:
4:        cleanText ← text with replacements: "km"→"kilometers", "m"→"meters", "min"→"minutes", newlines→". "
5:        If cleanText empty then return
6:        Speech.stop()
7:        After 100 ms: Speech.speak(cleanText, { language: 'en', pitch: 1.0, rate: 0.9, onDone, onError })
8:        If delay > 0 then run above after delay ms
9:  Usage sites:
10:       Navigation: destination set, navigation started, periodic updates (every 10 s when distance changed ≥ 0.2 km), "You have arrived", "Continue straight", "Continue heading {direction}"
11:       Obstacle: "Obstacle detected. Checking in front of you." then "Object in front: {labels}." or "Obstacle in front. Please check..."
12:       Emergency check (every 3 min during navigation): Speak("Do you have an emergency? Say yes or no."); on "yes" → sendEmergencyAlert then Speak("Emergency alert sent...") or error message
13:       Arduino connection lost: ArduinoConnectionLostNotifier → Speak("Arduino connection lost. Please reconnect from Device Management.")
14:       Voice commands: VoiceCommandContext / VoiceCommandScreen → Speak(command response e.g. "Saving home location.", "Starting navigation to home.", "Emergency alert activated. Help is on the way.")
15:  Throttling: obstacle cooldown 20 s; navigation update only when |lastSpokenDistance − roundedDist| ≥ 0.2 km
16:  On stop navigation or screen unmount: Speech.stop() to clear queue
```

**Files:** `screens/NavigationScreen.js` (speakText), `components/ArduinoConnectionLostNotifier.js`, `contexts/VoiceCommandContext.js`, `screens/VoiceCommandScreen.js`, `screens/ChatbotScreen.js`.
