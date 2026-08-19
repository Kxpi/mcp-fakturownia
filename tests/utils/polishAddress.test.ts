import { describe, it, expect } from 'vitest';
import { parsePolishAddress } from '../../src/utils/polishAddress.js';

describe('parsePolishAddress', () => {
  it('splits the standard street, postcode city form', () => {
    expect(parsePolishAddress('SŁONECZNA 7, 64-800 CHODZIEŻ')).toEqual({
      street: 'SŁONECZNA 7',
      postCode: '64-800',
      city: 'CHODZIEŻ',
      parsed: true,
    });
  });

  it('keeps unit numbers with / in the street part', () => {
    expect(parsePolishAddress('POWSTAŃCÓW WIELKOPOLSKICH 22/3, 64-800 CHODZIEŻ')).toEqual({
      street: 'POWSTAŃCÓW WIELKOPOLSKICH 22/3',
      postCode: '64-800',
      city: 'CHODZIEŻ',
      parsed: true,
    });
  });

  it('dumps unusual formats into street and marks unparsed', () => {
    expect(parsePolishAddress('LOKAL UŻYTKOWY W BUDYNKU PRZY RYNKU')).toEqual({
      street: 'LOKAL UŻYTKOWY W BUDYNKU PRZY RYNKU',
      postCode: '',
      city: '',
      parsed: false,
    });
  });

  it('treats empty as parsed-empty, not a parse failure', () => {
    expect(parsePolishAddress(null)).toEqual({
      street: '',
      postCode: '',
      city: '',
      parsed: true,
    });
  });
});
