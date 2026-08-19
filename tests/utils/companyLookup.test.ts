import { describe, expect, it } from 'vitest';
import {
  buildCeidgSuggestedCreatePayload,
  buildVatSuggestedCreatePayload,
  ceidgLookupWarnings,
  resolveJdgDisplayName,
  vatLookupWarnings,
} from '../../src/utils/companyLookup.js';
import type { VatCompany } from '../../src/api/vatWhitelistClient.js';
import type { CeidgCompany } from '../../src/api/ceidgClient.js';

const activeVat: VatCompany = {
  name: 'KACPER WIŚNIEWSKI',
  nip: '6070095262',
  krs: null,
  street: 'SŁONECZNA 7',
  city: 'CHODZIEŻ',
  postCode: '64-800',
  addressParsed: true,
  statusVat: 'Czynny',
  accountNumbers: ['77109013170000000156952242'],
};

describe('resolveJdgDisplayName', () => {
  it('prefers CEIDG trade name over whitelist personal name', () => {
    const result = resolveJdgDisplayName(
      'KACPER WIŚNIEWSKI',
      'A7 SOLUTIONS KACPER WIŚNIEWSKI',
    );
    expect(result).toEqual({
      name: 'A7 SOLUTIONS KACPER WIŚNIEWSKI',
      nameSource: 'ceidg',
    });
  });

  it('falls back to whitelist personal name when CEIDG name is absent', () => {
    const result = resolveJdgDisplayName('KACPER WIŚNIEWSKI', null);
    expect(result).toEqual({
      name: 'KACPER WIŚNIEWSKI',
      nameSource: 'vat_whitelist',
    });
  });
});

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

  it('uses displayName override and records whitelist personal name in notes', () => {
    const payload = buildVatSuggestedCreatePayload(
      activeVat,
      '6070095262',
      '2026-08-19',
      'A7 SOLUTIONS KACPER WIŚNIEWSKI',
    );
    expect(payload.name).toBe('A7 SOLUTIONS KACPER WIŚNIEWSKI');
    expect(payload.notes).toContain('Whitelist personal name: KACPER WIŚNIEWSKI');
    expect(payload.bank_account).toBe('77109013170000000156952242');
  });
  it('omits bank_account when multiple verified accounts exist', () => {
    const payload = buildVatSuggestedCreatePayload(
      {
        ...activeVat,
        accountNumbers: ['111', '222'],
      },
      '6070095262',
      '2026-08-19',
    );
    expect(payload.bank_account).toBeUndefined();
  });

  it('omits address fields when whitelist address was not parsed', () => {
    const payload = buildVatSuggestedCreatePayload(
      {
        ...activeVat,
        street: 'LOKAL PRZY RYNKU',
        city: '',
        postCode: '',
        addressParsed: false,
      },
      '6070095262',
      '2026-08-19',
    );
    expect(payload.street).toBeUndefined();
    expect(payload.city).toBeUndefined();
    expect(payload.zip).toBeUndefined();
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
  it('returns no VAT whitelist warnings (removed payer, address, accounts handled silently)', () => {
    expect(vatLookupWarnings({ ...activeVat, statusVat: 'Niezarejestrowany' })).toEqual([]);
    expect(
      vatLookupWarnings({
        ...activeVat,
        addressParsed: false,
        accountNumbers: ['1', '2'],
      }),
    ).toEqual([]);
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
