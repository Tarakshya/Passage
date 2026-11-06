import { describe, expect, it } from 'vitest';
import { estimateTravelMin, liveStatus, mostUrgent } from '../lib/live-status';
import type { Reservation } from '../lib/types';

const train: Reservation = {
  id: 't', type: 'train', status: 'booked', stopId: null, legId: 'l', title: 'IC 548',
  startLocal: '2026-11-04T12:00', startTz: 'Europe/Vienna', endLocal: null, endTz: null,
  address: null, lat: 48.1852, lng: 16.3757, route: null, service: null, seat: null,
  confirmation: null, price: null, currency: null, cancelBy: null, source: 'manual',
};
const start = new Date('2026-11-04T11:00:00Z'); // 12:00 Vienna
const at = (minsBefore: number) => new Date(start.getTime() - minsBefore * 60000);
const station = { lat: 48.1852, lng: 16.3757 };
const hotel = { lat: 48.2027, lng: 16.3563 }; // ~2.4 km away

describe('liveStatus', () => {
  it('estimates the hotel → station trip as a short transit ride', () => {
    const m = estimateTravelMin(hotel, station);
    expect(m).toBeGreaterThan(6);
    expect(m).toBeLessThan(15);
  });

  it('walks through every state as time passes (time-only mode)', () => {
    // buffer 15 → leave-by 11:45
    expect(liveStatus(train, at(90), null, station)!.state).toBe('on-track');
    expect(liveStatus(train, at(46), null, station)!.state).toBe('on-track');
    expect(liveStatus(train, at(45), null, station)!.state).toBe('leave-soon'); // exactly 30 min to leave
    expect(liveStatus(train, at(16), null, station)!.state).toBe('leave-soon');
    expect(liveStatus(train, at(14), null, station)!.state).toBe('at-risk');
    expect(liveStatus(train, at(0), null, station)!.state).toBe('missed');
    expect(liveStatus(train, at(-60), null, station)!.state).toBe('missed');
  });

  it('flags time-only mode when there is no location', () => {
    const s = liveStatus(train, at(90), null, station)!;
    expect(s.timeOnly).toBe(true);
    expect(s.travelMin).toBe(0);
  });

  it('adds travel time when the phone knows where it is', () => {
    const s = liveStatus(train, at(90), hotel, station)!;
    expect(s.timeOnly).toBe(false);
    expect(s.leaveBy.getTime()).toBe(start.getTime() - (15 + s.travelMin) * 60000);
  });

  it('ignores bookings outside the tracking window, hotels and to-dos', () => {
    expect(liveStatus(train, at(25 * 60), null, station)).toBeNull();
    expect(liveStatus(train, at(-121), null, station)).toBeNull();
    expect(liveStatus({ ...train, type: 'hotel' }, at(60), null, station)).toBeNull();
    expect(liveStatus({ ...train, status: 'todo' }, at(60), null, station)).toBeNull();
  });

  it('uses a two-hour buffer for flights', () => {
    const s = liveStatus({ ...train, type: 'flight' }, at(100), null, station)!;
    expect(s.state).toBe('at-risk');
  });

  it('picks the most urgent status for the trip tile', () => {
    const a = liveStatus(train, at(90), null, station);
    const b = liveStatus(train, at(14), null, station);
    expect(mostUrgent([a, null, b])!.state).toBe('at-risk');
    expect(mostUrgent([null])).toBeNull();
  });
});
