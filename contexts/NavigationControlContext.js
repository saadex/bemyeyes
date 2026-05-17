import React, { createContext, useRef, useContext } from 'react';

/**
 * Holds a ref to the current Navigation screen's stopNavigation function
 * so voice commands (e.g. "stop navigation") can stop navigation from anywhere.
 * Also holds emergencyCheckRef so Navigation can ask "Do you have an emergency?"
 * and VoiceCommandContext can route "yes"/"no" to the callback.
 */
const NavigationControlContext = createContext({
  stopNavigationRef: { current: null },
  emergencyCheckRef: { current: null },
});

export const NavigationControlProvider = ({ children }) => {
  const stopNavigationRef = useRef(null);
  const emergencyCheckRef = useRef(null);
  return (
    <NavigationControlContext.Provider value={{ stopNavigationRef, emergencyCheckRef }}>
      {children}
    </NavigationControlContext.Provider>
  );
};

export const useNavigationControl = () => useContext(NavigationControlContext);
