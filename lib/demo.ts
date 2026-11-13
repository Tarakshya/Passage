// The sample trips. Every date is relative to "now", so they never go stale:
//
// - Amsterdam–Hvar (token "demo"), T and GB, is always in progress: it's Day 2 in Amsterdam, and Rijksmuseum
//   tickets start in ~75 minutes — the booking the demo clock walks from on track to at risk.
//   One leg (Milan → Split → Hvar) is still to book, so the "To book" flow is visible.
// - Austria–Croatia (token "demo-past"), T, Sam and Priya, ended a few weeks ago: everything booked, everyone
//   settled up. It shows what a finished trip looks like.

import type { Expense, Reservation, Traveler, Trip } from './types';
import { netBalances, settlementExpense, settleUp } from './balances';
import { addDays, instantToZoned, todayIn } from './time';

export const DEMO_TOKEN = 'demo';
export const PAST_TOKEN = 'demo-past';
/** Tokens of the built-in sample trips (kept on the phone, never uploaded). */
export const SAMPLE_TOKENS = [DEMO_TOKEN, PAST_TOKEN];
export const isSampleToken = (token: string) => SAMPLE_TOKENS.includes(token);

/** Where the demo clock and "At the hotel" are: Amsterdam, at the canal hotel. */
export const DEMO_TZ = 'Europe/Amsterdam';
export const DEMO_CITY = 'Amsterdam';
export const DEMO_HOTEL = { lat: 52.3627, lng: 4.8879 };

const AMS = 'Europe/Amsterdam';
const BRU = 'Europe/Brussels';
const MIL = 'Europe/Rome';
const VIE = 'Europe/Vienna';
const HR = 'Europe/Zagreb';
const IST = 'Asia/Kolkata';
const HOME = { name: 'Bangalore', country: 'IN', lat: 12.9716, lng: 77.5946, tz: IST };

/** Local "YYYY-MM-DDTHH:mm" in `tz`, `minutes` from now, rounded up to 5 minutes. */
function inMinutes(now: Date, minutes: number, tz: string): string {
  const t = new Date(now.getTime() + minutes * 60000);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(Math.ceil(t.getUTCMinutes() / 5) * 5);
  return instantToZoned(t, tz);
}

function addMinutesLocal(local: string, minutes: number): string {
  const t = new Date(Date.parse(local + ':00Z') + minutes * 60000);
  return t.toISOString().slice(0, 16);
}

function travelers(now: Date): Traveler[] {
  return [
    { id: 'you', name: 'T', color: 'var(--acc)', profile: { interests: ['Coffee houses', 'Modern art', 'Architecture', 'Long city walks', 'Natural wine'], link: null, updatedAt: now.toISOString() } },
    { id: 'sam', name: 'Sam', color: '#C9AE7A', profile: { interests: ['Football', 'Craft beer', 'Street food', 'History', 'Hiking'], link: null, updatedAt: now.toISOString() } },
    { id: 'priya', name: 'Priya', color: '#A9B8FF', profile: { interests: ['Design shops', 'Vegetarian food', 'Live music', 'Photography', 'Markets'], link: null, updatedAt: now.toISOString() } },
  ];
}

/** A booking with the fields every sample booking leaves empty filled in. */
function res(r: Partial<Reservation> & Pick<Reservation, 'id' | 'type' | 'title' | 'startLocal' | 'startTz'>): Reservation {
  return {
    status: 'booked', stopId: null, legId: null, endLocal: null, endTz: null, address: null, lat: null, lng: null,
    route: null, service: null, seat: null, confirmation: null, price: null, currency: null, cancelBy: null, source: 'scan', ...r,
  };
}

const ALL = ['you', 'sam', 'priya'];
/** The Amsterdam trip is just T and GB. */
const DUO = ['you', 'gb'];

/** The Ledger entry a paid booking makes (same id the app uses, so it's never logged twice). */
function paidBooking(r: Reservation, payerId: string, now: Date, category: Expense['category'], splitWith = ALL): Expense {
  return {
    id: `e-${r.id}`, title: r.title, amount: r.price!, currency: r.currency!, payerId, splitWith,
    date: r.startLocal.slice(0, 10), category, autoScanned: r.source === 'scan', pendingAmount: null, pendingBy: null, createdAt: now.toISOString(),
  };
}

function expense(e: Partial<Expense> & Pick<Expense, 'id' | 'title' | 'amount' | 'payerId' | 'date' | 'category'>, now: Date): Expense {
  return { currency: 'EUR', splitWith: ALL, autoScanned: false, pendingAmount: null, pendingBy: null, createdAt: now.toISOString(), ...e };
}

export function buildDemoTrip(now: Date = new Date()): Trip {
  const d0 = todayIn(AMS, now);
  const d = (n: number) => addDays(d0, n);
  const rijks = inMinutes(now, 75, AMS);

  const reservations: Reservation[] = [
    res({
      id: 'r-out', type: 'flight', legId: 'leg-out', title: 'Bengaluru → Amsterdam',
      startLocal: `${d(-2)}T23:55`, startTz: IST, endLocal: `${d(-1)}T07:40`, endTz: AMS,
      address: 'Kempegowda International Airport', lat: 13.1986, lng: 77.7066, route: 'BLR → AMS',
      service: 'NW 512', seat: '24A, 24B', confirmation: 'QX7R2M', price: 12290000, currency: 'INR',
    }),
    res({
      id: 'r-spiegel', type: 'hotel', stopId: 'ams', title: 'Spiegel Canal Rooms',
      startLocal: `${d(-1)}T15:00`, startTz: AMS, endLocal: `${d(4)}T11:00`, endTz: AMS,
      address: 'Spiegelgracht 14, 1017 JR Amsterdam', lat: 52.3627, lng: 4.8879,
      seat: 'Canal-view double, breakfast included', confirmation: 'HCR-58210447', price: 110400, currency: 'EUR', cancelBy: `${d(-8)}T23:59`,
    }),
    res({
      id: 'r-rijks', type: 'activity', stopId: 'ams', title: 'Rijksmuseum · The Night Watch',
      startLocal: rijks, startTz: AMS, endLocal: addMinutesLocal(rijks, 150), endTz: AMS,
      address: 'Museumstraat 1, 1071 XX Amsterdam', lat: 52.36, lng: 4.8852,
      seat: '2 adult tickets, timed entry', confirmation: 'RM-20931-7741', price: 5000, currency: 'EUR',
    }),
    res({
      id: 'r-lepel', type: 'dinner', stopId: 'ams', title: 'De Gouden Lepel',
      startLocal: `${d(2)}T20:00`, startTz: AMS, endLocal: `${d(2)}T22:00`, endTz: AMS,
      address: 'Utrechtsestraat 41, 1017 VJ Amsterdam', lat: 52.3627, lng: 4.8977, seat: 'Table for 2', confirmation: 'GL-4471', source: 'manual',
    }),
    res({
      id: 'r-cruise', type: 'activity', stopId: 'ams', title: 'Evening Canal Cruise',
      startLocal: `${d(1)}T19:30`, startTz: AMS, endLocal: `${d(1)}T21:00`, endTz: AMS,
      address: 'Prins Hendrikkade 25, Amsterdam', lat: 52.3771, lng: 4.9003,
      seat: '2 tickets · drinks included', confirmation: 'CC-881204', price: 5990, currency: 'EUR',
    }),
    res({
      id: 'r-train', type: 'train', legId: 'leg-ams-bru', title: 'Amsterdam Centraal → Bruxelles-Midi',
      startLocal: `${d(4)}T09:16`, startTz: AMS, endLocal: `${d(4)}T11:08`, endTz: BRU,
      address: 'Amsterdam Centraal', lat: 52.3791, lng: 4.9003, route: 'Amsterdam Centraal → Bruxelles-Midi',
      service: 'LR 9316', seat: 'Coach 4, seats 31–32', confirmation: 'LR4K-29XQ', price: 9840, currency: 'EUR',
    }),
    res({
      id: 'r-sablon', type: 'hotel', stopId: 'bru', title: 'Maison du Sablon',
      startLocal: `${d(4)}T14:00`, startTz: BRU, endLocal: `${d(7)}T11:00`, endTz: BRU,
      address: 'Rue de Rollebeek 7, 1000 Bruxelles', lat: 50.8411, lng: 4.3536,
      seat: 'Double room', confirmation: 'MS-30981', price: 77400, currency: 'EUR',
    }),
    res({
      id: 'r-bru-mxp', type: 'flight', legId: 'leg-bru-mil', title: 'Brussels → Milan',
      startLocal: `${d(7)}T12:35`, startTz: BRU, endLocal: `${d(7)}T14:10`, endTz: MIL,
      address: 'Brussels Airport', lat: 50.901, lng: 4.4856, route: 'BRU → MXP',
      service: 'AU 2241', seat: '14D, 14E', confirmation: 'ZP8LQ4', price: 21260, currency: 'EUR',
    }),
    res({
      id: 'r-navigli', type: 'hotel', stopId: 'mil', title: 'Navigli Loft Studios',
      startLocal: `${d(7)}T15:00`, startTz: MIL, endLocal: `${d(11)}T10:30`, endTz: MIL,
      address: 'Via Vigevano 18, 20144 Milano', lat: 45.4545, lng: 9.1752,
      seat: 'Loft studio for 2', confirmation: '4410 228 917', price: 109600, currency: 'EUR',
    }),
    res({
      id: 'r-pakleni', type: 'hotel', stopId: 'hvr', title: 'Villa Pakleni',
      startLocal: `${d(11)}T18:00`, startTz: HR, endLocal: `${d(14)}T08:00`, endTz: HR,
      address: 'Put Pakleni 4, 21450 Hvar', lat: 43.1716, lng: 16.4385,
      seat: 'Sea-view studio for 2', confirmation: 'VP-2027-0611-38', price: 52000, currency: 'EUR',
    }),
    res({
      id: 'r-ret', type: 'flight', legId: 'leg-ret', title: 'Split → Bengaluru',
      startLocal: `${d(14)}T11:20`, startTz: HR, endLocal: `${d(15)}T03:10`, endTz: IST,
      address: 'Split Airport', lat: 43.5389, lng: 16.298, route: 'SPU → IST → BLR',
      service: 'NW 718 · NW 64', seat: '21C, 21D', confirmation: 'QX9D4T', price: 10860000, currency: 'INR',
    }),
  ];
  const by = (id: string) => reservations.find(r => r.id === id)!;

  return {
    id: 'trip-demo',
    token: DEMO_TOKEN,
    name: 'Amsterdam–Hvar',
    home: HOME,
    baseCurrency: 'EUR',
    adminId: 'you',
    isDemo: true,
    travelers: [
      travelers(now)[0],
      { id: 'gb', name: 'GB', color: '#C9AE7A', profile: { interests: ['Food markets', 'Cycling', 'Jazz bars', 'Vintage shops', 'History'], link: null, updatedAt: now.toISOString() } },
    ],
    stops: [
      { id: 'ams', order: 1, name: 'Amsterdam', country: 'NL', lat: 52.3676, lng: 4.9041, tz: AMS, arrive: d(-1), depart: d(4) },
      { id: 'bru', order: 2, name: 'Brussels', country: 'BE', lat: 50.8503, lng: 4.3517, tz: BRU, arrive: d(4), depart: d(7) },
      { id: 'mil', order: 3, name: 'Milan', country: 'IT', lat: 45.4642, lng: 9.19, tz: MIL, arrive: d(7), depart: d(11) },
      { id: 'hvr', order: 4, name: 'Hvar', country: 'HR', lat: 43.1729, lng: 16.4411, tz: HR, arrive: d(11), depart: d(14) },
    ],
    legs: [
      { id: 'leg-out', from: null, to: 'ams', mode: 'flight', title: 'Outbound flight' },
      { id: 'leg-ams-bru', from: 'ams', to: 'bru', mode: 'train', title: 'Train to Brussels' },
      { id: 'leg-bru-mil', from: 'bru', to: 'mil', mode: 'flight', title: 'Fly to Milan' },
      // Nothing booked yet: the leg shows "To book", so the sample has one thing left to do.
      { id: 'leg-mil-hvr', from: 'mil', to: 'hvr', mode: 'flight', title: 'Fly to Split, ferry to Hvar' },
      { id: 'leg-ret', from: 'hvr', to: null, mode: 'flight', title: 'Return flight' },
    ],
    reservations,
    expenses: [
      paidBooking(by('r-out'), 'you', now, 'transit', DUO),
      paidBooking(by('r-spiegel'), 'gb', now, 'stay', DUO),
      paidBooking(by('r-rijks'), 'gb', now, 'activity', DUO),
      paidBooking(by('r-cruise'), 'you', now, 'activity', DUO),
      paidBooking(by('r-train'), 'gb', now, 'transit', DUO),
      paidBooking(by('r-sablon'), 'gb', now, 'stay', DUO),
      paidBooking(by('r-bru-mxp'), 'you', now, 'transit', DUO),
      paidBooking(by('r-navigli'), 'gb', now, 'stay', DUO),
      paidBooking(by('r-pakleni'), 'you', now, 'stay', DUO),
      paidBooking(by('r-ret'), 'you', now, 'transit', DUO),
      expense({ id: 'e-taxi', title: 'Airport taxi · BLR', amount: 160000, currency: 'INR', payerId: 'you', splitWith: DUO, date: d(-2), category: 'taxi' }, now),
      expense({ id: 'e-schiphol', title: 'Schiphol → Centraal trains', amount: 1180, payerId: 'gb', splitWith: DUO, date: d(-1), category: 'transit' }, now),
      expense({ id: 'e-dinner', title: 'Dinner · Café de Klos', amount: 8420, payerId: 'gb', splitWith: DUO, date: d(-1), category: 'food', autoScanned: true }, now),
      // GB corrected a scanned bill, so the admin (you) is asked to approve the new amount.
      expense({ id: 'e-market', title: 'Albert Cuyp market lunch', amount: 2600, payerId: 'gb', splitWith: DUO, date: d(0), category: 'food', autoScanned: true, pendingAmount: 2950, pendingBy: 'gb' }, now),
    ],
  };
}

/** Austria–Croatia, finished a few weeks ago: fully booked, and everyone has settled up. */
export function buildPastTrip(now: Date = new Date()): Trip {
  const d0 = addDays(todayIn(VIE, now), -60);
  const d = (n: number) => addDays(d0, n);

  const reservations: Reservation[] = [
    res({ id: 'p-out', type: 'flight', legId: 'leg-out', title: 'Bangalore → Vienna', startLocal: `${d(-1)}T03:10`, startTz: IST, endLocal: `${d(0)}T06:00`, endTz: VIE,
      address: 'Kempegowda International Airport', lat: 13.1986, lng: 77.7066, route: 'BLR → DOH → VIE', service: 'QR 573 · QR 185', seat: '32A, 32B, 32C', confirmation: 'K7XQ2M', price: 132000, currency: 'EUR' }),
    res({ id: 'p-miiro', type: 'hotel', stopId: 'vie', title: 'Miiro Spittelberg', startLocal: `${d(0)}T15:00`, startTz: VIE, endLocal: `${d(2)}T11:00`, endTz: VIE,
      address: 'Kirchberggasse 6, 1070 Wien', lat: 48.2027, lng: 16.3563, seat: 'Double room + extra bed', confirmation: 'NH23111498268316', price: 36000, currency: 'EUR' }),
    res({ id: 'p-belvedere', type: 'activity', stopId: 'vie', title: 'Belvedere · Klimt galleries', startLocal: `${d(1)}T10:15`, startTz: VIE, endLocal: `${d(1)}T12:15`, endTz: VIE,
      address: 'Prinz-Eugen-Straße 27, 1030 Wien', lat: 48.1915, lng: 16.3809, seat: '3 adult tickets, timed entry', confirmation: 'BLV-4471-209', price: 5040, currency: 'EUR' }),
    res({ id: 'p-train', type: 'train', legId: 'leg-vie-gmu', title: 'Wien Hbf → Attnang-Puchheim', startLocal: `${d(2)}T09:57`, startTz: VIE, endLocal: `${d(2)}T12:50`, endTz: VIE,
      address: 'Wien Hauptbahnhof', lat: 48.1852, lng: 16.3757, route: 'Wien Hbf → Attnang-Puchheim', service: 'IC 548', seat: 'Car 24, seats 61–63', confirmation: '0457 1893 2210', price: 9640, currency: 'EUR' }),
    res({ id: 'p-seehotel', type: 'hotel', stopId: 'gmu', title: 'Seehotel Schwan', startLocal: `${d(2)}T15:00`, startTz: VIE, endLocal: `${d(5)}T10:00`, endTz: VIE,
      address: 'Rathausplatz 8, 4810 Gmunden', lat: 47.9183, lng: 13.7996, seat: 'Lake-view family room', confirmation: 'SS-88213', price: 61500, currency: 'EUR' }),
    res({ id: 'p-rex', type: 'train', legId: 'leg-gmu-dbv', title: 'Gmunden → Salzburg Hbf', startLocal: `${d(5)}T07:12`, startTz: VIE, endLocal: `${d(5)}T08:41`, endTz: VIE,
      address: 'Gmunden Bahnhof', lat: 47.9233, lng: 13.7859, route: 'Gmunden → Salzburg Hbf', service: 'REX 3911', price: 7350, currency: 'EUR', source: 'manual' }),
    res({ id: 'p-szg', type: 'flight', legId: 'leg-gmu-dbv', title: 'Salzburg → Dubrovnik', startLocal: `${d(5)}T12:40`, startTz: VIE, endLocal: `${d(5)}T14:20`, endTz: HR,
      address: 'Salzburg Airport', lat: 47.7933, lng: 13.0043, route: 'SZG → DBV', service: 'OS 8291', seat: '12A, 12B, 12C', confirmation: 'MZ4TR8', price: 41700, currency: 'EUR' }),
    res({ id: 'p-dbv', type: 'hotel', stopId: 'dbv', title: 'Villa Ragusa', startLocal: `${d(5)}T15:00`, startTz: HR, endLocal: `${d(8)}T10:00`, endTz: HR,
      address: 'Ulica od Puča 5, Dubrovnik', lat: 42.6406, lng: 18.1085, seat: 'Old Town apartment for 3', confirmation: 'VR-10442', price: 73500, currency: 'EUR' }),
    res({ id: 'p-walls', type: 'activity', stopId: 'dbv', title: 'City walls at sunset', startLocal: `${d(6)}T17:00`, startTz: HR, endLocal: `${d(6)}T19:00`, endTz: HR,
      address: 'Pile Gate, Dubrovnik', lat: 42.6418, lng: 18.1062, seat: '3 tickets', confirmation: 'DW-30218', price: 10500, currency: 'EUR' }),
    res({ id: 'p-ferry1', type: 'ferry', legId: 'leg-dbv-spu', title: 'Dubrovnik → Split', startLocal: `${d(8)}T16:00`, startTz: HR, endLocal: `${d(8)}T20:30`, endTz: HR,
      address: 'Gruž ferry port', lat: 42.6583, lng: 18.0857, route: 'Dubrovnik → Split', service: 'Coastal catamaran', seat: '3 adults', confirmation: 'KT-55120', price: 13500, currency: 'EUR' }),
    res({ id: 'p-split', type: 'hotel', stopId: 'spu', title: 'Palace Rooms Split', startLocal: `${d(8)}T21:00`, startTz: HR, endLocal: `${d(10)}T10:00`, endTz: HR,
      address: 'Dioklecijanova 3, Split', lat: 43.5081, lng: 16.4402, seat: 'Triple room', confirmation: 'PR-6618', price: 32000, currency: 'EUR' }),
    res({ id: 'p-ferry2', type: 'ferry', legId: 'leg-spu-hvr', title: 'Split → Hvar', startLocal: `${d(10)}T11:30`, startTz: HR, endLocal: `${d(10)}T12:35`, endTz: HR,
      address: 'Split ferry port', lat: 43.5025, lng: 16.44, route: 'Split → Hvar', service: 'Catamaran', seat: '3 adults', confirmation: 'AL-41107', price: 5400, currency: 'EUR' }),
    res({ id: 'p-hvar', type: 'hotel', stopId: 'hvr', title: 'Hotel Podstine', startLocal: `${d(10)}T14:00`, startTz: HR, endLocal: `${d(13)}T07:00`, endTz: HR,
      address: 'Put Podstina 11, Hvar', lat: 43.1691, lng: 16.4329, seat: 'Sea-view suite', confirmation: 'HP-90011', price: 89400, currency: 'EUR' }),
    res({ id: 'p-ret', type: 'flight', legId: 'leg-ret', title: 'Split → Bangalore', startLocal: `${d(13)}T10:45`, startTz: HR, endLocal: `${d(14)}T04:20`, endTz: IST,
      address: 'Split Airport', lat: 43.5389, lng: 16.298, route: 'SPU → DOH → BLR', service: 'QR 218 · QR 572', seat: '30D, 30E, 30F', confirmation: 'K8PZ7L', price: 129000, currency: 'EUR' }),
  ];
  const by = (id: string) => reservations.find(r => r.id === id)!;
  const people = travelers(now);

  const expenses: Expense[] = [
    paidBooking(by('p-out'), 'you', now, 'transit'),
    paidBooking(by('p-miiro'), 'you', now, 'stay'),
    paidBooking(by('p-belvedere'), 'priya', now, 'activity'),
    paidBooking(by('p-train'), 'sam', now, 'transit'),
    paidBooking(by('p-seehotel'), 'sam', now, 'stay'),
    paidBooking(by('p-rex'), 'priya', now, 'transit'),
    paidBooking(by('p-szg'), 'sam', now, 'transit'),
    paidBooking(by('p-dbv'), 'priya', now, 'stay'),
    paidBooking(by('p-walls'), 'you', now, 'activity'),
    paidBooking(by('p-ferry1'), 'sam', now, 'transit'),
    paidBooking(by('p-split'), 'priya', now, 'stay'),
    paidBooking(by('p-ferry2'), 'you', now, 'transit'),
    paidBooking(by('p-hvar'), 'priya', now, 'stay'),
    paidBooking(by('p-ret'), 'you', now, 'transit'),
    expense({ id: 'p-e-naschmarkt', title: 'Brunch · Naschmarkt', amount: 6200, payerId: 'priya', date: d(0), category: 'food', autoScanned: true }, now),
    expense({ id: 'p-e-heuriger', title: 'Heuriger dinner, Grinzing', amount: 11800, payerId: 'sam', date: d(1), category: 'food' }, now),
    expense({ id: 'p-e-boat', title: 'Traunsee boat hire', amount: 9000, payerId: 'you', date: d(3), category: 'activity' }, now),
    expense({ id: 'p-e-konoba', title: 'Konoba dinner, Hvar', amount: 15400, payerId: 'sam', date: d(11), category: 'food', autoScanned: true }, now),
    expense({ id: 'p-e-taxi', title: 'Taxi to Split airport', amount: 6500, payerId: 'priya', date: d(13), category: 'taxi' }, now),
  ];
  // Everyone paid everyone back on the last day: the Ledger reads all square.
  const name = (id: string) => (id === 'you' ? 'You' : people.find(p => p.id === id)!.name);
  const settledOn = new Date(`${d(13)}T18:00:00Z`);
  settleUp(netBalances(expenses, people, 'EUR', {})).forEach((t, i) => {
    expenses.push(settlementExpense(t, 'EUR', { from: name(t.from), to: name(t.to) }, `p-settle-${i}`, settledOn));
  });

  return {
    id: 'trip-demo-past',
    token: PAST_TOKEN,
    name: 'Austria–Croatia',
    home: HOME,
    baseCurrency: 'EUR',
    adminId: 'you',
    isDemo: true,
    travelers: people,
    stops: [
      { id: 'vie', order: 1, name: 'Vienna', country: 'AT', lat: 48.2082, lng: 16.3738, tz: VIE, arrive: d(0), depart: d(2) },
      { id: 'gmu', order: 2, name: 'Gmunden', country: 'AT', lat: 47.9186, lng: 13.7997, tz: VIE, arrive: d(2), depart: d(5) },
      { id: 'dbv', order: 3, name: 'Dubrovnik', country: 'HR', lat: 42.6507, lng: 18.0944, tz: HR, arrive: d(5), depart: d(8) },
      { id: 'spu', order: 4, name: 'Split', country: 'HR', lat: 43.5081, lng: 16.4402, tz: HR, arrive: d(8), depart: d(10) },
      { id: 'hvr', order: 5, name: 'Hvar', country: 'HR', lat: 43.1729, lng: 16.4411, tz: HR, arrive: d(10), depart: d(13) },
    ],
    legs: [
      { id: 'leg-out', from: null, to: 'vie', mode: 'flight', title: 'Outbound flight' },
      { id: 'leg-vie-gmu', from: 'vie', to: 'gmu', mode: 'train', title: 'Train to Gmunden' },
      { id: 'leg-gmu-dbv', from: 'gmu', to: 'dbv', mode: 'flight', title: 'Salzburg to Dubrovnik' },
      { id: 'leg-dbv-spu', from: 'dbv', to: 'spu', mode: 'ferry', title: 'Coastal ferry' },
      { id: 'leg-spu-hvr', from: 'spu', to: 'hvr', mode: 'ferry', title: 'Ferry to Hvar' },
      { id: 'leg-ret', from: 'hvr', to: null, mode: 'flight', title: 'Return flight' },
    ],
    reservations,
    expenses,
  };
}

export function buildSampleTrip(token: string, now: Date = new Date()): Trip | null {
  return token === DEMO_TOKEN ? buildDemoTrip(now) : token === PAST_TOKEN ? buildPastTrip(now) : null;
}
