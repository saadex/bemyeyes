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
 * Process a command and execute the appropriate action.
 * No popups; handlers perform actions and caller may use returned message for TTS.
 *
 * @param {string} command - The user's command text
 * @param {Object} handlers - Handler functions (onSetHome, onSetOffice, saveLocation, onNavigateHome, onNavigateOffice, onEmergency, onUnknown)
 * @param {Object} context - { savedLocations, navigation }
 * @returns {Object} - { type, message, action }
 */
export const processCommand = (command, handlers = {}, context = {}) => {
  const commandType = detectCommand(command);
  const { savedLocations = {}, navigation } = context;
  
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

    default:
      if (handlers.onUnknown) {
        handlers.onUnknown(command);
      }
      return {
        type: 'unknown',
        message: '',
        action: null
      };
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
    stopNavigation: 'Navigation stopped.',
    emergency: 'Emergency alert activated. Help is on the way.',
    unknown: "I didn't understand that. Can you try rephrasing?"
  };
  
  return responses[commandType] || responses.unknown;
};
