'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { tripSummary, type TripSummary } from './home';
import type { Rates } from './balances';
import { DEMO_TOKEN } from './demo';
import type { LatLng } from './live-status';
import { applyMutation, type Mutation } from './mutations';
import { localStore, storeFor } from './store';
import type { Currency, Trip } from './types';

// ---------- Trip ----------

export type TripState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; trip: Trip; offline: boolean };

export function useTrip(token: string) {
  const [state, setState] = useState<TripState>({ status: 'loading' });
  const store = useMemo(() => storeFor(token), [token]);

  const reload = useCallback(async () => {
    try {
      const trip = await store.load(token);
      setState(trip ? { status: 'ready', trip, offline: false } : { status: 'missing' });
      if (trip) rememberTrip(trip);
    } catch (e) {
      setState(s => (s.status === 'ready' ? { ...s, offline: true } : { status: 'error', message: String(e) }));
    }
  }, [store, token]);

  useEffect(() => {
    void reload();
    const unsub = store.subscribe(token, () => void reload());
    const onVis = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVis);
    return () => { unsub(); document.removeEventListener('visibilitychange', onVis); };
  }, [store, token, reload]);

  /** Apply now on this phone, then persist. A failed send stays queued, not lost. */
  const mutate = useCallback(async (m: Mutation) => {
    setState(s => (s.status === 'ready' ? { ...s, trip: applyMutation(s.trip, m) } : s));
    try {
      await store.apply(token, m);
    } catch {
      setState(s => (s.status === 'ready' ? { ...s, offline: true } : s));
    }
  }, [store, token]);

  const resetDemo = useCallback(() => {
    if (token !== DEMO_TOKEN) return;
    const trip = localStore().resetDemo();
    setState({ status: 'ready', trip, offline: false });
  }, [token]);

  return { state, mutate, reload, resetDemo, shared: store.shared };
}

// ---------- Trips known on this phone ----------

const KNOWN = 'passage:trips';
/** A trip this phone has opened. Older entries (before the trips list) may lack the newer fields. */
export type KnownTrip = TripSummary;

export function knownTrips(): KnownTrip[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KNOWN) ?? '[]') as Partial<KnownTrip>[];
    return raw.filter((t): t is KnownTrip => typeof t.token === 'string' && typeof t.name === 'string')
      .map(t => ({ ...t, stops: Array.isArray(t.stops) ? t.stops : [], crew: t.crew ?? [], booked: t.booked ?? 0, total: t.total ?? 0, home: t.home ?? '' }));
  } catch { return []; }
}

function rememberTrip(trip: Trip) {
  try {
    const rest = knownTrips().filter(t => t.token !== trip.token);
    localStorage.setItem(KNOWN, JSON.stringify([tripSummary(trip), ...rest].slice(0, 20)));
  } catch { /* storage unavailable */ }
}

// ---------- Identity ("who are you?") ----------

export function useMe(trip: Trip | null): [string | null, (id: string) => void] {
  const k = trip ? `passage:me:${trip.token}` : '';
  const [me, setMeState] = useState<string | null>(null);
  useEffect(() => {
    if (!trip) return;
    let v: string | null = null;
    try { v = localStorage.getItem(k); } catch { /* ignore */ }
    if (trip.isDemo && !v) v = trip.adminId;
    setMeState(v && trip.travelers.some(t => t.id === v) ? v : null);
  }, [trip, k]);
  const setMe = useCallback((id: string) => {
    try { localStorage.setItem(k, id); } catch { /* ignore */ }
    setMeState(id);
  }, [k]);
  return [me, setMe];
}

// ---------- Demo simulation (time shift, location, view-as) ----------

export type SimLocation = 'hotel' | 'device' | 'none';
export interface Sim { offsetMin: number; location: SimLocation }
export const SimContext = createContext<{ sim: Sim; setSim: (s: Sim) => void } | null>(null);
export const DEMO_HOTEL: LatLng = { lat: 48.2027, lng: 16.3563 };

// ---------- Clock ----------

/** "Now", ticking every 30 s, plus the demo time shift. */
export function useNow(offsetMin = 0): Date {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 30_000);
    const onVis = () => document.visibilityState === 'visible' && setT(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return useMemo(() => new Date(t + offsetMin * 60000), [t, offsetMin]);
}

// ---------- Location ----------

export type LocState = { status: 'off' | 'asking' | 'denied' | 'unavailable' } | { status: 'on'; here: LatLng };

/** Watches location only while the app is open and only after the person opts in. */
export function useLocation(enabled: boolean): LocState {
  const [s, setS] = useState<LocState>({ status: 'off' });
  useEffect(() => {
    if (!enabled) { setS({ status: 'off' }); return; }
    if (!('geolocation' in navigator)) { setS({ status: 'unavailable' }); return; }
    setS({ status: 'asking' });
    const id = navigator.geolocation.watchPosition(
      p => setS({ status: 'on', here: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      e => setS({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return s;
}

export function useLocationPref(token: string): [boolean, (v: boolean) => void] {
  const k = `passage:loc:${token}`;
  const [v, setV] = useState(false);
  useEffect(() => { try { setV(localStorage.getItem(k) === '1'); } catch { /* ignore */ } }, [k]);
  return [v, useCallback((next: boolean) => { try { localStorage.setItem(k, next ? '1' : '0'); } catch { /* ignore */ } setV(next); }, [k])];
}

// ---------- Exchange rates ----------

export interface RatesState { rates: Rates; date: string | null; estimate: boolean }

/** Used only if the rate service is unreachable; the UI labels them as estimates. */
const FALLBACK: Record<Currency, Rates> = {
  EUR: { EUR: 1, INR: 100, USD: 1.1, GBP: 0.85, CHF: 0.94, JPY: 165, HRK: 7.5345 },
  INR: { INR: 1, EUR: 0.01, USD: 0.011, GBP: 0.0085, CHF: 0.0094, JPY: 1.65 },
  USD: { USD: 1, EUR: 0.91, INR: 91, GBP: 0.77, CHF: 0.85, JPY: 150 },
  GBP: { GBP: 1, EUR: 1.18, INR: 118, USD: 1.3, CHF: 1.1, JPY: 195 },
  CHF: { CHF: 1, EUR: 1.06, INR: 106, USD: 1.17, GBP: 0.9, JPY: 175 },
  JPY: { JPY: 1, EUR: 0.0061, INR: 0.61, USD: 0.0067, GBP: 0.0051, CHF: 0.0057 },
  HRK: { HRK: 1, EUR: 0.1327 },
};

export function useRates(base: Currency): RatesState {
  const k = `passage:fx:${base}`;
  const [s, setS] = useState<RatesState>(() => ({ rates: FALLBACK[base], date: null, estimate: true }));
  const fetched = useRef(false);
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(k) ?? 'null') as { rates: Rates; date: string } | null;
      if (cached) setS({ rates: cached.rates, date: cached.date, estimate: false });
    } catch { /* ignore */ }
    if (fetched.current) return;
    fetched.current = true;
    fetch(`/api/fx?base=${base}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rates: Rates; date: string }) => {
        setS({ rates: { ...FALLBACK[base], ...d.rates }, date: d.date, estimate: false });
        try { localStorage.setItem(k, JSON.stringify({ rates: d.rates, date: d.date })); } catch { /* ignore */ }
      })
      .catch(() => { /* keep cached or fallback */ });
  }, [base, k]);
  return s;
}

// ---------- Weather ----------

/**
 * The temperature right now in a city (°C), from Open-Meteo: free, no key, no account. Only the
 * city's own coordinates are sent, rounded — never the traveler's location. Any failure simply
 * returns null and the greeting leaves the temperature out.
 */
export function useTemp(place: LatLng | null | undefined): number | null {
  const lat = place ? place.lat.toFixed(2) : null;
  const lng = place ? place.lng.toFixed(2) : null;
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    setT(null);
    if (lat === null || lng === null) return;
    const k = `passage:temp:${lat},${lng}`;
    try {
      const c = JSON.parse(sessionStorage.getItem(k) ?? 'null') as { t: number; at: number } | null;
      if (c && Date.now() - c.at < 30 * 60_000) { setT(c.t); return; }
    } catch { /* ignore */ }
    const ctl = new AbortController();
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m`, { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { current?: { temperature_2m?: number } }) => {
        const v = d.current?.temperature_2m;
        if (typeof v !== 'number' || !Number.isFinite(v)) return;
        setT(Math.round(v));
        try { sessionStorage.setItem(k, JSON.stringify({ t: Math.round(v), at: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => { /* no temperature shown */ });
    return () => ctl.abort();
  }, [lat, lng]);
  return t;
}

// ---------- Toast ----------

export const ToastContext = createContext<(msg: string, action?: { label: string; run: () => void }) => void>(() => {});
export const useToast = () => useContext(ToastContext);
