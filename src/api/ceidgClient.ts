import { request } from 'undici';
import { logger } from '../logger.js';
import { FakturowniaError } from '../utils/errors.js';

const CEIDG_BASE_URL = 'https://dane.biznes.gov.pl/api/ceidg/v3/firmy';

export interface CeidgCompany {
  name: string;
  nip: string;
  street: string;
  city: string;
  postCode: string;
  status: string;
  startDate?: string;
}

export class CeidgClient {
  private readonly apiToken: string | undefined;

  constructor(apiToken?: string) {
    this.apiToken = apiToken;
  }

  async getCompanyByNip(nip: string): Promise<CeidgCompany> {
    if (!this.apiToken) {
      throw new FakturowniaError(
        'CEIDG API token not configured. Set CEIDG_API_TOKEN to enable lookup_company_by_nip fallback for NIPs that were never VAT-registered.',
      );
    }

    const url = `${CEIDG_BASE_URL}?nip=${nip}`;

    try {
      const { statusCode, body } = await request(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      const text = await body.text();

      if (statusCode === 301 || statusCode === 302 || statusCode === 303) {
        throw new FakturowniaError(
          'CEIDG API is unavailable (redirect detected). The service may be under maintenance. Try again later.',
          statusCode,
        );
      }

      if (statusCode === 401 || statusCode === 403) {
        throw new FakturowniaError(
          'CEIDG authentication failed — check your CEIDG_API_TOKEN',
          statusCode,
        );
      }

      if (statusCode === 404 || statusCode === 204) {
        throw new FakturowniaError(`No company found in CEIDG for NIP ${nip}`, 404);
      }

      if (statusCode >= 500) {
        throw new FakturowniaError(`CEIDG server error (${statusCode})`, statusCode);
      }

      if (statusCode !== 200) {
        throw new FakturowniaError(
          `CEIDG unexpected response (${statusCode}): ${text}`,
          statusCode,
        );
      }

      const data = JSON.parse(text);
      const firmy = data.firmy;

      if (!Array.isArray(firmy) || firmy.length === 0) {
        throw new FakturowniaError(`No company found in CEIDG for NIP ${nip}`, 404);
      }

      const firma = firmy[0];
      const address = firma.adresDzialalnosci || {};

      let street = address.ulica || '';
      if (address.budynek) {
        street += (street ? ' ' : '') + address.budynek;
        if (address.lokal) street += `/${address.lokal}`;
      }

      const company: CeidgCompany = {
        name: firma.nazwa || '',
        nip: firma.wlasciciel?.nip || nip,
        street,
        city: address.miasto || '',
        postCode: address.kod || '',
        status: firma.status || 'UNKNOWN',
        startDate: firma.dataRozpoczecia,
      };

      logger.info({ nip, name: company.name, status: company.status }, 'CEIDG company fetched');
      return company;
    } catch (error) {
      if (error instanceof FakturowniaError) throw error;

      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
        throw new FakturowniaError(
          `CEIDG request failed: ${(error as Error).message}`,
          undefined,
          undefined,
          true,
        );
      }

      throw new FakturowniaError(`Unexpected error fetching CEIDG data: ${error}`);
    }
  }
}
