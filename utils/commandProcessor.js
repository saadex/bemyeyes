/**
 * Command patterns for keyword detection
 */
export const commandPatterns = {
  setHome: [
    'set location to home',
    'save location as home',
    'set home location',
    'save home',
    'home location',
    'set home',
    'save my home',
    'remember home'
  ],
  setOffice: [
    'set location to office',
    'save location as office',
    'set office location',
    'save office',
    'office location',
    'set office',
    'save my office',
    'remember office'
  ],
  navigateHome: [
    'navigate to home',
    'go to home',
    'directions to home',
    'route to home',
    'navigate home',
    'take me home',
    'drive to home',
    'home',
    'go home'
  ],
  navigateOffice: [
    'navigate to office',
    'go to office',
    'directions to office',
    'route to office',
    'navigate office',
    'take me to office',
    'drive to office',
    'office',
    'go to work'
  ],
  stopNavigation: [
    'stop the navigation',
    'stop navigation',
    'cancel navigation',
    'cancel the navigation',
    'end navigation',
    'stop navigating',
    'stop directions',
    'cancel directions'
  ],
  emergency: [
    'emergency help',
    'emergency',
    'call emergency',
    'emergency alert',
    'send emergency',
    'emergency assistance',
    'sos',
    'send sos',
    'panic',
    'panic button'
  ]
};

/**
 * Check if text matches any of the given patterns
 */
export const isMatch = (patterns, text) => {
  const lowerText = text.toLowerCase().trim();
  return patterns.some(pattern => lowerText.includes(pattern.toLowerCase()));
};

/**
 * Detect command type from user input
 */
export const detectCommand = (input) => {
  const lowerInput = input.toLowerCase().trim();

  if (isMatch(commandPatterns.setHome, lowerInput)) {
    return 'setHome';
  } else if (isMatch(commandPatterns.setOffice, lowerInput)) {
    return 'setOffice';
  } else if (isMatch(commandPatterns.navigateHome, lowerInput)) {
    return 'navigateHome';
  } else if (isMatch(commandPatterns.navigateOffice, lowerInput)) {
    return 'navigateOffice';
  } else if (isMatch(commandPatterns.stopNavigation, lowerInput)) {
    return 'stopNavigation';
  } else if (isMatch(commandPatterns.emergency, lowerInput)) {
    return 'emergency';
  }

  return null;
};

/**
 * Patterns for "save current location as <name>". Each must capture the name
 * in group 1. Anchored to the start of the utterance so we don't accidentally
 * match a save phrase that's embedded in unrelated conversation.
 */
// Each pattern bundles each optional middle word together with its leading
// whitespace, so the regex doesn't dead-end on " save as foo" / " save this as
// foo" / " save current location as foo" alike. Group 1 always captures the
// landmark name.
const SAVE_LANDMARK_PATTERNS = [
  /^save(?:\s+(?:this|current|here|the))?(?:\s+(?:location|landmark|place|spot|point|position))?\s+(?:as|called|named)\s+(.+)$/i,
  /^remember(?:\s+(?:this|here|current))?(?:\s+(?:location|landmark|place|spot))?\s+(?:as|called|named)\s+(.+)$/i,
  /^add(?:\s+(?:this|current|here))?(?:\s+(?:as\s+(?:a\s+)?))?\s*landmark(?:\s+(?:called|named|as))?\s+(.+)$/i,
];

/**
 * If the utterance is a "save current location as X" style command, return X.
 * Otherwise null.
 */
export const parseSaveLandmark = (input) => {
  const text = (input || '').trim();
  if (!text) return null;
  for (const pattern of SAVE_LANDMARK_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[1]) {
      const name = m[1]
        .trim()
        .replace(/^['"`](.*)['"`]$/, '$1')   // strip surrounding quotes
        .replace(/[.!?,;:]+$/, '')           // strip trailing punctuation
        .replace(/\s+please$/i, '')          // "...as foo please" -> "foo"
        .trim();
      if (name && name.length > 0) return name;
    }
  }
  return null;
};

// Words to ignore when matching landmark names against the transcript. Most
// are navigation / chat fillers; "home" and "office" are excluded because
// those are handled by the fixed navigateHome / navigateOffice patterns and
// we don't want a landmark called "Home Depot" to swallow "go home".
const LANDMARK_MATCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'at', 'in', 'on', 'is', 'are',
  'to', 'go', 'navigate', 'take', 'me', 'directions', 'route', 'drive',
  'head', 'lead', 'walk', 'get', 'show', 'please', 'now', 'there', 'way',
  'home', 'office',
]);
const MIN_LANDMARK_WORD_LEN = 3;

/** Strip punctuation and split into lowercase tokens. */
const tokenize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Try to match a saved landmark against the utterance. Returns the landmark
 * with the most matching tokens (>=1), or null. A "matching token" is any
 * word that appears in both the landmark name and the transcript, has at
 * least MIN_LANDMARK_WORD_LEN characters, and isn't in the stop-word list.
 */
export const matchLandmarkInText = (input, landmarks) => {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return null;
  const transcriptTokens = new Set(
    tokenize(input).filter(
      (w) => w.length >= MIN_LANDMARK_WORD_LEN && !LANDMARK_MATCH_STOPWORDS.has(w)
    )
  );
  if (transcriptTokens.size === 0) return null;

  let bestMatch = null;
  let bestScore = 0;
  for (const landmark of landmarks) {
    if (!landmark || typeof landmark.name !== 'string') continue;
    const landmarkTokens = tokenize(landmark.name).filter(
      (w) => w.length >= MIN_LANDMARK_WORD_LEN
    );
    if (landmarkTokens.length === 0) continue;
    let score = 0;
    for (const t of landmarkTokens) {
      if (transcriptTokens.has(t)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = landmark;
    }
  }
  return bestMatch;
};

/**
 * Process a command and execute the appropriate action.
 * No popups; handlers perform actions and caller may use returned message for TTS.
 *
 * @param {string} command - The user's command text
 * @param {Object} handlers - Handler functions (onSetHome, onSetOffice, saveLocation, onNavigateHome, onNavigateOffice, onEmergency, onUnknown)
 * @param {Object} context - { savedLocations, navigation }
 * @returns {Object} - { type, message, action }
 */
export const processCommand = (command, handlers = {}, context = {}) => {
  const { savedLocations = {}, navigation } = context;

  // === New rule 1: "save current location as <name>" ==========================
  // Anchored regex match — must look like a save command from the start of
  // the utterance, so it can never accidentally fire on conversational input.
  const saveLandmarkName = parseSaveLandmark(command);
  if (saveLandmarkName) {
    if (handlers.onSaveLandmark) {
      handlers.onSaveLandmark(saveLandmarkName);
    }
    return {
      type: 'saveLandmark',
      message: `Saving current location as ${saveLandmarkName}.`,
      payload: { name: saveLandmarkName },
      action: 'saveLandmark',
    };
  }

  const commandType = detectCommand(command);

  switch (commandType) {
    case 'setHome':
      if (handlers.onSetHome) {
        handlers.onSetHome();
      }
      return {
        type: 'setHome',
        message: 'Saving home location.',
        action: 'setHome'
      };
      
    case 'setOffice':
      if (handlers.onSetOffice) {
        handlers.onSetOffice();
      }
      return {
        type: 'setOffice',
        message: 'Saving office location.',
        action: 'setOffice'
      };
      
    case 'navigateHome':
      if (savedLocations?.home && savedLocations.home.latitude != null && savedLocations.home.longitude != null) {
        if (navigation?.navigate) {
          navigation.navigate('Navigation', { 
            destination: savedLocations.home,
            autoStart: true
          });
        }
        if (handlers.onNavigateHome) {
          handlers.onNavigateHome(savedLocations.home);
        }
        return {
          type: 'navigateHome',
          message: 'Starting navigation to home.',
          action: 'navigate'
        };
      } else {
        const message = 'Home location not set. Save your home location first.';
        if (handlers.onNavigateHome) {
          handlers.onNavigateHome(null);
        }
        return {
          type: 'error',
          message: message,
          action: null
        };
      }
      
    case 'navigateOffice':
      if (savedLocations?.office && savedLocations.office.latitude != null && savedLocations.office.longitude != null) {
        if (navigation?.navigate) {
          navigation.navigate('Navigation', { 
            destination: savedLocations.office,
            autoStart: true
          });
        }
        if (handlers.onNavigateOffice) {
          handlers.onNavigateOffice(savedLocations.office);
        }
        return {
          type: 'navigateOffice',
          message: 'Starting navigation to office.',
          action: 'navigate'
        };
      } else {
        const message = 'Office location not set. Save your office location first.';
        if (handlers.onNavigateOffice) {
          handlers.onNavigateOffice(null);
        }
        return {
          type: 'error',
          message: message,
          action: null
        };
      }
      
    case 'stopNavigation':
      if (handlers.onStopNavigation) {
        handlers.onStopNavigation();
      }
      return {
        type: 'stopNavigation',
        message: 'Navigation stopped.',
        action: 'stopNavigation'
      };

    case 'emergency':
      if (handlers.onEmergency) {
        handlers.onEmergency();
      }
      return {
        type: 'emergency',
        message: 'Emergency alert activated. Help is on the way.',
        action: 'emergency'
      };

    default: {
      // === New rule 2: navigate to any saved landmark =========================
      // If no fixed pattern matched and the utterance shares at least one
      // distinctive word (>=3 chars, non-stopword) with a saved landmark's
      // name, treat it as "navigate to <that landmark>". Runs LAST so it
      // can't shadow setHome / navigateHome / emergency / etc.
      const landmarks = Array.isArray(savedLocations?.landmarks) ? savedLocations.landmarks : [];
      const matchedLandmark = matchLandmarkInText(command, landmarks);
      if (matchedLandmark) {
        if (navigation?.navigate) {
          navigation.navigate('Navigation', {
            destination: matchedLandmark,
            autoStart: true,
          });
        }
        if (handlers.onNavigateLandmark) {
          handlers.onNavigateLandmark(matchedLandmark);
        }
        return {
          type: 'navigateLandmark',
          message: `Starting navigation to ${matchedLandmark.name}.`,
          payload: { landmark: matchedLandmark },
          action: 'navigate',
        };
      }

      if (handlers.onUnknown) {
        handlers.onUnknown(command);
      }
      return {
        type: 'unknown',
        message: '',
        action: null
      };
    }
  }
};

/**
 * Get a friendly response message for a command
 */
export const getCommandResponse = (commandType) => {
  const responses = {
    setHome: 'Saving home location.',
    setOffice: 'Saving office location.',
    navigateHome: 'Starting navigation to home.',
    navigateOffice: 'Starting navigation to office.',
    saveLandmark: 'Saving current location as a landmark.',
    navigateLandmark: 'Starting navigation to landmark.',
    stopNavigation: 'Navigation stopped.',
    emergency: 'Emergency alert activated. Help is on the way.',
    unknown: "I didn't understand that. Can you try rephrasing?"
  };
  
  return responses[commandType] || responses.unknown;
};
