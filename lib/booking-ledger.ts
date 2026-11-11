// Bookings and the Ledger: a paid booking is logged as an expense automatically, and the same
// booking can't be added twice.

import type { Expense, Reservation, Trip } from './types';

/** The Ledger entry made from a booking always has this id, so it is created once and updated after. */
export const expenseIdFor = (reservationId: string) => `e-${reservationId}`;

const CATEGORY: Record<Reservation['type'], Expense['category']> = {
  hotel: 'stay', flight: 'transit', train: 'transit', ferry: 'transit', bus: 'transit', car: 'transit', activity: 'activity', dinner: 'food',
};

/**
 * The expense a booking implies: only once it is booked and has a price. Paid by whoever adds
 * it, split with everyone on the trip (people can change that in the Ledger).
 */
export function bookingExpense(r: Reservation, trip: Trip, payerId: string, now: Date = new Date()): Expense | null {
  if (r.status !== 'booked' || r.price === null || r.price <= 0 || !r.currency) return null;
  return {
    id: expenseIdFor(r.id),
    title: r.title,
    amount: r.price,
    currency: r.currency,
    payerId,
    splitWith: trip.travelers.map(t => t.id),
    date: now.toISOString().slice(0, 10),
    category: CATEGORY[r.type],
    autoScanned: r.source === 'scan',
    pendingAmount: null,
    pendingBy: null,
    createdAt: now.toISOString(),
  };
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * An existing booking that this one repeats: same confirmation number, or the same kind of
 * booking with the same name starting at the same time.
 */
export function findDuplicate(trip: Trip, c: Pick<Reservation, 'id' | 'type' | 'title' | 'startLocal' | 'confirmation'>): Reservation | undefined {
  const conf = norm(c.confirmation);
  return trip.reservations.find(r => r.id !== c.id && (
    (conf.length >= 4 && norm(r.confirmation) === conf) ||
    (r.type === c.type && norm(r.title) !== '' && norm(r.title) === norm(c.title) && r.startLocal === c.startLocal)
  ));
}
