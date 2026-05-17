/**
 * Login form validation. Used by LoginScreen and unit tests.
 * @param {{ email: string, password: string }}
 * @returns {{ email?: string, password?: string }}
 */
export function validateLoginFields({ email = '', password = '' }) {
  const errors = {};
  const trimmedEmail = (email || '').trim();
  const trimmedPassword = (password || '').trim();

  if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
    errors.email = 'Valid email is required';
  }
  if (!trimmedPassword) {
    errors.password = 'Password is required';
  }
  return errors;
}
