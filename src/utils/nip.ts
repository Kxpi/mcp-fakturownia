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

export function formatNIP(nip: string): string {
  const cleaned = cleanNIP(nip);
  if (cleaned.length !== 10) return cleaned;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 8)}-${cleaned.slice(8)}`;
}
