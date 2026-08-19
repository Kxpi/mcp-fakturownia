export interface ParsedPolishAddress {
  street: string;
  postCode: string;
  city: string;
  /** false when the string is not `street, XX-XXX city` — dump it into street and review. */
  parsed: boolean;
}

/**
 * Parse MF VAT whitelist addresses (`workingAddress` / `residenceAddress`).
 * Standard form: `STREET NUMBER, XX-XXX CITY` (e.g. `SŁONECZNA 7, 64-800 CHODZIEŻ`).
 * Unit numbers with `/` in the street part are kept as-is. Formats without a
 * `XX-XXX` postcode after a comma cannot be split — `parsed` is false.
 */
export function parsePolishAddress(raw: string | null | undefined): ParsedPolishAddress {
  const value = raw?.trim() ?? '';
  if (!value) {
    return { street: '', postCode: '', city: '', parsed: true };
  }

  const match = value.match(/^(.+),\s*(\d{2}-\d{3})\s+(.+)$/);
  if (!match) {
    return { street: value, postCode: '', city: '', parsed: false };
  }

  return {
    street: match[1]!.trim(),
    postCode: match[2]!,
    city: match[3]!.trim(),
    parsed: true,
  };
}
