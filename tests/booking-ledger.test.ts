import { describe, expect, it } from 'vitest';
import { bookingExpense, expenseIdFor, findDuplicate } from '../lib/booking-ledger';
import { buildDemoTrip } from '../lib/demo';

const trip = buildDemoTrip(new Date('2026-11-11T09:00:00Z'));
const miiro = trip.reservations.find(r => r.id === 'r-miiro')!;

describe('booking → Ledger', () => {
  it('logs a booked booking with a price as a stay expense for everyone', () => {
    const e = bookingExpense(miiro, trip, 'you', new Date('2026-11-11T10:00:00Z'))!;
    expect(e).toMatchObject({ id: expenseIdFor('r-miiro'), title: 'Miiro Spittelberg', amount: 36000, currency: 'EUR', payerId: 'you', category: 'stay', autoScanned: true, date: '2026-11-11' });
    expect(e.splitWith).toEqual(['you', 'sam', 'priya']);
  });
  it('skips bookings that are not booked yet or have no price', () => {
    expect(bookingExpense({ ...miiro, status: 'pending' }, trip, 'you')).toBeNull();
    expect(bookingExpense({ ...miiro, price: null }, trip, 'you')).toBeNull();
    expect(bookingExpense({ ...miiro, currency: null }, trip, 'you')).toBeNull();
  });
  it('maps types to Ledger categories', () => {
    const train = trip.reservations.find(r => r.id === 'r-train')!;
    expect(bookingExpense(train, trip, 'you')!.category).toBe('transit');
    expect(bookingExpense({ ...miiro, type: 'dinner' }, trip, 'you')!.category).toBe('food');
  });
});

describe('duplicate bookings', () => {
  it('spots the same confirmation number, however it is typed', () => {
    expect(findDuplicate(trip, { id: 'new', type: 'hotel', title: 'Something else', startLocal: '2026-12-01T15:00', confirmation: 'nh2311 1498 268316' })?.id).toBe('r-miiro');
  });
  it('spots the same booking without a confirmation number', () => {
    expect(findDuplicate(trip, { id: 'new', type: 'hotel', title: 'miiro spittelberg', startLocal: miiro.startLocal, confirmation: null })?.id).toBe('r-miiro');
  });
  it('does not flag the booking itself, or a different stay', () => {
    expect(findDuplicate(trip, miiro)).toBeUndefined();
    expect(findDuplicate(trip, { id: 'new', type: 'hotel', title: 'Miiro Spittelberg', startLocal: '2026-12-01T15:00', confirmation: null })).toBeUndefined();
  });
});

describe('saving two changes at once on this phone', () => {
  it('keeps both', async () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: k => void mem.delete(k),
      clear: () => mem.clear(), key: () => null, length: 0,
    } as Storage;
    const { LocalStore } = await import('../lib/store');
    const store = new LocalStore();
    const t = { ...buildDemoTrip(new Date('2026-11-11T09:00:00Z')), token: 'x'.repeat(32), isDemo: false };
    await store.create(t);
    const r = { ...miiro, id: 'r-new', title: 'Second stay' };
    await Promise.all([
      store.apply(t.token, { kind: 'upsertReservation', reservation: r }),
      store.apply(t.token, { kind: 'upsertExpense', expense: bookingExpense(r, t, 'you')! }),
    ]);
    const after = (await store.load(t.token))!;
    expect(after.reservations.some(x => x.id === 'r-new')).toBe(true);
    expect(after.expenses.some(x => x.id === expenseIdFor('r-new'))).toBe(true);
  });
});
