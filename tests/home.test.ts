import { describe, expect, it } from 'vitest';
import { buildDemoTrip } from './fixtures/austria-demo';
import { countryName, greeting, nextUp, placeCode, routeCodes, shortCountdown, ticketRange } from '../lib/home';
import { cleanKlookPrice, cleanKlookUrl, klookForLeg, KLOOK_RAIL_URL, withAid } from '../lib/klook';
import type { LiveStatus } from '../lib/live-status';
import { addDays } from '../lib/time';
import type { Reservation, Trip } from '../lib/types';

const NOW = new Date('2026-11-11T09:30:00Z'); // 10:30 in Vienna

describe('home screen text', () => {
  it('greets by local time and names today’s city', () => {
    const g = greeting(buildDemoTrip(NOW), NOW);
    expect(g.hello).toBe('Morning');
    expect(`${g.before}${g.em}${g.after}`).toBe('Vienna is yours today.');
    expect(g.dateLine).toBe('WED 11 NOV · DAY 1 OF 14');
  });

  it('counts down before the trip, and welcomes home after', () => {
    const trip = buildDemoTrip(NOW);
    const before = greeting(trip, new Date(NOW.getTime() - 3 * 86400e3));
    expect(`${before.em}${before.after}`).toBe('Vienna in 3 days.');
    expect(greeting(trip, new Date(NOW.getTime() - 86400e3)).after).toBe(' tomorrow.');
    const lastDay = greeting(trip, new Date(NOW.getTime() + 13 * 86400e3));
    expect(`${lastDay.before}${lastDay.em}${lastDay.after}`).toBe('Last day in Hvar.');
    expect(greeting(trip, new Date(NOW.getTime() + 20 * 86400e3)).before).toBe('Welcome home.');
    expect(greeting(trip, new Date('2026-11-11T19:00:00Z')).hello).toBe('Evening');
  });

  it('handles a trip with no stops', () => {
    const g = greeting({ ...buildDemoTrip(NOW), stops: [], legs: [], reservations: [] }, NOW);
    expect(g.em).toBeNull();
    expect(g.before).toBe('Add your first stop.');
  });

  it('prints route codes and marks where you are', () => {
    const trip = buildDemoTrip(NOW);
    expect(routeCodes(trip, NOW)).toEqual({ codes: ['BLR', 'VIE', 'GMU', 'DBV', 'SPU', 'HVR'], at: 1 });
    expect(routeCodes(trip, new Date(NOW.getTime() - 5 * 86400e3)).at).toBe(0);
    expect(placeCode('Český Krumlov')).toBe('CES');
    expect(placeCode('Ko')).toBe('KOX');
    expect(placeCode('New York')).toBe('NYC');
  });

  it('formats ticket dates, countdowns and countries', () => {
    expect(ticketRange('2026-11-06', '2026-11-08')).toBe('6–8 NOV');
    expect(ticketRange('2026-11-30', '2026-12-02')).toBe('30 NOV – 2 DEC');
    expect(shortCountdown(12)).toBe('12m');
    expect(shortCountdown(65)).toBe('1h 05m');
    expect(shortCountdown(-4)).toBe('0m');
    expect(countryName('HR')).toBe('Croatia');
  });

  it('picks the soonest booking that has not been missed', () => {
    const r = (id: string, start: string) => ({ id, startLocal: start, startTz: 'Europe/Vienna' }) as Reservation;
    const s = (state: LiveStatus['state']) => ({ state }) as LiveStatus;
    const pairs = [
      { r: r('later', '2026-11-11T15:00'), s: s('on-track') },
      { r: r('gone', '2026-11-11T09:00'), s: s('missed') },
      { r: r('soon', '2026-11-11T11:45'), s: s('leave-soon') },
      { r: r('untracked', '2026-11-11T10:00'), s: null },
    ];
    expect(nextUp(pairs)?.r.id).toBe('soon');
    expect(nextUp([pairs[1], pairs[3]])?.r.id).toBe('gone');
    expect(nextUp([pairs[3]])).toBeNull();
  });
});

describe('Klook rules', () => {
  it('accepts only https klook.com listings and strips tracking', () => {
    expect(cleanKlookUrl('https://www.klook.com/en-US/activity/1-x/?aid=5#top')).toBe('https://www.klook.com/en-US/activity/1-x/');
    expect(cleanKlookUrl('https://klook.com/activity/1-x/')).toBe('https://klook.com/activity/1-x/');
    for (const bad of ['http://www.klook.com/activity/1', 'https://klook.com.evil.io/a', 'https://notklook.com/a', 'https://www.klook.com/', 'javascript:alert(1)', '', null, 42]) {
      expect(cleanKlookUrl(bad)).toBeNull();
    }
  });

  it('accepts only prices that look like prices', () => {
    for (const ok of ['€24', '€ 24.50', 'EUR 24', '₹2,150', 'US$ 30', 'HK$120']) expect(cleanKlookPrice(ok)).toBe(ok);
    for (const bad of ['from 24', 'cheap', '24', '€', '<b>€1</b>', null]) expect(cleanKlookPrice(bad)).toBeNull();
  });

  it('adds the affiliate id only when one is set and numeric', () => {
    expect(withAid('https://www.klook.com/a/', '12345')).toBe('https://www.klook.com/a/?aid=12345');
    expect(withAid('https://www.klook.com/a/', undefined)).toBe('https://www.klook.com/a/');
    expect(withAid('https://www.klook.com/a/', 'x&y=1')).toBe('https://www.klook.com/a/');
  });

  it('offers Klook for a leg only where Klook sells that route', () => {
    const demo = buildDemoTrip(NOW);
    // Austria and Croatia are not in Klook's Europe rail shop; ferries and flights never qualify.
    for (const leg of demo.legs) expect(klookForLeg(demo, leg)).toBeNull();

    const d = addDays('2026-11-11', 0);
    const stop = (id: string, country: string, order: number) => ({ id, order, name: id, country, lat: 0, lng: 0, tz: 'Europe/Paris', arrive: d, depart: d });
    const trip: Trip = { ...demo, home: { ...demo.home, country: 'GB' }, stops: [stop('paris', 'FR', 1), stop('milan', 'IT', 2), stop('vienna', 'AT', 3)], legs: [] };
    expect(klookForLeg(trip, { id: 'a', from: 'paris', to: 'milan', mode: 'train', title: '' })).toBe(KLOOK_RAIL_URL);
    expect(klookForLeg(trip, { id: 'b', from: null, to: 'paris', mode: 'train', title: '' })).toBe(KLOOK_RAIL_URL);
    expect(klookForLeg(trip, { id: 'c', from: 'milan', to: 'vienna', mode: 'train', title: '' })).toBeNull();
    expect(klookForLeg(trip, { id: 'd', from: 'paris', to: 'milan', mode: 'bus', title: '' })).toBeNull();
    expect(klookForLeg(trip, { id: 'e', from: 'paris', to: 'milan', mode: 'ferry', title: '' })).toBeNull();
  });
});
