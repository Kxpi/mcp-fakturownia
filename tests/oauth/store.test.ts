import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getClient,
  registerClient,
  reloadOAuthStoreFromDisk,
  resetOAuthStore,
} from '../../src/oauth/store.js';

describe('oauth store persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `oauth-store-${Date.now()}-${Math.random()}`);
    process.env.OAUTH_DATA_DIR = tempDir;
    resetOAuthStore();
  });

  afterEach(() => {
    resetOAuthStore();
    delete process.env.OAUTH_DATA_DIR;
  });

  it('persists registered clients to disk and reloads them', () => {
    const client = registerClient({
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
      clientName: 'Claude',
    });

    const clientsPath = path.join(tempDir, 'clients.json');
    expect(existsSync(clientsPath)).toBe(true);

    reloadOAuthStoreFromDisk();

    expect(getClient(client.clientId)?.clientName).toBe('Claude');
  });
});
