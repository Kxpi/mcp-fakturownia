export class FakturowniaError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FakturowniaError';
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export class AuthenticationError extends FakturowniaError {
  constructor(message = 'Authentication failed — check your API token') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends FakturowniaError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends FakturowniaError {
  constructor(
    message = 'Rate limit exceeded — try again later',
    public readonly retryAfterMs?: number,
  ) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends FakturowniaError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

export class ServerError extends FakturowniaError {
  constructor(message = 'Fakturownia server error', statusCode = 500) {
    super(message, statusCode);
    this.name = 'ServerError';
  }
}

export class NetworkError extends FakturowniaError {
  constructor(message = 'Network error communicating with Fakturownia') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class CeidgError extends FakturowniaError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = 'CeidgError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof ServerError) return true;
  if (error instanceof NetworkError) return true;
  return false;
}
