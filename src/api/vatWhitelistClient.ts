import { request } from 'undici';
import { logger } from '../logger.js';
import { getToday } from '../utils/dates.js';
import { FakturowniaError } from '../utils/errors.js';
import { parsePolishAddress } from '../utils/polishAddress.js';

const VAT_WHITELIST_BASE = 'https://wl-api.mf.gov.pl/api/search/nip';
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

export interface VatSubject {
  name: string | null;
  nip: string;
  statusVat: string | null;
  residenceAddress: string | null;
  workingAddress: string | null;
  accountNumbers?: string[] | null;
  registrationDenialBasis?: string | null;
  registrationDenialDate?: string | null;
  removalBasis?: string | null;
  removalDate?: string | null;
}

export interface VatCompany {
  name: string;
  nip: string;
  street: string;
  city: string;
  postCode: string;
  addressParsed: boolean;
  statusVat: string;
  accountNumbers: string[];
  removalBasis?: string;
  removalDate?: string;
  registrationDenialBasis?: string;
  registrationDenialDate?: string;
}

/**
 * Usable whitelist hit = subject has a name.
 * `statusVat === "Niezarejestrowany"` is NOT empty: removed payers still have identity data.
 * Empty shell (never VAT-registered) is `subject == null` or `subject.name == null`.
 */
export function mapVatSubject(subject: VatSubject | null | undefined): VatCompany | null {
  if (!subject?.name?.trim()) return null;

  const address = parsePolishAddress(subject.workingAddress ?? subject.residenceAddress ?? null);

  return {
    name: subject.name.trim(),
    nip: subject.nip,
    street: address.street,
    city: address.city,
    postCode: address.postCode,
    addressParsed: address.parsed,
    statusVat: subject.statusVat || 'unknown',
    accountNumbers: subject.accountNumbers ?? [],
    removalBasis: subject.removalBasis ?? undefined,
    removalDate: subject.removalDate ?? undefined,
    registrationDenialBasis: subject.registrationDenialBasis ?? undefined,
    registrationDenialDate: subject.registrationDenialDate ?? undefined,
  };
}

export function buildVatImportNote(company: VatCompany, today: string): string {
  const parts = [
    `[Auto-imported from VAT Whitelist on ${today}. VAT status: ${company.statusVat}]`,
  ];
  if (company.removalBasis || company.removalDate) {
    parts.push(
      `Removal: ${[company.removalBasis, company.removalDate].filter(Boolean).join(' / ')}`,
    );
  }
  if (company.registrationDenialBasis || company.registrationDenialDate) {
    parts.push(
      `Registration denial: ${[company.registrationDenialBasis, company.registrationDenialDate].filter(Boolean).join(' / ')}`,
    );
  }
  if (company.accountNumbers.length) {
    parts.push(`Verified accounts: ${company.accountNumbers.join(', ')}`);
  }
  if (!company.addressParsed) {
    parts.push(
      'Address could not be split into street/postcode/city (unusual format — review manually).',
    );
  }
  return parts.join(' ');
}

export class VatWhitelistClient {
  // ponytail: process-local map keyed by nip+date; MF cap is ~10 req/IP/day
  private readonly cache = new Map<string, VatCompany | null>();

  async getCompanyByNip(nip: string): Promise<VatCompany | null> {
    const date = getToday();
    const key = `${nip}:${date}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const company = await this.fetchCompanyByNip(nip, date);
    this.cache.set(key, company);
    return company;
  }

  private async fetchCompanyByNip(nip: string, date: string): Promise<VatCompany | null> {
    const url = `${VAT_WHITELIST_BASE}/${nip}?date=${date}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(INITIAL_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
        logger.warn({ attempt, delay, nip }, 'Retrying VAT whitelist request');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const { statusCode, body } = await request(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        const text = await body.text();

        if (statusCode === 429) {
          lastError = new FakturowniaError(
            'VAT whitelist rate limit exceeded — try again later',
            429,
            undefined,
            true,
          );
          continue;
        }

        if (statusCode >= 500) {
          lastError = new FakturowniaError(
            `VAT whitelist server error (${statusCode})`,
            statusCode,
            undefined,
            true,
          );
          continue;
        }

        if (statusCode === 404) {
          return null;
        }

        if (statusCode !== 200) {
          throw new FakturowniaError(
            `VAT whitelist unexpected response (${statusCode}): ${text}`,
            statusCode,
          );
        }

        const data = JSON.parse(text) as { result?: { subject?: VatSubject | null } };
        const company = mapVatSubject(data.result?.subject);
        logger.info(
          { nip, found: !!company, statusVat: company?.statusVat },
          'VAT whitelist lookup',
        );
        return company;
      } catch (error) {
        if (error instanceof FakturowniaError && !error.retryable) throw error;

        if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
          lastError = new FakturowniaError(
            `VAT whitelist request failed: ${(error as Error).message}`,
            undefined,
            undefined,
            true,
          );
          continue;
        }

        if (error instanceof FakturowniaError && error.retryable) {
          lastError = error;
          continue;
        }

        throw new FakturowniaError(`Unexpected error fetching VAT whitelist data: ${error}`);
      }
    }

    throw lastError;
  }
}
