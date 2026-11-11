import { describe, expect, it } from 'vitest';
import { netBalances, rawDebtCount, settlementExpense, settleUp } from '../lib/balances';
import { buildDemoTrip } from '../lib/demo';

const rates = { EUR: 1, INR: 100 };

describe('simplified debts', () => {
  const trip = buildDemoTrip(new Date('2026-11-11T09:00:00Z'));
  const net = () => netBalances(trip.expenses, trip.travelers, 'EUR', rates);

  it('needs fewer payments than there are separate debts', () => {
    expect(rawDebtCount(trip.expenses, trip.travelers, 'EUR', rates)).toBe(3);
    expect(settleUp(net())).toHaveLength(2);
  });

  it('recording every suggested payment leaves everyone square', () => {
    const before = settleUp(net());
    for (const t of before) trip.expenses.push(settlementExpense(t, 'EUR', { from: t.from, to: t.to }, `s-${t.from}`));
    expect([...net().values()].every(v => v === 0)).toBe(true);
    expect(settleUp(net())).toHaveLength(0);
    expect(rawDebtCount(trip.expenses, trip.travelers, 'EUR', rates)).toBeGreaterThanOrEqual(0);
  });

  it('describes the payment in words', () => {
    const e = settlementExpense({ from: 'sam', to: 'you', amount: 10086 }, 'EUR', { from: 'Sam', to: 'T' }, 'x', new Date('2026-11-11T10:00:00Z'));
    expect(e).toMatchObject({ title: 'Sam paid T back', amount: 10086, payerId: 'sam', splitWith: ['you'], date: '2026-11-11' });
  });
});
