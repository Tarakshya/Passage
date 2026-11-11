// Klook, kept honest. Passage only ever shows Klook where Klook really sells the thing:
//  • an experience pick carries a Klook link only when Claude found that listing in web search,
//    and the link is checked here to be a real klook.com page;
//  • a "to book" train leg carries a Klook link only where Klook's Europe rail shop covers both
//    ends. Buses and ferries get no link: Klook's coverage there isn't published per route.
// Nothing here ever builds a product URL or a price by guessing.

import type { Leg, Trip } from './types';

/** Klook's Europe train shop. */
export const KLOOK_RAIL_URL = 'https://www.klook.com/europe-rail/';

/** Countries Klook lists for European rail (its own page; checked Nov 2026). */
export const KLOOK_RAIL_COUNTRIES = new Set(['GB', 'ES', 'IT', 'FR', 'NL', 'CH', 'DE']);

/** A link is kept only if it is an https page on klook.com. Tracking and query text are dropped. */
export function cleanKlookUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !(host === 'klook.com' || host.endsWith('.klook.com'))) return null;
    if (u.pathname === '/' || u.pathname === '') return null; // the home page is not a listing
    return `https://${host}${u.pathname}`;
  } catch {
    return null;
  }
}

/** "€24", "EUR 24.50", "₹2,150" — anything else is dropped rather than shown. */
export function cleanKlookPrice(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\s+/g, ' ');
  return /^(?:[A-Z]{2,3}\$?\s?|[€$£₹¥])\s?\d[\d.,]{0,9}$/.test(v) ? v : null;
}

/** Adds the affiliate id when one is configured (NEXT_PUBLIC_KLOOK_AID). */
export function withAid(url: string, aid: string | undefined = process.env.NEXT_PUBLIC_KLOOK_AID): string {
  if (!aid || !/^\d{1,12}$/.test(aid)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}aid=${aid}`;
}

/** The Klook link for an unbooked leg, or null when Klook doesn't sell that kind of route. */
export function klookForLeg(trip: Trip, leg: Leg): string | null {
  if (leg.mode !== 'train') return null;
  const country = (id: string | null) => (id === null ? trip.home.country : trip.stops.find(s => s.id === id)?.country);
  const a = country(leg.from)?.toUpperCase();
  const b = country(leg.to)?.toUpperCase();
  if (!a || !b || !KLOOK_RAIL_COUNTRIES.has(a) || !KLOOK_RAIL_COUNTRIES.has(b)) return null;
  return KLOOK_RAIL_URL;
}
