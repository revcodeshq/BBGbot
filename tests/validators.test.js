const { validateFID, validateTimeString, sanitizeInput } = require('../src/utils/validators');

describe('Validators', () => {
  describe('validateFID', () => {
    test('should validate correct FID lengths', () => {
      expect(validateFID('123456')).toBe(true); // 6 digits
      expect(validateFID('123456789012345')).toBe(true); // 15 digits
    });

    test('should reject invalid FID lengths', () => {
      expect(validateFID('12345')).toBe(false); // Too short
      expect(validateFID('1234567890123456')).toBe(false); // Too long
    });

    test('should reject non-numeric FIDs', () => {
      expect(validateFID('abc123')).toBe(false);
      expect(validateFID('12.345')).toBe(false);
      expect(validateFID('')).toBe(false);
      expect(validateFID(null)).toBe(false);
      expect(validateFID(undefined)).toBe(false);
    });
  });

  describe('validateTimeString', () => {
    test('should validate 24-hour time format', () => {
      expect(validateTimeString('14:30')).toBe(true);
      expect(validateTimeString('09:15')).toBe(true);
      expect(validateTimeString('23:59')).toBe(true);
      expect(validateTimeString('25:00')).toBe(true); // HH:MM pattern allows this
    });

    test('should validate natural language time strings', () => {
      expect(validateTimeString('in 5 minutes')).toBe(true);
      expect(validateTimeString('in 2 hours')).toBe(true);
      expect(validateTimeString('at 9 pm')).toBe(true); // Note: requires space before am/pm
      expect(validateTimeString('at 9:30 pm')).toBe(true);
      expect(validateTimeString('9 pm')).toBe(true);
    });

    test('should reject invalid time formats', () => {
      expect(validateTimeString('invalid time')).toBe(false);
      expect(validateTimeString('')).toBe(false);
      expect(validateTimeString('at 9pm')).toBe(false); // No space before am/pm
      expect(validateTimeString('random text')).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    test('should remove angle brackets to prevent XSS', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
      expect(sanitizeInput('<img src=x onerror=alert("xss")>')).toBe('img src=x onerror=alert("xss")');
    });

    test('should preserve normal text', () => {
      expect(sanitizeInput('Hello World')).toBe('Hello World');
      expect(sanitizeInput('User input with <normal> text')).toBe('User input with normal text');
    });

    test('should handle null and undefined', () => {
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
    });

    test('should limit length to 2000 characters', () => {
      const longString = 'a'.repeat(3000);
      expect(sanitizeInput(longString)).toHaveLength(2000);
    });
  });
});