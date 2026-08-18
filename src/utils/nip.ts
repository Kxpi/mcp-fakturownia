const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const;

export function cleanNIP(nip: string): string {
  return nip.replace(/[^0-9]/g, '');
}

export function isValidNIP(nip: string): boolean {
  const cleaned = cleanNIP(nip);
  if (cleaned.length !== 10) return false;

  const digits = cleaned.split('').map(Number);
  const checksum = NIP_WEIGHTS.reduce((sum, weight, i) => sum + weight * digits[i]!, 0);

  return checksum % 11 === digits[9];
}
