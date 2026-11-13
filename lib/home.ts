// What the home screen says: the greeting, the route codes on the ticket, and what's next.

import type { LiveStatus } from './live-status';
import { daysBetween, instantToZoned, todayIn, zonedToInstant } from './time';
import { bookingProgress, currentStop, sortedStops, tripCountdown, tripDates } from './trip';
import type { Reservation, Trip } from './types';

const CODES: Record<string, string> = {
  bangalore: 'BLR', bengaluru: 'BLR', mumbai: 'BOM', delhi: 'DEL', 'new delhi': 'DEL', chennai: 'MAA', hyderabad: 'HYD', kolkata: 'CCU', goa: 'GOI',
  vienna: 'VIE', wien: 'VIE', brussels: 'BRU', bruxelles: 'BRU', hvar: 'HVR', salzburg: 'SZG', dubrovnik: 'DBV', split: 'SPU', zagreb: 'ZAG', london: 'LON', paris: 'PAR', rome: 'ROM',
  milan: 'MIL', venice: 'VCE', florence: 'FLR', barcelona: 'BCN', madrid: 'MAD', lisbon: 'LIS', porto: 'OPO', amsterdam: 'AMS', berlin: 'BER',
  munich: 'MUC', zurich: 'ZRH', geneva: 'GVA', prague: 'PRG', budapest: 'BUD', athens: 'ATH', istanbul: 'IST', dubai: 'DXB', singapore: 'SIN',
  bangkok: 'BKK', tokyo: 'TYO', kyoto: 'UKY', osaka: 'OSA', seoul: 'SEL', 'hong kong': 'HKG', sydney: 'SYD', melbourne: 'MEL',
  'new york': 'NYC', 'san francisco': 'SFO', 'los angeles': 'LAX', chicago: 'CHI', toronto: 'YTO',
};

/** A three-letter code for a place: the well-known one, else its first three letters. */
export function placeCode(name: string): string {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const known = CODES[plain.toLowerCase()];
  if (known) return known;
  const letters = plain.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters + 'XXX').slice(0, 3);
}

/** Home, then each stop in order. `at` is the index you're at now (0 = home / not started). */
export function routeCodes(trip: Trip, now: Date): { codes: string[]; at: number } {
  const stops = sortedStops(trip);
  const here = currentStop(trip, now);
  return { codes: [placeCode(trip.home.name), ...stops.map(s => placeCode(s.name))], at: here ? stops.findIndex(s => s.id === here.id) + 1 : 0 };
}

export interface Greeting {
  hello: string; // "Morning"
  before: string; // text before the highlighted word
  em: string | null; // the highlighted word (a city)
  after: string;
  dateLine: string; // "WED 11 NOV · DAY 1 OF 14"
}

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function greeting(trip: Trip, now: Date): Greeting {
  const stops = sortedStops(trip);
  const here = currentStop(trip, now);
  const tz = here?.tz ?? stops[0]?.tz ?? trip.home.tz;
  const local = instantToZoned(now, tz); // YYYY-MM-DDTHH:mm
  const hour = Number(local.slice(11, 13));
  const hello = hour < 5 ? 'Up late' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const [y, m, d] = local.slice(0, 10).split('-').map(Number);
  const day = `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MO[m - 1]}`;
  const dates = tripDates(trip);
  const dateLine = dates ? `${day} · ${tripCountdown(trip, now).toUpperCase()}` : day;

  if (!dates) return { hello, before: 'Add your first stop.', em: null, after: '', dateLine };
  const today = todayIn(tz, now);
  if (today < dates.start) {
    const n = daysBetween(today, dates.start);
    return { hello, before: '', em: stops[0].name, after: n === 1 ? ' tomorrow.' : ` in ${n} days.`, dateLine };
  }
  if (!here) return { hello, before: 'Welcome home.', em: null, after: '', dateLine };
  const last = stops.at(-1)!;
  if (here.id === last.id && today === last.depart) return { hello, before: 'Last day in ', em: here.name, after: '.', dateLine };
  return { hello, before: '', em: here.name, after: ' is yours today.', dateLine };
}

/**
 * The booking the "Next up" card shows: the soonest one that hasn't been missed; if everything
 * live has been missed, the most recent of those (so "Missed — rebook?" is still seen).
 */
export function nextUp<T extends { r: Reservation; s: LiveStatus | null }>(pairs: T[]): (T & { s: LiveStatus }) | null {
  const live = pairs.filter((p): p is T & { s: LiveStatus } => p.s !== null);
  const at = (p: T) => zonedToInstant(p.r.startLocal, p.r.startTz).getTime();
  const ahead = live.filter(p => p.s.state !== 'missed').sort((a, b) => at(a) - at(b));
  if (ahead.length) return ahead[0];
  return live.sort((a, b) => at(b) - at(a))[0] ?? null;
}

/** "12m", "1h 05m" — the compact countdown on the Next up card. */
export function shortCountdown(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "6–8 NOV" or "30 NOV – 2 DEC" — dates the way a ticket prints them. */
export function ticketRange(a: string, b: string): string {
  const [, ma, da] = a.split('-').map(Number);
  const [, mb, db] = b.split('-').map(Number);
  return ma === mb ? `${da}–${db} ${MO[ma - 1]}` : `${da} ${MO[ma - 1]} – ${db} ${MO[mb - 1]}`;
}

export function countryName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

// ---------- The trips list ----------

/** What the trips list needs about a trip; saved on the phone each time a trip is opened. */
export interface TripSummary {
  token: string;
  name: string;
  home: string;
  stops: { name: string; arrive: string; depart: string; tz: string; lat: number; lng: number }[];
  crew: string[];
  booked: number;
  total: number;
  isDemo?: boolean;
}

export function tripSummary(trip: Trip): TripSummary {
  const p = bookingProgress(trip);
  return {
    token: trip.token,
    name: trip.name,
    home: trip.home.name,
    stops: sortedStops(trip).map(s => ({ name: s.name, arrive: s.arrive, depart: s.depart, tz: s.tz, lat: s.lat, lng: s.lng })),
    crew: trip.travelers.map(t => t.name),
    booked: p.booked,
    total: p.total,
    isDemo: trip.isDemo || undefined,
  };
}

export type TripPhase = 'now' | 'soon' | 'past' | 'undated';

/** Where a trip stands today, in words: "Day 1 of 14 · Vienna", "In 21 days", "Completed". */
export function summaryStatus(s: Pick<TripSummary, 'stops'>, now: Date): { phase: TripPhase; text: string; city: TripSummary['stops'][number] | null } {
  if (!s.stops.length) return { phase: 'undated', text: 'No dates yet', city: null };
  const first = s.stops[0];
  const last = s.stops.at(-1)!;
  const today = todayIn(first.tz, now);
  if (today < first.arrive) {
    const n = daysBetween(today, first.arrive);
    return { phase: 'soon', text: n === 1 ? 'Tomorrow' : `In ${n} days`, city: null };
  }
  const total = daysBetween(first.arrive, last.depart) + 1;
  const day = daysBetween(first.arrive, today) + 1;
  if (day > total) return { phase: 'past', text: 'Completed', city: null };
  const city = s.stops.find(x => x.arrive <= todayIn(x.tz, now) && todayIn(x.tz, now) < x.depart) ?? last;
  return { phase: 'now', text: `Day ${day} of ${total}`, city };
}

/** In progress first, then upcoming (soonest first), then undated, then past (latest first). */
export function sortTrips<T extends Pick<TripSummary, 'stops'>>(list: T[], now: Date): T[] {
  const rank: Record<TripPhase, number> = { now: 0, soon: 1, undated: 2, past: 3 };
  return [...list].sort((a, b) => {
    const pa = summaryStatus(a, now).phase;
    const pb = summaryStatus(b, now).phase;
    if (pa !== pb) return rank[pa] - rank[pb];
    const sa = a.stops[0]?.arrive ?? '';
    const sb = b.stops[0]?.arrive ?? '';
    return pa === 'past' ? sb.localeCompare(sa) : sa.localeCompare(sb);
  });
}

export function timeOfDay(now: Date): string {
  const h = now.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
