import { createHash } from 'node:crypto';

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const expected = createHash('sha256').update(codeVerifier).digest().toString('base64url');
  return expected === codeChallenge;
}
