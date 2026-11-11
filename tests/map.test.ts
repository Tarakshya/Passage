import { describe, expect, it } from 'vitest';
import { project, tilesFor } from '../components/MapView';
import { buildDemoTrip } from '../lib/demo';
import { mapStop } from '../lib/trip';

describe('static city map', () => {
  it('projects to Web Mercator pixels', () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(project({ lat: 0, lng: 180 }, 1).x).toBe(512);
  });
  it('covers a 301×230 trip tile with a handful of tiles, all from OSM', () => {
    const t = tilesFor({ lat: 48.2082, lng: 16.3738 }, 12, 301, 230, 0.38);
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.length).toBeLessThanOrEqual(6);
    expect(t.every(x => /^https:\/\/tile\.openstreetmap\.org\/12\/\d+\/\d+\.png$/.test(x.src))).toBe(true);
    // the tiles leave no gap: leftmost starts at or before 0, rightmost ends at or after the edge
    expect(Math.min(...t.map(x => x.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...t.map(x => x.left + 256))).toBeGreaterThanOrEqual(301);
  });
});

describe('which city the trip tile shows', () => {
  const now = new Date('2026-11-04T09:00:00Z');
  const trip = buildDemoTrip(now);
  const at = (days: number, hourUtc = 12) => new Date(Date.UTC(2026, 10, 4 + days, hourUtc));
  it('follows the itinerary', () => {
    expect(mapStop(trip, now)?.name).toBe('Vienna');
    expect(mapStop(trip, at(3))?.name).toBe('Gmunden');
    expect(mapStop(trip, at(6))?.name).toBe('Dubrovnik');
    expect(mapStop(trip, at(11))?.name).toBe('Hvar');
  });
  it('switches city once the train out has left, not at midnight', () => {
    expect(mapStop(trip, new Date('2026-11-06T07:00:00Z'))?.name).toBe('Vienna'); // 08:00 Vienna, train at 09:57
    expect(mapStop(trip, new Date('2026-11-06T10:00:00Z'))?.name).toBe('Gmunden'); // 11:00, on the way
  });
  it('shows the first city before the trip and the last one after', () => {
    expect(mapStop(trip, at(-10))?.name).toBe('Vienna');
    expect(mapStop(trip, at(30))?.name).toBe('Hvar');
  });
});
