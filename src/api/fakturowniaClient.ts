import { request } from 'undici';
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  AuthenticationError,
  FakturowniaError,
  isRetryableError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../utils/errors.js';
import { buildQueryParams, ENDPOINTS } from './endpoints.js';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;
const BACKOFF_MULTIPLIER = 2;

type QueryParams = Record<string, string | number | boolean | undefined>;

export class FakturowniaApiClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = config.fakturowniaBaseUrl;
    this.apiToken = config.fakturowniaApiToken;
    this.timeoutMs = config.requestTimeoutMs;
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    options: { query?: QueryParams; body?: unknown } = {},
  ): Promise<T> {
    const allQuery = { ...options.query, api_token: this.apiToken };
    const url = `${this.baseUrl}${endpoint}${buildQueryParams(allQuery)}`;

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(
          INITIAL_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1),
          MAX_DELAY_MS,
        );
        logger.warn({ attempt, delay, endpoint }, 'Retrying request');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

        const { statusCode, body: responseBody } = await request(url, {
          method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const text = await responseBody.text();

        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError();
        }
        if (statusCode === 404) {
          throw new NotFoundError();
        }
        if (statusCode === 429) {
          throw new RateLimitError();
        }
        if (statusCode === 422 || statusCode === 400) {
          let details: unknown;
          try {
            details = JSON.parse(text);
          } catch {
            details = text;
          }
          throw new ValidationError(`API validation error (${statusCode})`, details);
        }
        if (statusCode >= 500) {
          throw new ServerError(`Server error (${statusCode})`, statusCode);
        }

        if (!text || text.trim() === '') {
          return {} as T;
        }

        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error;

        if (error instanceof FakturowniaError && !isRetryableError(error)) {
          throw error;
        }

        if (
          error instanceof TypeError ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          lastError = new NetworkError(
            `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          if (attempt === MAX_RETRIES) throw lastError;
          continue;
        }

        if (error instanceof FakturowniaError && isRetryableError(error)) {
          if (attempt === MAX_RETRIES) throw error;
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  // Health
  async healthCheck(): Promise<unknown> {
    return this.makeRequest('GET', ENDPOINTS.invoices.list, {
      query: { per_page: 1, page: 1 },
    });
  }

  // Clients
  async listClients(query?: QueryParams): Promise<unknown[]> {
    const result = await this.makeRequest<unknown>(
      'GET',
      ENDPOINTS.clients.list,
      { query },
    );
    return Array.isArray(result) ? result : [];
  }

  async getClient(id: number): Promise<unknown> {
    return this.makeRequest('GET', ENDPOINTS.clients.get(id));
  }

  async createClient(data: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('POST', ENDPOINTS.clients.create, {
      body: { client: data },
    });
  }

  async updateClient(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('PUT', ENDPOINTS.clients.update(id), {
      body: { client: data },
    });
  }

  async deleteClient(id: number): Promise<unknown> {
    return this.makeRequest('DELETE', ENDPOINTS.clients.delete(id));
  }

  // Invoices
  async listInvoices(query?: QueryParams): Promise<unknown[]> {
    const result = await this.makeRequest<unknown>(
      'GET',
      ENDPOINTS.invoices.list,
      { query },
    );
    return Array.isArray(result) ? result : [];
  }

  async getInvoice(id: number): Promise<unknown> {
    return this.makeRequest('GET', ENDPOINTS.invoices.get(id));
  }

  async sendInvoiceToKsef(id: number): Promise<unknown> {
    return this.makeRequest('GET', ENDPOINTS.invoices.get(id), {
      query: { send_to_ksef: 'yes' },
    });
  }

  async createInvoice(data: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('POST', ENDPOINTS.invoices.create, {
      body: { invoice: data },
    });
  }

  async updateInvoice(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('PUT', ENDPOINTS.invoices.update(id), {
      body: { invoice: data },
    });
  }

  async deleteInvoice(id: number): Promise<unknown> {
    return this.makeRequest('DELETE', ENDPOINTS.invoices.delete(id));
  }

  async cancelInvoice(id: number): Promise<unknown> {
    return this.makeRequest('POST', ENDPOINTS.invoices.cancel(id));
  }

  async createPayment(data: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('POST', ENDPOINTS.payments.create, {
      body: { banking_payment: data },
    });
  }

  // Products
  async listProducts(query?: QueryParams): Promise<unknown[]> {
    const result = await this.makeRequest<unknown>(
      'GET',
      ENDPOINTS.products.list,
      { query },
    );
    return Array.isArray(result) ? result : [];
  }

  async getProduct(id: number): Promise<unknown> {
    return this.makeRequest('GET', ENDPOINTS.products.get(id));
  }

  async createProduct(data: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('POST', ENDPOINTS.products.create, {
      body: { product: data },
    });
  }

  async updateProduct(id: number, data: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('PUT', ENDPOINTS.products.update(id), {
      body: { product: data },
    });
  }

  async deleteProduct(id: number): Promise<unknown> {
    return this.makeRequest('DELETE', ENDPOINTS.products.delete(id));
  }
}
