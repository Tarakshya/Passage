import { describe, expect, it } from 'vitest';
import { netBalances } from '../lib/balances';
import { expenseIdFor } from '../lib/booking-ledger';
import { buildDemoTrip, buildPastTrip, DEMO_TOKEN, PAST_TOKEN } from '../lib/demo';
import { summaryStatus, tripSummary } from '../lib/home';
import { parseTrip } from '../lib/schema';

const NOW = new Date('2026-11-13T08:30:00Z');

describe('the sample trips', () => {
  it('are valid trips', () => {
    expect(() => parseTrip(buildDemoTrip(NOW))).not.toThrow();
    expect(() => parseTrip(buildPastTrip(NOW))).not.toThrow();
    expect(buildDemoTrip(NOW).token).toBe(DEMO_TOKEN);
    expect(buildPastTrip(NOW).token).toBe(PAST_TOKEN);
  });

  it('Amsterdam–Hvar is always Day 2, in Amsterdam', () => {
    for (const now of [NOW, new Date('2027-03-01T21:00:00Z'), new Date('2027-07-15T05:00:00Z')]) {
      const st = summaryStatus(tripSummary(buildDemoTrip(now)), now);
      expect(st.phase).toBe('now');
      expect(st.text).toMatch(/^Day 2 of /);
      expect(st.city?.name).toBe('Amsterdam');
    }
  });

  it('has Rijksmuseum tickets about 75 minutes from now, and one leg still to book', () => {
    const trip = buildDemoTrip(NOW);
    const rijks = trip.reservations.find(r => r.id === 'r-rijks')!;
    expect(rijks.startLocal > '2026-11-13T10:40').toBe(true); // 09:30 Amsterdam + 75 min, rounded up
    expect(rijks.startLocal <= '2026-11-13T10:50').toBe(true);
    const unbooked = trip.legs.filter(l => !trip.reservations.some(r => r.legId === l.id));
    expect(unbooked.map(l => l.id)).toEqual(['leg-mil-hvr']);
  });

  it('logs every paid booking in the Ledger once, under the id the app uses', () => {
    for (const trip of [buildDemoTrip(NOW), buildPastTrip(NOW)]) {
      for (const r of trip.reservations.filter(r => r.status === 'booked' && r.price)) {
        expect(trip.expenses.filter(e => e.id === expenseIdFor(r.id))).toHaveLength(1);
      }
    }
  });

  it('Austria–Croatia is completed, fully booked and settled up', () => {
    const trip = buildPastTrip(NOW);
    expect(summaryStatus(tripSummary(trip), NOW)).toMatchObject({ phase: 'past', text: 'Completed' });
    expect(trip.reservations.every(r => r.status === 'booked')).toBe(true);
    for (const v of netBalances(trip.expenses, trip.travelers, 'EUR', {}).values()) expect(v).toBe(0);
  });
});

describe('a phone that saved the old sample', () => {
  it('gets the new one when it opens the sample again', async () => {
    const mem = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
    const { buildDemoTrip: oldSample } = await import('./fixtures/austria-demo');
    mem.set('passage:trip:demo', JSON.stringify({ trip: oldSample(new Date()), seededAt: Date.now() }));
    const { LocalStore } = await import('../lib/store');
    const trip = await new LocalStore().load('demo');
    expect(trip?.name).toBe('Amsterdam–Hvar');
  });
});
