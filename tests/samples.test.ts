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

  it('has a booking about 75 minutes from now that fits the time of day, and one leg still to book', () => {
    const at = (iso: string) => buildDemoTrip(new Date(iso)).reservations.find(r => r.id === 'r-live')!;
    expect(at('2026-11-13T08:30:00Z').title).toMatch(/Rijksmuseum/);   // 09:30 in Amsterdam
    expect(at('2026-11-13T17:30:00Z').type).toBe('dinner');           // 18:30
    expect(at('2026-11-13T22:20:00Z').title).toMatch(/Jazz/);         // 23:20
    expect(at('2026-11-13T04:30:00Z').title).toMatch(/Sunrise/);      // 05:30
    const trip = buildDemoTrip(NOW);
    const rijks = trip.reservations.find(r => r.id === 'r-live')!;
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

describe('the demo clock', () => {
  it('walks the next booking from on track to leave soon, at risk and missed, at any time of day', async () => {
    const { liveStatus } = await import('../lib/live-status');
    const { DEMO_HOTEL } = await import('../lib/demo');
    for (const iso of ['2026-11-13T08:30:00Z', '2026-11-13T17:30:00Z', '2026-11-13T22:20:00Z', '2026-11-13T04:30:00Z', '2026-11-13T12:03:00Z']) {
      const now = new Date(iso);
      const r = buildDemoTrip(now).reservations.find(x => x.id === 'r-live')!;
      const at = (min: number) => liveStatus(r, new Date(now.getTime() + min * 60000), DEMO_HOTEL, { lat: r.lat!, lng: r.lng! })?.state;
      expect([at(0), at(55), at(70), at(90)], `${iso}: ${r.title}`).toEqual(['on-track', 'leave-soon', 'at-risk', 'missed']);
    }
  });
});
