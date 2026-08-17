import { randomUUID } from 'node:crypto';

export interface OAuthClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

export interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string;
  state?: string;
  expiresAt: number;
  used: boolean;
}

const clients = new Map<string, OAuthClient>();
const authCodes = new Map<string, AuthCode>();

export function registerClient(input: {
  redirectUris: string[];
  clientName?: string;
}): OAuthClient {
  const client: OAuthClient = {
    clientId: randomUUID(),
    redirectUris: input.redirectUris,
    clientName: input.clientName,
    createdAt: Math.floor(Date.now() / 1000),
  };
  clients.set(client.clientId, client);
  return client;
}

export function getClient(clientId: string): OAuthClient | undefined {
  return clients.get(clientId);
}

export function createAuthCode(
  input: Omit<AuthCode, 'code' | 'expiresAt' | 'used'>,
  ttlMs: number,
): AuthCode {
  purgeExpiredCodes();
  const authCode: AuthCode = {
    ...input,
    code: randomUUID(),
    expiresAt: Date.now() + ttlMs,
    used: false,
  };
  authCodes.set(authCode.code, authCode);
  return authCode;
}

export function consumeAuthCode(code: string): AuthCode | undefined {
  purgeExpiredCodes();
  const authCode = authCodes.get(code);
  if (!authCode || authCode.used || authCode.expiresAt < Date.now()) {
    return undefined;
  }
  authCode.used = true;
  return authCode;
}

function purgeExpiredCodes() {
  const now = Date.now();
  for (const [code, entry] of authCodes.entries()) {
    if (entry.expiresAt < now || entry.used) {
      authCodes.delete(code);
    }
  }
}

export function resetOAuthStore() {
  clients.clear();
  authCodes.clear();
}
