import { describe, expect, it } from 'vitest';
import {
  lookupCompanyByNipInputSchema,
  getClientByNipInputSchema,
} from '../../src/schemas/clients.js';

describe('nip input schemas', () => {
  it('accepts NIP as a string in lookup_company_by_nip', () => {
    const result = lookupCompanyByNipInputSchema.parse({ nip: '1234563218' });
    expect(result.nip).toBe('1234563218');
  });

  it('accepts NIP as a number in lookup_company_by_nip', () => {
    const result = lookupCompanyByNipInputSchema.parse({ nip: 1234563218 });
    expect(result.nip).toBe('1234563218');
  });

  it('accepts dashed string NIP in get_client_by_nip', () => {
    const result = getClientByNipInputSchema.parse({ nip: '123-456-32-18' });
    expect(result.nip).toBe('1234563218');
  });
});
