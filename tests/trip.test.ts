import { describe, expect, it } from 'vitest';
import { buildDemoTrip } from '../lib/demo';
import { bookingProgress, currentStop, timeline, tripCountdown, tripDates } from '../lib/trip';
import { liveStatus } from '../lib/live-status';

const now = new Date('2026-11-04T09:00:00Z');
const trip = buildDemoTrip(now);

describe('demo trip', () => {
  it('is always mid-trip in Vienna', () => {
    expect(currentStop(trip, now)?.name).toBe('Vienna');
    expect(tripCountdown(trip, now)).toBe('Day 3 of 14');
    expect(tripDates(trip)!.nights).toBe(13);
  });
  it('builds the timeline home → 5 stops → home with 6 legs', () => {
    const t = timeline(trip);
    expect(t.filter(i => i.kind === 'stop')).toHaveLength(5);
    expect(t.filter(i => i.kind === 'leg')).toHaveLength(6);
    expect(t[0].kind).toBe('home');
    expect(t.at(-1)!.kind).toBe('home');
  });
  it('counts 4 of 11 booked (Vienna stay + 3 legs)', () => {
    expect(bookingProgress(trip)).toEqual({ booked: 4, total: 11 });
  });
  it('starts the Attnang train on track', () => {
    const train = trip.reservations.find(r => r.id === 'r-train')!;
    const s = liveStatus(train, now, { lat: 48.2027, lng: 16.3563 }, { lat: train.lat!, lng: train.lng! })!;
    expect(s.state).toBe('on-track');
    expect(s.minutesToLeave).toBeGreaterThan(30);
  });
});
