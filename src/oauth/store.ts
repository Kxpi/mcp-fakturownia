import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { deleteJsonFile, loadJsonFile, saveJsonFile } from './persistence.js';

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
  expiresAt: number;
  used: boolean;
}

export interface RefreshToken {
  token: string;
  clientId: string;
  expiresAt: number;
}

type ClientsFile = { clients: Record<string, OAuthClient> };
type RefreshTokensFile = { refreshTokens: Record<string, RefreshToken> };

const clients = new Map<string, OAuthClient>();
const authCodes = new Map<string, AuthCode>();
const refreshTokens = new Map<string, RefreshToken>();

let clientsLoaded = false;
let refreshTokensLoaded = false;

function dataDir(): string {
  return process.env.OAUTH_DATA_DIR ?? '/data';
}

function clientsFilePath(): string {
  return path.join(dataDir(), 'clients.json');
}

function refreshTokensFilePath(): string {
  return path.join(dataDir(), 'refresh-tokens.json');
}

function ensureClientsLoaded(): void {
  if (clientsLoaded) {
    return;
  }
  clientsLoaded = true;
  const file = loadJsonFile<ClientsFile>(clientsFilePath(), { clients: {} });
  for (const [id, client] of Object.entries(file.clients)) {
    clients.set(id, client);
  }
}

function persistClients(): void {
  saveJsonFile(clientsFilePath(), {
    clients: Object.fromEntries(clients),
  });
}

function ensureRefreshTokensLoaded(): void {
  if (refreshTokensLoaded) {
    return;
  }
  refreshTokensLoaded = true;
  const file = loadJsonFile<RefreshTokensFile>(refreshTokensFilePath(), { refreshTokens: {} });
  for (const [token, entry] of Object.entries(file.refreshTokens)) {
    refreshTokens.set(token, entry);
  }
}

function persistRefreshTokens(): void {
  saveJsonFile(refreshTokensFilePath(), {
    refreshTokens: Object.fromEntries(refreshTokens),
  });
}

export function registerClient(input: {
  redirectUris: string[];
  clientName?: string;
}): OAuthClient {
  ensureClientsLoaded();
  const client: OAuthClient = {
    clientId: randomUUID(),
    redirectUris: input.redirectUris,
    clientName: input.clientName,
    createdAt: Math.floor(Date.now() / 1000),
  };
  clients.set(client.clientId, client);
  persistClients();
  return client;
}

export function getClient(clientId: string): OAuthClient | undefined {
  ensureClientsLoaded();
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

function purgeExpiredRefreshTokens() {
  const now = Date.now();
  let changed = false;
  for (const [token, entry] of refreshTokens.entries()) {
    if (entry.expiresAt < now) {
      refreshTokens.delete(token);
      changed = true;
    }
  }
  if (changed) {
    persistRefreshTokens();
  }
}

export function issueRefreshToken(clientId: string, ttlMs: number): RefreshToken {
  ensureRefreshTokensLoaded();
  purgeExpiredRefreshTokens();
  const entry: RefreshToken = {
    token: randomUUID(),
    clientId,
    expiresAt: Date.now() + ttlMs,
  };
  refreshTokens.set(entry.token, entry);
  persistRefreshTokens();
  return entry;
}

export function rotateRefreshToken(oldToken: string, ttlMs: number): RefreshToken | undefined {
  ensureRefreshTokensLoaded();
  purgeExpiredRefreshTokens();
  const existing = refreshTokens.get(oldToken);
  if (!existing || existing.expiresAt < Date.now()) {
    return undefined;
  }
  refreshTokens.delete(oldToken);
  const entry: RefreshToken = {
    token: randomUUID(),
    clientId: existing.clientId,
    expiresAt: Date.now() + ttlMs,
  };
  refreshTokens.set(entry.token, entry);
  persistRefreshTokens();
  return entry;
}

export function resetOAuthStore(): void {
  clients.clear();
  authCodes.clear();
  refreshTokens.clear();
  clientsLoaded = false;
  refreshTokensLoaded = false;
  deleteJsonFile(clientsFilePath());
  deleteJsonFile(refreshTokensFilePath());
}

/** @internal Test helper to simulate process restart without re-importing the module. */
export function reloadOAuthStoreFromDisk(): void {
  clients.clear();
  refreshTokens.clear();
  clientsLoaded = false;
  refreshTokensLoaded = false;
  ensureClientsLoaded();
  ensureRefreshTokensLoaded();
}
