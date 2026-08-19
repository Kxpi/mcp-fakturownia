import { describe, expect, it } from 'vitest';
import {
  buildCeidgSuggestedCreatePayload,
  buildVatSuggestedCreatePayload,
  ceidgLookupWarnings,
  vatLookupWarnings,
} from '../../src/utils/companyLookup.js';
import type { VatCompany } from '../../src/api/vatWhitelistClient.js';
import type { CeidgCompany } from '../../src/api/ceidgClient.js';

const activeVat: VatCompany = {
  name: 'KACPER WIŚNIEWSKI',
  nip: '6070095262',
  street: 'SŁONECZNA 7',
  city: 'CHODZIEŻ',
  postCode: '64-800',
  addressParsed: true,
  statusVat: 'Czynny',
  accountNumbers: ['77109013170000000156952242'],
};

describe('buildVatSuggestedCreatePayload', () => {
  it('uses create_client field names, not Fakturownia API names', () => {
    const payload = buildVatSuggestedCreatePayload(activeVat, '6070095262', '2026-08-19');
    expect(payload).toMatchObject({
      name: 'KACPER WIŚNIEWSKI',
      nip: '6070095262',
      street: 'SŁONECZNA 7',
      city: 'CHODZIEŻ',
      zip: '64-800',
      country: 'PL',
      bank_account: '77109013170000000156952242',
    });
    expect(payload).toHaveProperty('notes');
    expect(payload).not.toHaveProperty('tax_no');
    expect(payload).not.toHaveProperty('post_code');
    expect(payload).not.toHaveProperty('note');
  });
});

describe('buildCeidgSuggestedCreatePayload', () => {
  it('uses create_client field names', () => {
    const company: CeidgCompany = {
      name: 'FOO BAR',
      nip: '1234563218',
      street: 'Main 1',
      city: 'Warsaw',
      postCode: '00-001',
      status: 'AKTYWNY',
    };
    const payload = buildCeidgSuggestedCreatePayload(company, '2026-08-19');
    expect(payload.zip).toBe('00-001');
    expect(payload.nip).toBe('1234563218');
    expect(payload.notes).toContain('CEIDG');
  });
});

describe('lookup warnings', () => {
  it('warns on Niezarejestrowany VAT status with a name', () => {
    const warnings = vatLookupWarnings({ ...activeVat, statusVat: 'Niezarejestrowany' });
    expect(warnings.some((w) => w.includes('Niezarejestrowany'))).toBe(true);
  });

  it('warns on inactive CEIDG status', () => {
    const warnings = ceidgLookupWarnings({
      name: 'X',
      nip: '1234563218',
      street: '',
      city: '',
      postCode: '',
      status: 'Wykreślony',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Wykreślony');
  });
});
