export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Fakturownia returns amounts as numbers or locale strings like "0,00". */
export function parseMoney(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  return Number(value.replace(/\s/g, '').replace(',', '.')) || 0;
}

export function calculateGrossFromNet(net: number, vatRate: number): number {
  return roundMoney(net * (1 + vatRate / 100));
}

export function calculateNetFromGross(gross: number, vatRate: number): number {
  return roundMoney(gross / (1 + vatRate / 100));
}

export function calculateVatAmount(net: number, vatRate: number): number {
  return roundMoney(net * (vatRate / 100));
}

export function formatMoney(amount: number): string {
  return amount.toFixed(2);
}
