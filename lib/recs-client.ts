'use client';

import type { RecsContext } from './recommend-prompt';
import { sortedStops } from './trip';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { recsCacheKey, type Rec, type RecSet, type Stop, type Traveler, type Trip } from './types';

export function recsContext(trip: Trip, stop: Stop, traveler: Traveler): RecsContext & { token: string; stopId: string; travelerId: string } {
  const stops = sortedStops(trip);
  const stay = trip.reservations.find(r => r.stopId === stop.id && r.type === 'hotel' && r.status !== 'todo');
  return {
    token: trip.token,
    stopId: stop.id,
    travelerId: traveler.id,
    tripName: trip.name,
    traveler: { name: traveler.name, interests: traveler.profile?.interests ?? [], link: traveler.profile?.link ?? null },
    stop: { name: stop.name, country: stop.country, arrive: stop.arrive, depart: stop.depart, lat: stop.lat, lng: stop.lng },
    stay: stay ? { name: stay.title, address: stay.address, lat: stay.lat, lng: stay.lng } : null,
    booked: trip.reservations.filter(r => r.stopId === stop.id && r.type !== 'hotel').map(r => r.title).slice(0, 20),
    nextStop: stops[stops.findIndex(s => s.id === stop.id) + 1]?.name ?? null,
  };
}

export function cacheKeyFor(stop: Stop, t: Traveler): string {
  return recsCacheKey(stop.id, t.id, t.profile?.interests ?? [], t.profile?.link ?? null);
}

/** Research runs about a minute; if the phone sleeps meanwhile, we remember it was asked for. */
const PENDING_MS = 150_000;
const pendingKey = (token: string, key: string) => `passage:recs-pending:${token}:${key}`;
export function pendingSince(token: string, key: string): number | null {
  try {
    const at = Number(localStorage.getItem(pendingKey(token, key)));
    return at && Date.now() - at < PENDING_MS ? at : null;
  } catch { return null; }
}
export function setPending(token: string, key: string, on: boolean) {
  try { if (on) localStorage.setItem(pendingKey(token, key), String(Date.now())); else localStorage.removeItem(pendingKey(token, key)); } catch { /* ignore */ }
}

let db: SupabaseClient | null = null;
/** Picks the server saved for this traveler and city (null if none, or sharing isn't set up). */
export async function savedRecs(token: string, key: string): Promise<RecSet | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    db ??= createClient(url, anon, { auth: { persistSession: false } });
    const { data } = await db.rpc('get_recs', { p_token: token, p_key: key });
    return (data as RecSet | null) ?? null;
  } catch { return null; }
}

export async function fetchRecs(trip: Trip, stop: Stop, traveler: Traveler): Promise<{ ok: true; set: RecSet } | { ok: false; message: string }> {
  const key = cacheKeyFor(stop, traveler);
  setPending(trip.token, key, true);
  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(recsContext(trip, stop, traveler)),
    });
    const data = (await res.json()) as { ok: true; items: Rec[]; set?: RecSet } | { ok: false; message: string };
    setPending(trip.token, key, false);
    if (!data.ok) return data;
    if (data.set) return { ok: true, set: data.set };
    return {
      ok: true,
      set: {
        stopId: stop.id, travelerId: traveler.id, items: data.items, generatedAt: new Date().toISOString(),
        basis: { interests: traveler.profile?.interests ?? [], link: traveler.profile?.link ?? null },
      },
    };
  } catch {
    // Offline, or the phone slept mid-request: the server may still finish and save the picks,
    // so the pending marker stays and the city checks for them when it's opened again.
    return { ok: false, message: "Lost connection while Passage was looking. If your picks were ready, they'll appear when you open this city again." };
  }
}

/** True when the traveler changed their interests or link after these were made. */
export function isStale(set: RecSet, t: Traveler): boolean {
  const p = t.profile;
  if (!p) return false;
  return p.link !== set.basis.link || p.interests.join('|') !== set.basis.interests.join('|');
}
