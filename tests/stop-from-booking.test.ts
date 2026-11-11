import { describe, expect, it } from 'vitest';
import type { BookingScan } from '../lib/schema';
import { cityQuery, stopFromBooking } from '../lib/stop-from-booking';

const f = <T,>(value: T | null, confidence: 'high' | 'low' = 'high') => ({ value, confidence });
const scan = (over: Partial<BookingScan> = {}): BookingScan => ({
  isBooking: true, reason: null, type: f('hotel' as const), title: f('Seehotel Schwan'),
  startLocal: f('2026-11-13T15:00'), startTz: f('Europe/Vienna'), endLocal: f('2026-11-16T11:00'), endTz: f('Europe/Vienna'),
  address: f('Rinnholzplatz 1, 4810 Gmunden, Austria'), city: f('Gmunden'), route: f(null), service: f(null),
  seat: f('Lake view double'), confirmation: f('SW-88231'), price: f(412.5), currency: f('EUR' as const), cancelBy: f(null),
  suggestedStopId: f(null), suggestedLegId: f(null), ...over,
} as BookingScan);
const gmunden = { name: 'Gmunden', detail: 'Upper Austria, Austria', country: 'AT', lat: 47.918, lng: 13.799, tz: 'Europe/Vienna' };

describe('stopFromBooking', () => {
  it('turns a hotel booking into a stop with dates and a booked stay', () => {
    const out = stopFromBooking(scan(), gmunden);
    if ('error' in out) throw new Error(out.error);
    expect(out.place.name).toBe('Gmunden');
    expect([out.arrive, out.depart]).toEqual(['2026-11-13', '2026-11-16']);
    expect(out.stay).toMatchObject({ type: 'hotel', status: 'booked', title: 'Seehotel Schwan', startLocal: '2026-11-13T15:00', endLocal: '2026-11-16T11:00', price: 41250, currency: 'EUR', confirmation: 'SW-88231', source: 'scan' });
  });

  it('refuses things that are not stays', () => {
    expect(stopFromBooking(scan({ type: f('flight' as const) }), gmunden)).toHaveProperty('error');
    expect(stopFromBooking(scan({ isBooking: false, reason: 'A cat.' }), gmunden)).toEqual({ error: 'A cat.' });
    expect(stopFromBooking(scan({ startLocal: f(null) }), gmunden)).toHaveProperty('error');
  });

  it('copes with a missing check-out or a price without a currency', () => {
    const out = stopFromBooking(scan({ endLocal: f(null), currency: f(null) }), gmunden);
    if ('error' in out) throw new Error(out.error);
    expect(out.depart).toBe('2026-11-13');
    expect(out.stay.endLocal).toBeNull();
    expect(out.stay.price).toBeNull();
  });
});

describe('cityQuery', () => {
  it('prefers the city Claude read, else takes the town from the address', () => {
    expect(cityQuery(scan())).toBe('Gmunden');
    expect(cityQuery(scan({ city: f(null) }))).toBe('Gmunden');
    expect(cityQuery(scan({ city: f(''), address: f('Kirchberggasse 6, 1070 Wien') }))).toBe('Wien');
    expect(cityQuery(scan({ city: undefined, address: f(null) }))).toBeNull();
  });
});
