'use client';

// Place search for the trip form and address pins. Photon (komoot): open data, no key, CORS-enabled.
// Time zones come from tz-lookup, offline, so a stop's zone never depends on a network call.

import tzlookup from 'tz-lookup';

export interface PlaceHit { name: string; detail: string; country: string; lat: number; lng: number; tz: string }

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; city?: string; state?: string; country?: string; countrycode?: string; type?: string; street?: string; housenumber?: string };
}

export function tzFor(lat: number, lng: number): string {
  try { return tzlookup(lat, lng); } catch { return 'UTC'; }
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  if (q.trim().length < 2) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&layer=city&layer=locality&layer=district&layer=county`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return data.features
    .filter(f => f.properties.name && f.properties.countrycode)
    .map(f => {
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties;
      return { name: p.name!, detail: [p.state, p.country].filter(Boolean).join(', '), country: p.countrycode!.toUpperCase(), lat, lng, tz: tzFor(lat, lng) };
    })
    .filter(h => {
      const k = `${h.name}|${h.detail}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Best-effort pin for a street address near a known point. Null on any failure. */
export async function geocodeAddress(address: string, near: { lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lat=${near.lat}&lon=${near.lng}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features: PhotonFeature[] };
    const f = data.features[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    // Ignore matches more than 60 km away: they are the wrong "Bahnhofstraße".
    const far = Math.abs(lat - near.lat) > 0.6 || Math.abs(lng - near.lng) > 0.9;
    return far ? null : { lat, lng };
  } catch {
    return null;
  }
}
