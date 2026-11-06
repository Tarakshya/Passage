import { describe, expect, it } from 'vitest';
import { convert, fmtMoney, netBalances, parseMoney, settleUp, splitEvenly, totalsByCurrency } from '../lib/balances';
import { buildDemoTrip } from '../lib/demo';

describe('money', () => {
  it('splits without losing cents', () => {
    expect(splitEvenly(5800, 3)).toEqual([1934, 1933, 1933]);
    expect(splitEvenly(100, 3).reduce((a, b) => a + b)).toBe(100);
  });
  it('converts INR to EUR', () => {
    expect(convert(240000, 'INR', 'EUR', { INR: 100 })).toBe(2400); // ₹2,400 → €24.00
    expect(() => convert(100, 'GBP', 'EUR', {})).toThrow();
  });
  it('formats and parses amounts', () => {
    expect(fmtMoney(7250, 'EUR', { sign: true })).toBe('+€72.50');
    expect(fmtMoney(-5200, 'EUR')).toBe('−€52.00');
    expect(fmtMoney(920000, 'INR')).toBe('₹9,200');
    expect(parseMoney('62,00', 'EUR')).toBe(6200);
    expect(parseMoney('1,200.50', 'EUR')).toBe(120050);
    expect(parseMoney('abc', 'EUR')).toBeNull();
    expect(parseMoney('0', 'EUR')).toBeNull();
  });
});

describe('demo trip balances (hand-worked)', () => {
  const trip = buildDemoTrip(new Date('2026-11-04T09:00:00Z'));
  const rates = { EUR: 1, INR: 100 };
  // Miiro €120 paid by You, split You+Sam      → You +60, Sam −60
  // Train €96.40 paid by You, split You+Sam     → You +48.20, Sam −48.20
  // Dinner €58 (pending €62 ignored) by Priya, 3 ways → Priya +38.66, You −19.34, Sam −19.33
  // Taxi ₹2,400 = €24 by You, split You+Priya   → You +12, Priya −12
  const net = netBalances(trip.expenses, trip.travelers, 'EUR', rates);
  it('nets each traveler', () => {
    expect(net.get('you')).toBe(6000 + 4820 - 1934 + 1200); // €100.86
    expect(net.get('sam')).toBe(-6000 - 4820 - 1933); // −€127.53
    expect(net.get('priya')).toBe(5800 - 1933 - 1200); // 2667
    expect([...net.values()].reduce((a, b) => a + b)).toBe(0);
  });
  it('settles up in the fewest payments', () => {
    const t = settleUp(net);
    expect(t).toEqual([
      { from: 'sam', to: 'you', amount: 10086 },
      { from: 'sam', to: 'priya', amount: 2667 },
    ]);
  });
  it('totals per currency', () => {
    expect(totalsByCurrency(trip.expenses, 'EUR')).toEqual([['EUR', 27440], ['INR', 240000]]);
  });
});
