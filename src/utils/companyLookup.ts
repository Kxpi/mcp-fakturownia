import type { CeidgCompany } from '../api/ceidgClient.js';
import { buildVatImportNote, type VatCompany } from '../api/vatWhitelistClient.js';

export type CompanyLookupSource = 'vat_whitelist' | 'ceidg';
export type JdgNameSource = 'ceidg' | 'vat_whitelist';

export interface SuggestedCreatePayload {
  name: string;
  nip: string;
  street?: string;
  city?: string;
  zip?: string;
  country: string;
  bank_account?: string;
  notes: string;
}

export function resolveJdgDisplayName(
  vatName: string,
  ceidgName: string | null | undefined,
): { name: string; nameSource: JdgNameSource } {
  const trimmed = ceidgName?.trim();
  if (trimmed) {
    return { name: trimmed, nameSource: 'ceidg' };
  }
  return { name: vatName, nameSource: 'vat_whitelist' };
}

export function buildVatSuggestedCreatePayload(
  company: VatCompany,
  nip: string,
  today: string,
  displayName?: string,
): SuggestedCreatePayload {
  const name = displayName ?? company.name;
  let notes = buildVatImportNote(company, today);
  if (displayName && displayName !== company.name) {
    notes += ` Whitelist personal name: ${company.name}.`;
  }

  return {
    name,
    nip,
    street: company.street || undefined,
    city: company.city || undefined,
    zip: company.postCode || undefined,
    country: 'PL',
    bank_account: company.accountNumbers[0],
    notes,
  };
}

export function buildCeidgSuggestedCreatePayload(
  company: CeidgCompany,
  today: string,
): SuggestedCreatePayload {
  return {
    name: company.name,
    nip: company.nip,
    street: company.street || undefined,
    city: company.city || undefined,
    zip: company.postCode || undefined,
    country: 'PL',
    notes: `[Auto-imported from CEIDG on ${today}. Status: ${company.status}. VAT whitelist had no identity data (never VAT-registered).]`,
  };
}

export function vatLookupWarnings(company: VatCompany): string[] {
  const warnings: string[] = [];
  if (company.statusVat === 'Niezarejestrowany') {
    warnings.push(
      'VAT status is Niezarejestrowany — entity was VAT-registered before (removed payer), not a lookup miss.',
    );
  }
  if (!company.addressParsed) {
    warnings.push(
      'Address could not be split into street/postcode/city — review suggested_create_payload before create_client.',
    );
  }
  if (company.accountNumbers.length > 1) {
    warnings.push(
      `Multiple verified accounts on file (${company.accountNumbers.length}); first account is in suggested_create_payload.`,
    );
  }
  return warnings;
}

export function ceidgLookupWarnings(company: CeidgCompany): string[] {
  if (company.status === 'AKTYWNY') return [];
  return [
    `CEIDG status is ${company.status} (not AKTYWNY) — confirm with user before create_client.`,
  ];
}
