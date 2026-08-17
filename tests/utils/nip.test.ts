import { describe, it, expect } from 'vitest';
import { cleanNIP, isValidNIP, formatNIP } from '../../src/utils/nip.js';

describe('cleanNIP', () => {
  it('removes dashes and spaces', () => {
    expect(cleanNIP('123-456-32-18')).toBe('1234563218');
    expect(cleanNIP('123 456 32 18')).toBe('1234563218');
  });

  it('returns digits only', () => {
    expect(cleanNIP('PL1234563218')).toBe('1234563218');
  });
});

describe('isValidNIP', () => {
  it('accepts valid NIP', () => {
    expect(isValidNIP('1234563218')).toBe(true);
    expect(isValidNIP('123-456-32-18')).toBe(true);
  });

  it('rejects invalid checksum', () => {
    expect(isValidNIP('1234563219')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidNIP('123456321')).toBe(false);
    expect(isValidNIP('12345632180')).toBe(false);
    expect(isValidNIP('')).toBe(false);
  });
});

describe('formatNIP', () => {
  it('formats 10-digit NIP with dashes', () => {
    expect(formatNIP('1234563218')).toBe('123-456-32-18');
  });

  it('handles already-formatted input', () => {
    expect(formatNIP('123-456-32-18')).toBe('123-456-32-18');
  });

  it('returns cleaned string for invalid length', () => {
    expect(formatNIP('12345')).toBe('12345');
  });
});
