'use client';

import type { RecsContext } from './recommend-prompt';
import { sortedStops } from './trip';
import type { Rec, RecSet, Stop, Traveler, Trip } from './types';

export function recsContext(trip: Trip, stop: Stop, traveler: Traveler): Omit<RecsContext, never> & { token: string } {
  const stops = sortedStops(trip);
  const stay = trip.reservations.find(r => r.stopId === stop.id && r.type === 'hotel' && r.status !== 'todo');
  return {
    token: trip.token,
    tripName: trip.name,
    traveler: { name: traveler.name, interests: traveler.profile?.interests ?? [], link: traveler.profile?.link ?? null },
    stop: { name: stop.name, country: stop.country, arrive: stop.arrive, depart: stop.depart, lat: stop.lat, lng: stop.lng },
    stay: stay ? { name: stay.title, address: stay.address, lat: stay.lat, lng: stay.lng } : null,
    booked: trip.reservations.filter(r => r.stopId === stop.id && r.type !== 'hotel').map(r => r.title).slice(0, 20),
    nextStop: stops[stops.findIndex(s => s.id === stop.id) + 1]?.name ?? null,
  };
}

export async function fetchRecs(trip: Trip, stop: Stop, traveler: Traveler): Promise<{ ok: true; set: RecSet } | { ok: false; message: string }> {
  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(recsContext(trip, stop, traveler)),
    });
    const data = (await res.json()) as { ok: true; items: Rec[] } | { ok: false; message: string };
    if (!data.ok) return data;
    return {
      ok: true,
      set: {
        stopId: stop.id, travelerId: traveler.id, items: data.items, generatedAt: new Date().toISOString(),
        basis: { interests: traveler.profile?.interests ?? [], link: traveler.profile?.link ?? null },
      },
    };
  } catch {
    return { ok: false, message: "You're offline. Try again when you have signal." };
  }
}

/** True when the traveler changed their interests or link after these were made. */
export function isStale(set: RecSet, t: Traveler): boolean {
  const p = t.profile;
  if (!p) return false;
  return p.link !== set.basis.link || p.interests.join('|') !== set.basis.interests.join('|');
}
