import { describe, it, expect } from 'vitest';
import { roundMoney, parseMoney, calculateGrossFromNet } from '../../src/utils/money.js';

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
    expect(calculateGrossFromNet(81.3, 23)).toBe(100);
  });

  it('calculates 8% VAT correctly', () => {
    expect(calculateGrossFromNet(100, 8)).toBe(108);
  });

  it('handles 0% VAT', () => {
    expect(calculateGrossFromNet(100, 0)).toBe(100);
  });
});
