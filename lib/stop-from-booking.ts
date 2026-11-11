// Turning a scanned hotel booking into a trip stop, for the "Fill from a hotel booking" button in
// the trip form: the city becomes the stop, check-in/check-out become its dates, and the booking
// itself is kept so it can be added as a booked stay when the trip is saved.

import type { PlaceHit } from './geo';
import type { BookingScan } from './schema';
import { CURRENCY_DECIMALS, type Place, type Reservation } from './types';

export interface StopFill {
  place: Place;
  arrive: string; // YYYY-MM-DD
  depart: string;
  stay: Omit<Reservation, 'id' | 'stopId'>;
}

const DATE = /^\d{4}-\d{2}-\d{2}/;
const validTz = (tz: string | null | undefined): tz is string => {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
};

/** The search text for the stop's city: Claude's city if it gave one, else the address's town. */
export function cityQuery(r: BookingScan): string | null {
  const city = r.city?.value?.trim();
  if (city) return city;
  const addr = r.address.value;
  if (!addr) return null;
  // "Rinnholzplatz 1, 4810 Gmunden, Austria" → "Gmunden": the part with a postcode, minus the code.
  const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
  const withCode = parts.find(p => /\d{4,}/.test(p) && /[A-Za-zÀ-ž]/.test(p));
  return (withCode ? withCode.replace(/\b[\dA-Z]{0,3}[- ]?\d{3,}[- ]?[\dA-Z]{0,3}\b/g, '').trim() : parts.at(-2)) || null;
}

/**
 * Null when the scan isn't a usable stay: not a booking, not a hotel, or no check-in date.
 * `hit` is the city found for `cityQuery` (from place search).
 */
export function stopFromBooking(r: BookingScan, hit: PlaceHit): StopFill | { error: string } {
  if (!r.isBooking) return { error: r.reason ?? 'That doesn’t look like a booking.' };
  if (r.type.value && r.type.value !== 'hotel') {
    return { error: `That looks like a ${r.type.value} booking, not a stay. Add it after you create the trip.` };
  }
  const start = r.startLocal.value;
  if (!start || !DATE.test(start)) return { error: 'Couldn’t find a check-in date on that booking.' };
  const arrive = start.slice(0, 10);
  const end = r.endLocal.value && DATE.test(r.endLocal.value) ? r.endLocal.value : null;
  const depart = end && end.slice(0, 10) >= arrive ? end.slice(0, 10) : arrive;
  const place: Place = { name: hit.name, country: hit.country, lat: hit.lat, lng: hit.lng, tz: hit.tz };
  const tz = validTz(r.startTz.value) ? r.startTz.value : hit.tz;
  const currency = r.currency.value;
  const price = r.price.value;
  return {
    place,
    arrive,
    depart,
    stay: {
      type: 'hotel',
      status: 'booked',
      legId: null,
      title: r.title.value?.trim() || `Stay in ${hit.name}`,
      startLocal: start.length >= 16 ? start.slice(0, 16) : `${arrive}T15:00`,
      startTz: tz,
      endLocal: end ? (end.length >= 16 ? end.slice(0, 16) : `${depart}T11:00`) : null,
      endTz: end ? (validTz(r.endTz.value) ? r.endTz.value : tz) : null,
      address: r.address.value,
      lat: null,
      lng: null,
      route: null,
      service: null,
      seat: r.seat.value,
      confirmation: r.confirmation.value,
      price: price !== null && currency ? Math.round(price * 10 ** CURRENCY_DECIMALS[currency]) : null,
      currency: price !== null && currency ? currency : null,
      cancelBy: r.cancelBy.value,
      source: 'scan',
    },
  };
}
