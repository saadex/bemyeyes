/**
 * Unit tests: Login validation
 * Be My Eyes - automated test suite
 */
const { validateLoginFields } = require('../../utils/loginValidation');

describe('Unit: Login Validation', () => {
  describe('A) Email format', () => {
    it('1. Valid email format - no validation error', () => {
      const result = validateLoginFields({
        email: 'abc@gmail.com',
        password: 'Password123',
      });
      expect(result.email).toBeUndefined();
      expect(result.password).toBeUndefined();
    });

    it('2. Invalid email format - show email validation error', () => {
      const result = validateLoginFields({
        email: 'abc.gmail.com',
        password: 'Password123',
      });
      expect(result.email).toBe('Valid email is required');
    });

    it('invalid email without dot', () => {
      const result = validateLoginFields({
        email: 'abc@gmail',
        password: 'Password123',
      });
      expect(result.email).toBe('Valid email is required');
    });

    it('empty email', () => {
      const result = validateLoginFields({
        email: '',
        password: 'Password123',
      });
      expect(result.email).toBe('Valid email is required');
    });
  });

  describe('B) Password', () => {
    it('3. Incorrect password - validation only checks presence; wrong password is handled by Firebase', () => {
      const result = validateLoginFields({
        email: 'abc@gmail.com',
        password: 'wrongpass',
      });
      expect(result.email).toBeUndefined();
      expect(result.password).toBeUndefined();
    });

    it('empty password shows error', () => {
      const result = validateLoginFields({
        email: 'abc@gmail.com',
        password: '',
      });
      expect(result.password).toBe('Password is required');
    });
  });

  describe('C) Empty fields', () => {
    it('4. Empty email and password - highlight fields and show error', () => {
      const result = validateLoginFields({
        email: '',
        password: '',
      });
      expect(result.email).toBe('Valid email is required');
      expect(result.password).toBe('Password is required');
    });

    it('whitespace-only treated as empty', () => {
      const result = validateLoginFields({
        email: '   ',
        password: '   ',
      });
      expect(result.email).toBe('Valid email is required');
      expect(result.password).toBe('Password is required');
    });
  });
});
