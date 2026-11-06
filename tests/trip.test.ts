import { describe, expect, it } from 'vitest';
import { buildDemoTrip } from '../lib/demo';
import { bookingProgress, currentStop, timeline, tripCountdown, tripDates } from '../lib/trip';
import { liveStatus } from '../lib/live-status';
import { zonedToInstant } from '../lib/time';

const now = new Date('2026-11-04T09:00:00Z');
const trip = buildDemoTrip(now);

describe('demo trip', () => {
  it('always opens on Day 1, just landed in Vienna', () => {
    expect(currentStop(trip, now)?.name).toBe('Vienna');
    expect(tripCountdown(trip, now)).toBe('Day 1 of 14');
    expect(tripDates(trip)!.nights).toBe(13);
  });
  it('builds the timeline home → 5 stops → home with 6 legs', () => {
    const t = timeline(trip);
    expect(t.filter(i => i.kind === 'stop')).toHaveLength(5);
    expect(t.filter(i => i.kind === 'leg')).toHaveLength(6);
    expect(t[0].kind).toBe('home');
    expect(t.at(-1)!.kind).toBe('home');
  });
  it('has already landed: the outbound flight ended before now', () => {
    const out = trip.reservations.find(r => r.id === 'r-out')!;
    expect(zonedToInstant(out.endLocal!, out.endTz!).getTime()).toBeLessThan(now.getTime());
  });
  it('counts 4 of 11 booked (Vienna stay + 3 legs)', () => {
    expect(bookingProgress(trip)).toEqual({ booked: 4, total: 11 });
  });
  it('starts today\'s Belvedere visit on track, and the demo clock walks it to at risk', () => {
    const b = trip.reservations.find(r => r.id === 'r-belvedere')!;
    const at = (min: number) => liveStatus(b, new Date(now.getTime() + min * 60000), { lat: 48.2027, lng: 16.3563 }, { lat: b.lat!, lng: b.lng! })!.state;
    expect(at(0)).toBe('on-track');
    expect(at(30)).toBe('leave-soon');
    expect(at(70)).toBe('at-risk');
    expect(at(90)).toBe('missed');
  });
});
