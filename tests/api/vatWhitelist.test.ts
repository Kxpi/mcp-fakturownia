import { describe, it, expect } from 'vitest';
import {
  buildVatImportNote,
  isJdg,
  mapVatSubject,
  type VatSubject,
} from '../../src/api/vatWhitelistClient.js';

const removedPayer: VatSubject = {
  name: 'MAKSYMILIAN PŁYWACZYK',
  nip: '6070097574',
  krs: null,
  statusVat: 'Niezarejestrowany',
  residenceAddress: 'POWSTAŃCÓW WIELKOPOLSKICH 22, 64-800 CHODZIEŻ',
  workingAddress: null,
  accountNumbers: [],
  removalBasis: 'Art. 96 ust. 9a pkt 1',
  removalDate: '2026-06-26',
};

const activePayer: VatSubject = {
  name: 'KACPER WIŚNIEWSKI',
  nip: '6070095262',
  krs: null,
  statusVat: 'Czynny',
  residenceAddress: 'SŁONECZNA 7, 64-800 CHODZIEŻ',
  workingAddress: null,
  accountNumbers: ['77109013170000000156952242'],
};

const neverRegistered: VatSubject = {
  name: null,
  nip: 'XXXXXXXXXX',
  krs: null,
  statusVat: 'Niezarejestrowany',
  residenceAddress: null,
  workingAddress: null,
  accountNumbers: [],
};

describe('mapVatSubject', () => {
  it('keeps Niezarejestrowany payers that still have a name (removed, not never-registered)', () => {
    const company = mapVatSubject(removedPayer);
    expect(company).not.toBeNull();
    expect(company!.name).toBe('MAKSYMILIAN PŁYWACZYK');
    expect(company!.krs).toBeNull();
    expect(company!.statusVat).toBe('Niezarejestrowany');
    expect(company!.street).toBe('POWSTAŃCÓW WIELKOPOLSKICH 22');
    expect(company!.postCode).toBe('64-800');
    expect(company!.city).toBe('CHODZIEŻ');
    expect(company!.removalBasis).toBe('Art. 96 ust. 9a pkt 1');
  });

  it('maps an active payer including verified account numbers', () => {
    const company = mapVatSubject(activePayer);
    expect(company!.statusVat).toBe('Czynny');
    expect(company!.accountNumbers).toEqual(['77109013170000000156952242']);
  });

  it('returns null for a never-registered empty shell (name is null)', () => {
    expect(mapVatSubject(neverRegistered)).toBeNull();
  });

  it('returns null when subject itself is null', () => {
    expect(mapVatSubject(null)).toBeNull();
  });

  it('prefers workingAddress over residenceAddress', () => {
    const company = mapVatSubject({
      name: 'FOO SP. Z O.O.',
      nip: '1234563218',
      krs: '0000123456',
      statusVat: 'Czynny',
      workingAddress: 'MARSZAŁKOWSKA 1, 00-001 WARSZAWA',
      residenceAddress: 'SŁONECZNA 7, 64-800 CHODZIEŻ',
    });
    expect(company!.city).toBe('WARSZAWA');
    expect(company!.street).toBe('MARSZAŁKOWSKA 1');
    expect(company!.krs).toBe('0000123456');
  });
});

describe('isJdg', () => {
  it('returns true when krs is null', () => {
    expect(isJdg(mapVatSubject(activePayer)!)).toBe(true);
  });

  it('returns false when krs is set', () => {
    const company = mapVatSubject({
      name: 'FOO SP. Z O.O.',
      nip: '1234563218',
      krs: '0000123456',
      statusVat: 'Czynny',
      residenceAddress: null,
      workingAddress: 'MARSZAŁKOWSKA 1, 00-001 WARSZAWA',
    });
    expect(isJdg(company!)).toBe(false);
  });
});

describe('buildVatImportNote', () => {
  it('includes VAT status, removal, and accounts', () => {
    const note = buildVatImportNote(mapVatSubject(removedPayer)!, '2026-08-19');
    expect(note).toContain('VAT status: Niezarejestrowany');
    expect(note).toContain('Art. 96 ust. 9a pkt 1');
    expect(note).toContain('2026-06-26');
  });
});
