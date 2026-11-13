import { describe, expect, it } from 'vitest';
import { buildDemoTrip } from './fixtures/austria-demo';
import { applyMutation, approveEdit, editExpense, newToken, rejectEdit } from '../lib/mutations';

const trip = buildDemoTrip(new Date('2026-11-04T09:00:00Z'));
const dinner = trip.expenses.find(e => e.id === 'e-dinner')!;
const clean = rejectEdit(dinner); // €58, no pending edit

describe('scanned-bill approval', () => {
  it('turns a non-admin amount change into a pending edit', () => {
    const out = editExpense(trip, clean, { ...clean, amount: 6200 }, 'priya');
    expect(out.amount).toBe(5800);
    expect(out.pendingAmount).toBe(6200);
    expect(out.pendingBy).toBe('priya');
  });
  it('lets the admin change it directly', () => {
    const out = editExpense(trip, clean, { ...clean, amount: 6200 }, 'you');
    expect(out.amount).toBe(6200);
    expect(out.pendingAmount).toBeNull();
  });
  it('lets anyone fix the title of a scanned bill without approval', () => {
    const out = editExpense(trip, clean, { ...clean, title: 'Dinner at Naschmarkt' }, 'sam');
    expect(out.title).toBe('Dinner at Naschmarkt');
    expect(out.pendingAmount).toBeNull();
  });
  it('approve applies the new amount; keep restores the scanned one', () => {
    expect(approveEdit(dinner)).toMatchObject({ amount: 6200, pendingAmount: null, pendingBy: null });
    expect(rejectEdit(dinner)).toMatchObject({ amount: 5800, pendingAmount: null, pendingBy: null });
  });
});

describe('mutations', () => {
  it('upserts and deletes', () => {
    const t1 = applyMutation(trip, { kind: 'upsertExpense', expense: { ...clean, id: 'new' } });
    expect(t1.expenses).toHaveLength(5);
    const t2 = applyMutation(t1, { kind: 'upsertExpense', expense: { ...clean, id: 'new', amount: 1 } });
    expect(t2.expenses).toHaveLength(5);
    expect(t2.expenses.find(e => e.id === 'new')!.amount).toBe(1);
    expect(applyMutation(t2, { kind: 'deleteExpense', id: 'new' }).expenses).toHaveLength(4);
  });
  it('makes 128-bit share tokens', () => {
    const a = newToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newToken()).not.toBe(a);
  });
});

describe('profiles and recommendations', () => {
  const profile = { interests: ['a', 'b', 'c', 'd', 'e'], link: null, updatedAt: '2026-11-06T00:00:00Z' };
  const recs = { stopId: 'vie', travelerId: 'sam', items: [], basis: { interests: [], link: null }, generatedAt: 'x' };
  it('sets a profile on one traveler only', () => {
    const t = applyMutation(trip, { kind: 'upsertProfile', travelerId: 'sam', profile });
    expect(t.travelers.find(x => x.id === 'sam')!.profile).toEqual(profile);
    expect(t.travelers.find(x => x.id === 'priya')!.profile).toEqual(trip.travelers.find(x => x.id === 'priya')!.profile);
  });
  it('stores recommendations per city and traveler', () => {
    const t = applyMutation(trip, { kind: 'setRecs', recs });
    expect(t.recs!['vie:sam']).toEqual(recs);
  });
  it('a trip edit never wipes profiles or recommendations', () => {
    const withBoth = applyMutation(applyMutation(trip, { kind: 'upsertProfile', travelerId: 'sam', profile }), { kind: 'setRecs', recs });
    const edited = { ...withBoth, name: 'Renamed', travelers: withBoth.travelers.map(t => ({ ...t, profile: null })), recs: undefined };
    const out = applyMutation(withBoth, { kind: 'replaceTrip', trip: edited });
    expect(out.name).toBe('Renamed');
    expect(out.travelers.find(x => x.id === 'sam')!.profile).toEqual(profile);
    expect(out.recs!['vie:sam']).toEqual(recs);
  });
});
