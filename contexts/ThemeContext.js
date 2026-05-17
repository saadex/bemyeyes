import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const { userProfile } = useAuth();

  const isDarkMode = userProfile?.settings?.nightMode || false;

  const theme = useMemo(() => {
    if (isDarkMode) {
      return {
        isDark: true,
        colors: {
          background: '#121212',
          surface: '#1E1E1E',
          card: '#2D2D2D',
          text: '#FFFFFF',
          textSecondary: '#B0B0B0',
          textTertiary: '#808080',
          border: '#333333',
          primary: '#4A90E2',
          secondary: '#6C757D',
          success: '#4CAF50',
          warning: '#FF9800',
          error: '#F44336',
          info: '#2196F3',
          accent: '#9C27B0',
          shadow: '#000000',
          inputBackground: '#2D2D2D',
          inputBorder: '#404040',
          disabled: '#555555',
          divider: '#333333'
        }
      };
    } else {
      return {
        isDark: false,
        colors: {
          background: '#f8f9fa',
          surface: '#FFFFFF',
          card: '#FFFFFF',
          text: '#333333',
          textSecondary: '#666666',
          textTertiary: '#999999',
          border: '#E0E0E0',
          primary: '#4A90E2',
          secondary: '#6C757D',
          success: '#4CAF50',
          warning: '#FF9800',
          error: '#F44336',
          info: '#2196F3',
          accent: '#9C27B0',
          shadow: '#000000',
          inputBackground: '#F9F9F9',
          inputBorder: '#CCCCCC',
          disabled: '#CCCCCC',
          divider: '#E0E0E0'
        }
      };
    }
  }, [isDarkMode]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

