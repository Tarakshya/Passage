// Every change to a trip is one of these. The same reducer applies a change optimistically on
// this phone, replays queued changes after being offline, and runs in the local demo store.

import type { Expense, Reservation, Trip } from './types';

export type Mutation =
  | { kind: 'upsertReservation'; reservation: Reservation }
  | { kind: 'deleteReservation'; id: string }
  | { kind: 'upsertExpense'; expense: Expense }
  | { kind: 'deleteExpense'; id: string }
  | { kind: 'replaceTrip'; trip: Trip };

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex(x => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

export function applyMutation(trip: Trip, m: Mutation): Trip {
  switch (m.kind) {
    case 'upsertReservation':
      return { ...trip, reservations: upsert(trip.reservations, m.reservation) };
    case 'deleteReservation':
      return { ...trip, reservations: trip.reservations.filter(r => r.id !== m.id) };
    case 'upsertExpense':
      return { ...trip, expenses: upsert(trip.expenses, m.expense) };
    case 'deleteExpense':
      return { ...trip, expenses: trip.expenses.filter(e => e.id !== m.id) };
    case 'replaceTrip':
      return m.trip;
  }
}

/**
 * Editing an expense. Admins change it directly. Anyone else changing the amount of a bill that
 * Claude scanned creates a pending edit that the admin must approve.
 */
export function editExpense(trip: Trip, before: Expense, after: Expense, actorId: string): Expense {
  const amountChanged = after.amount !== before.amount || after.currency !== before.currency;
  if (before.autoScanned && amountChanged && actorId !== trip.adminId) {
    return { ...after, amount: before.amount, currency: before.currency, pendingAmount: after.amount, pendingBy: actorId };
  }
  return { ...after, pendingAmount: after.pendingAmount ?? null, pendingBy: after.pendingBy ?? null };
}

export function approveEdit(e: Expense): Expense {
  if (e.pendingAmount == null) return e;
  return { ...e, amount: e.pendingAmount, pendingAmount: null, pendingBy: null };
}

export function rejectEdit(e: Expense): Expense {
  return { ...e, pendingAmount: null, pendingBy: null };
}

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

/** 128-bit share token: the only key to a trip, so it must be unguessable. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
