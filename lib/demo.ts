// The Austria–Croatia demo trip. Every date is relative to "now", so a reviewer always lands
// mid-trip: Vienna is the current stop and the train to Attnang-Puchheim leaves in ~75 minutes.

import type { Trip } from './types';
import { addDays, instantToZoned, todayIn } from './time';

export const DEMO_TOKEN = 'demo';
const VIE = 'Europe/Vienna';
const HR = 'Europe/Zagreb';
const IST = 'Asia/Kolkata';

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

export function buildDemoTrip(now: Date = new Date()): Trip {
  const d0 = todayIn(VIE, now);
  const d = (n: number) => addDays(d0, n);
  const trainOut = inMinutes(now, 75, VIE);

  return {
    id: 'trip-demo',
    token: DEMO_TOKEN,
    name: 'Austria–Croatia',
    home: { name: 'Bangalore', country: 'IN', lat: 12.9716, lng: 77.5946, tz: IST },
    baseCurrency: 'EUR',
    adminId: 'you',
    isDemo: true,
    travelers: [
      { id: 'you', name: 'T', color: 'var(--acc)' },
      { id: 'sam', name: 'Sam', color: '#2E9E7E' },
      { id: 'priya', name: 'Priya', color: '#B4477E' },
    ],
    stops: [
      { id: 'vie', order: 1, name: 'Vienna', country: 'AT', lat: 48.2082, lng: 16.3738, tz: VIE, arrive: d(-2), depart: d(0) },
      { id: 'gmu', order: 2, name: 'Gmunden', country: 'AT', lat: 47.9186, lng: 13.7997, tz: VIE, arrive: d(0), depart: d(3) },
      { id: 'dbv', order: 3, name: 'Dubrovnik', country: 'HR', lat: 42.6507, lng: 18.0944, tz: HR, arrive: d(3), depart: d(6) },
      { id: 'spu', order: 4, name: 'Split', country: 'HR', lat: 43.5081, lng: 16.4402, tz: HR, arrive: d(6), depart: d(8) },
      { id: 'hvr', order: 5, name: 'Hvar', country: 'HR', lat: 43.1729, lng: 16.4411, tz: HR, arrive: d(8), depart: d(11) },
    ],
    legs: [
      { id: 'leg-out', from: null, to: 'vie', mode: 'flight', title: 'Outbound flight' },
      { id: 'leg-vie-gmu', from: 'vie', to: 'gmu', mode: 'train', title: 'Train to Gmunden' },
      { id: 'leg-gmu-dbv', from: 'gmu', to: 'dbv', mode: 'flight', title: 'Salzburg to Dubrovnik' },
      { id: 'leg-dbv-spu', from: 'dbv', to: 'spu', mode: 'ferry', title: 'Coastal ferry' },
      { id: 'leg-spu-hvr', from: 'spu', to: 'hvr', mode: 'ferry', title: 'Ferry to Hvar' },
      { id: 'leg-ret', from: 'hvr', to: null, mode: 'flight', title: 'Return flight' },
    ],
    reservations: [
      {
        id: 'r-out', type: 'flight', status: 'booked', stopId: null, legId: 'leg-out',
        title: 'Bangalore → Vienna', startLocal: `${d(-2)}T03:40`, startTz: IST, endLocal: `${d(-2)}T10:05`, endTz: VIE,
        address: 'Kempegowda International Airport', lat: 13.1986, lng: 77.7066, route: 'BLR → DOH → VIE',
        service: 'QR 573 · QR 185', seat: '32A, 32B', confirmation: 'K7XQ2M', price: null, currency: null, cancelBy: null, source: 'manual',
      },
      {
        id: 'r-miiro', type: 'hotel', status: 'booked', stopId: 'vie', legId: null,
        title: 'Miiro Spittelberg', startLocal: `${d(-2)}T15:00`, startTz: VIE, endLocal: `${d(0)}T11:00`, endTz: VIE,
        address: 'Kirchberggasse 6, 1070 Wien', lat: 48.2027, lng: 16.3563, route: null, service: null,
        seat: 'Double room', confirmation: 'NH23111498268316', price: 24000, currency: 'EUR', cancelBy: `${d(-3)}T23:59`, source: 'scan',
      },
      {
        id: 'r-train', type: 'train', status: 'booked', stopId: null, legId: 'leg-vie-gmu',
        title: 'Wien Hbf → Attnang-Puchheim', startLocal: trainOut, startTz: VIE, endLocal: addMinutesLocal(trainOut, 173), endTz: VIE,
        address: 'Wien Hauptbahnhof', lat: 48.1852, lng: 16.3757, route: 'Wien Hbf → Attnang-Puchheim',
        service: 'IC 548', seat: 'Car 24, seats 61–62', confirmation: '0457 1893 2210', price: 9640, currency: 'EUR', cancelBy: null, source: 'scan',
      },
      {
        id: 'r-rex', type: 'train', status: 'booked', stopId: null, legId: 'leg-gmu-dbv',
        title: 'Gmunden → Salzburg Hbf', startLocal: `${d(3)}T07:12`, startTz: VIE, endLocal: `${d(3)}T08:41`, endTz: VIE,
        address: 'Gmunden Bahnhof', lat: 47.9233, lng: 13.7859, route: 'Gmunden → Salzburg Hbf',
        service: 'REX 3911', seat: null, confirmation: null, price: null, currency: null, cancelBy: null, source: 'manual',
      },
      {
        id: 'r-szg', type: 'flight', status: 'booked', stopId: null, legId: 'leg-gmu-dbv',
        title: 'Salzburg → Dubrovnik', startLocal: `${d(3)}T12:40`, startTz: VIE, endLocal: `${d(3)}T14:20`, endTz: HR,
        address: 'Salzburg Airport', lat: 47.7933, lng: 13.0043, route: 'SZG → DBV',
        service: 'OS 8291', seat: null, confirmation: 'MZ4TR8', price: null, currency: null, cancelBy: null, source: 'scan',
      },
    ],
    expenses: [
      {
        id: 'e-miiro', title: 'Miiro deposit', amount: 12000, currency: 'EUR', payerId: 'you', splitWith: ['you', 'sam'],
        date: d(-2), category: 'stay', autoScanned: false, pendingAmount: null, pendingBy: null, createdAt: now.toISOString(),
      },
      {
        id: 'e-train', title: 'Wien → Attnang tickets', amount: 9640, currency: 'EUR', payerId: 'you', splitWith: ['you', 'sam'],
        date: d(-1), category: 'transit', autoScanned: false, pendingAmount: null, pendingBy: null, createdAt: now.toISOString(),
      },
      {
        id: 'e-dinner', title: 'Dinner · Naschmarkt', amount: 5800, currency: 'EUR', payerId: 'priya', splitWith: ['you', 'sam', 'priya'],
        date: d(-1), category: 'food', autoScanned: true, pendingAmount: 6200, pendingBy: 'priya', createdAt: now.toISOString(),
      },
      {
        id: 'e-taxi', title: 'Airport taxi · BLR', amount: 240000, currency: 'INR', payerId: 'you', splitWith: ['you', 'priya'],
        date: d(-2), category: 'taxi', autoScanned: false, pendingAmount: null, pendingBy: null, createdAt: now.toISOString(),
      },
    ],
  };
}
