import { describe, it, expect } from 'vitest';
import { cleanNIP, isValidNIP } from '../../src/utils/nip.js';

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
