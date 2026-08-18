export class FakturowniaError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: unknown,
    public readonly retryable = false,
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

export function isRetryableError(error: unknown): boolean {
  return error instanceof FakturowniaError && error.retryable;
}
