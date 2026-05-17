/**
 * Functional tests: Login and redirect to home
 * Be My Eyes - automated test suite
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import LoginScreen from '../../screens/LoginScreen';

const mockLogin = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

function renderLogin() {
  return render(
    <LoginScreen
      navigation={{
        navigate: mockNavigate,
      }}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Functional: Login and Profile', () => {
  describe('A) Login with valid credentials', () => {
    it('Login with valid credentials - redirect to home (login called; navigation is app-level)', async () => {
      mockLogin.mockResolvedValueOnce({ uid: 'user1' });
      renderLogin();

      fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'abc@gmail.com');
      fireEvent.changeText(screen.getByPlaceholderText('Enter password'), 'Password123');
      const signInButtons = screen.getAllByText('Sign In');
      fireEvent.press(signInButtons[signInButtons.length - 1]);

      await screen.findByText('Signing In...').catch(() => null);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockLogin).toHaveBeenCalledWith('abc@gmail.com', 'Password123');
      // App-level redirect happens in App.js when currentUser is set; here we only verify login was invoked
    });

    it('Invalid email shows validation error', () => {
      renderLogin();
      fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'abc.gmail.com');
      fireEvent.changeText(screen.getByPlaceholderText('Enter password'), 'pass');
      const signInButtons = screen.getAllByText('Sign In');
      fireEvent.press(signInButtons[signInButtons.length - 1]);
      expect(screen.getByText('Valid email is required')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('Empty fields show errors', () => {
      renderLogin();
      const signInButtons = screen.getAllByText('Sign In');
      fireEvent.press(signInButtons[signInButtons.length - 1]);
      expect(screen.getByText('Valid email is required')).toBeTruthy();
      expect(screen.getByText('Password is required')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('Incorrect password - Firebase error shown after submit', async () => {
      mockLogin.mockRejectedValueOnce(new Error('Wrong password'));
      renderLogin();
      fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'abc@gmail.com');
      fireEvent.changeText(screen.getByPlaceholderText('Enter password'), 'wrongpass');
      const signInButtons = screen.getAllByText('Sign In');
      fireEvent.press(signInButtons[signInButtons.length - 1]);

      await new Promise((r) => setTimeout(r, 100));
      expect(screen.getByText('Wrong password')).toBeTruthy();
    });
  });
});
