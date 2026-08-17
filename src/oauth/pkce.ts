import { createHash } from 'node:crypto';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  const digest = createHash('sha256').update(codeVerifier).digest();
  const expected = base64UrlEncode(digest);
  return expected === codeChallenge;
}

export function createPkceChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
}
