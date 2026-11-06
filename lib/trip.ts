// Derived views of a trip: the timeline, booking progress, and where each booking happens.

import type { Leg, Place, Reservation, Stop, Trip } from './types';
import { TRANSIT_TYPES } from './types';
import { daysBetween, todayIn, zonedToInstant } from './time';
import type { LatLng } from './live-status';

export type TimelineItem =
  | { kind: 'home'; place: Place; end: 'start' | 'end' }
  | { kind: 'stop'; stop: Stop; stays: Reservation[]; others: Reservation[] }
  | { kind: 'leg'; leg: Leg; bookings: Reservation[] };

export function sortedStops(trip: Trip): Stop[] {
  return [...trip.stops].sort((a, b) => a.order - b.order);
}

const byStart = (a: Reservation, b: Reservation) =>
  zonedToInstant(a.startLocal, a.startTz).getTime() - zonedToInstant(b.startLocal, b.startTz).getTime();

export function legBetween(trip: Trip, from: string | null, to: string | null): Leg | undefined {
  return trip.legs.find(l => l.from === from && l.to === to);
}

export function timeline(trip: Trip): TimelineItem[] {
  const stops = sortedStops(trip);
  const items: TimelineItem[] = [{ kind: 'home', place: trip.home, end: 'start' }];
  const pushLeg = (from: string | null, to: string | null) => {
    const leg = legBetween(trip, from, to);
    if (leg) items.push({ kind: 'leg', leg, bookings: trip.reservations.filter(r => r.legId === leg.id).sort(byStart) });
  };
  stops.forEach((stop, i) => {
    pushLeg(i === 0 ? null : stops[i - 1].id, stop.id);
    const mine = trip.reservations.filter(r => r.stopId === stop.id).sort(byStart);
    items.push({ kind: 'stop', stop, stays: mine.filter(r => r.type === 'hotel'), others: mine.filter(r => r.type !== 'hotel') });
  });
  pushLeg(stops.at(-1)?.id ?? null, null);
  items.push({ kind: 'home', place: trip.home, end: 'end' });
  return items;
}

/** "3 / 8 booked": every stop needs a stay and every leg needs transport. */
export function bookingProgress(trip: Trip): { booked: number; total: number } {
  const stopsDone = trip.stops.filter(s => trip.reservations.some(r => r.stopId === s.id && r.type === 'hotel' && r.status === 'booked')).length;
  const legsDone = trip.legs.filter(l => trip.reservations.some(r => r.legId === l.id && r.status === 'booked')).length;
  return { booked: stopsDone + legsDone, total: trip.stops.length + trip.legs.length };
}

export function tripDates(trip: Trip): { start: string; end: string; nights: number } | null {
  const stops = sortedStops(trip);
  if (!stops.length) return null;
  const start = stops[0].arrive;
  const end = stops.at(-1)!.depart;
  return { start, end, nights: daysBetween(start, end) };
}

/** "21 days out", "Day 3 of 13", or "Ended". */
export function tripCountdown(trip: Trip, now: Date): string {
  const dates = tripDates(trip);
  if (!dates) return 'No dates yet';
  const tz = sortedStops(trip)[0].tz;
  const today = todayIn(tz, now);
  const toStart = daysBetween(today, dates.start);
  if (toStart > 0) return toStart === 1 ? 'Tomorrow' : `${toStart} days out`;
  const day = daysBetween(dates.start, today) + 1;
  if (day > dates.nights + 1) return 'Ended';
  return `Day ${day} of ${dates.nights + 1}`;
}

/**
 * The stop you are at. On a travel day two stops match; you are still at the earlier one
 * until the first booking of the leg out of it has started.
 */
export function currentStop(trip: Trip, now: Date): Stop | undefined {
  const here = sortedStops(trip).filter(s => {
    const today = todayIn(s.tz, now);
    return s.arrive <= today && today <= s.depart;
  });
  if (here.length < 2) return here[0];
  const [from, to] = here;
  const leg = legBetween(trip, from.id, to.id);
  const first = trip.reservations.filter(r => r.legId === leg?.id).sort(byStart)[0];
  const departed = first && zonedToInstant(first.startLocal, first.startTz) <= now;
  return departed ? to : from;
}

/** Where you need to be for a booking: its own pin, else the stop it belongs to / leaves from. */
export function targetFor(trip: Trip, r: Reservation): LatLng | null {
  if (r.lat != null && r.lng != null) return { lat: r.lat, lng: r.lng };
  if (r.stopId) {
    const s = trip.stops.find(x => x.id === r.stopId);
    return s ? { lat: s.lat, lng: s.lng } : null;
  }
  const leg = trip.legs.find(l => l.id === r.legId);
  if (!leg) return null;
  if (leg.from === null) return { lat: trip.home.lat, lng: trip.home.lng };
  const s = trip.stops.find(x => x.id === leg.from);
  return s ? { lat: s.lat, lng: s.lng } : null;
}

export function isTransit(r: Pick<Reservation, 'type'>): boolean {
  return TRANSIT_TYPES.has(r.type);
}

export function placeName(trip: Trip, stopId: string | null): string {
  return stopId === null ? trip.home.name : trip.stops.find(s => s.id === stopId)?.name ?? '?';
}

export function legLabel(trip: Trip, leg: Leg): string {
  return `${placeName(trip, leg.from)} → ${placeName(trip, leg.to)}`;
}

export function flag(country: string): string {
  return country
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
