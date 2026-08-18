import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPkceS256 } from '../../src/oauth/pkce.js';

function createPkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest().toString('base64url');
}

describe('pkce', () => {
  it('verifies a valid S256 challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = createPkceChallenge(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it('rejects an invalid verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = createPkceChallenge(verifier);
    expect(verifyPkceS256('wrong-verifier', challenge)).toBe(false);
  });
});
