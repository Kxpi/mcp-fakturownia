import { describe, it, expect } from 'vitest';
import {
  roundMoney,
  parseMoney,
  calculateGrossFromNet,
  calculateNetFromGross,
  calculateVatAmount,
  formatMoney,
} from '../../src/utils/money.js';

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(1.005)).toBe(1);
    expect(roundMoney(1.235)).toBe(1.24);
    expect(roundMoney(100)).toBe(100);
    expect(roundMoney(99.999)).toBe(100);
  });
});

describe('parseMoney', () => {
  it('parses numbers and locale strings', () => {
    expect(parseMoney(123.45)).toBe(123.45);
    expect(parseMoney('0,00')).toBe(0);
    expect(parseMoney('1 234,50')).toBe(1234.5);
    expect(parseMoney(undefined)).toBe(0);
  });
});

describe('calculateGrossFromNet', () => {
  it('calculates 23% VAT correctly', () => {
    expect(calculateGrossFromNet(100, 23)).toBe(123);
    expect(calculateGrossFromNet(81.30, 23)).toBe(100);
  });

  it('calculates 8% VAT correctly', () => {
    expect(calculateGrossFromNet(100, 8)).toBe(108);
  });

  it('handles 0% VAT', () => {
    expect(calculateGrossFromNet(100, 0)).toBe(100);
  });
});

describe('calculateNetFromGross', () => {
  it('reverses gross to net at 23%', () => {
    expect(calculateNetFromGross(123, 23)).toBe(100);
  });

  it('reverses gross to net at 8%', () => {
    expect(calculateNetFromGross(108, 8)).toBe(100);
  });
});

describe('calculateVatAmount', () => {
  it('calculates VAT portion', () => {
    expect(calculateVatAmount(100, 23)).toBe(23);
    expect(calculateVatAmount(100, 8)).toBe(8);
    expect(calculateVatAmount(100, 0)).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats to 2 decimal places', () => {
    expect(formatMoney(100)).toBe('100.00');
    expect(formatMoney(99.1)).toBe('99.10');
    expect(formatMoney(0.5)).toBe('0.50');
  });
});
