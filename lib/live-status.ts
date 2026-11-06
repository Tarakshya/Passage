// The live "will I make it?" engine. Pure functions, no I/O — runs on the phone every minute.

import type { Reservation, ReservationType } from './types';
import { zonedToInstant } from './time';

export type LiveState = 'on-track' | 'leave-soon' | 'at-risk' | 'missed';

export interface LatLng { lat: number; lng: number }

export interface LiveStatus {
  state: LiveState;
  start: Date;
  leaveBy: Date;
  /** Minutes until leave-by (negative once it has passed). */
  minutesToLeave: number;
  travelMin: number;
  bufferMin: number;
  /** True when we had no location and could only apply the buffer. */
  timeOnly: boolean;
}

/** Minutes you want to be there before the start time. Hotels have a check-in window, so none. */
export const BUFFER_MIN: Partial<Record<ReservationType, number>> = {
  flight: 120, train: 15, ferry: 30, bus: 10, car: 0, activity: 10, dinner: 10,
};

export const LEAVE_SOON_MIN = 30;
/** Bookings are tracked from 24 h before start until 2 h after it. */
export const LOOKAHEAD_MIN = 24 * 60;
export const MISSED_VISIBLE_MIN = 120;

const WALK_KMH = 4.8;
const CITY_KMH = 22;
const WALK_LIMIT_KM = 2;
/** Streets are not straight lines. */
const DETOUR = 1.3;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough door-to-door minutes: walk if close, city transit or taxi otherwise. */
export function estimateTravelMin(from: LatLng, to: LatLng): number {
  const km = haversineKm(from, to) * DETOUR;
  const speed = km < WALK_LIMIT_KM ? WALK_KMH : CITY_KMH;
  return Math.ceil((km / speed) * 60);
}

export function isTracked(r: Reservation): boolean {
  return r.status !== 'todo' && BUFFER_MIN[r.type] !== undefined;
}

/**
 * Live status for one reservation, or null when it is not in the tracking window.
 * `target` is where you need to be (the station, the restaurant); `here` is the phone.
 */
export function liveStatus(
  r: Reservation,
  now: Date,
  here: LatLng | null,
  target: LatLng | null,
): LiveStatus | null {
  if (!isTracked(r)) return null;
  const start = zonedToInstant(r.startLocal, r.startTz);
  const minsToStart = (start.getTime() - now.getTime()) / 60000;
  if (minsToStart > LOOKAHEAD_MIN || minsToStart < -MISSED_VISIBLE_MIN) return null;

  const bufferMin = BUFFER_MIN[r.type] ?? 0;
  const timeOnly = !here || !target;
  const travelMin = timeOnly ? 0 : estimateTravelMin(here, target);
  const leaveBy = new Date(start.getTime() - (bufferMin + travelMin) * 60000);
  const minutesToLeave = (leaveBy.getTime() - now.getTime()) / 60000;

  let state: LiveState;
  if (minsToStart <= 0) state = 'missed';
  else if (minutesToLeave < 0) state = 'at-risk';
  else if (minutesToLeave <= LEAVE_SOON_MIN) state = 'leave-soon';
  else state = 'on-track';

  return { state, start, leaveBy, minutesToLeave, travelMin, bufferMin, timeOnly };
}

const SEVERITY: Record<LiveState, number> = { 'on-track': 0, 'leave-soon': 1, missed: 2, 'at-risk': 3 };

/** The status that most needs attention — what the trip tile shows. */
export function mostUrgent(statuses: (LiveStatus | null)[]): LiveStatus | null {
  return statuses.reduce<LiveStatus | null>((worst, s) => {
    if (!s) return worst;
    if (!worst) return s;
    if (SEVERITY[s.state] !== SEVERITY[worst.state]) return SEVERITY[s.state] > SEVERITY[worst.state] ? s : worst;
    return s.leaveBy < worst.leaveBy ? s : worst;
  }, null);
}
