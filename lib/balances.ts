// Who owes whom. All money is integer minor units, so nothing drifts by a cent.

import type { Currency, Expense, Traveler } from './types';
import { CURRENCY_DECIMALS, CURRENCY_SYMBOL } from './types';

/** Units of each currency per 1 unit of the base currency, e.g. { EUR: 1, INR: 98.4 }. */
export type Rates = Partial<Record<Currency, number>>;

/** Split `total` into `n` integer shares that add up exactly (first shares take the remainder). */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < Math.abs(rem) ? Math.sign(rem) : 0));
}

/** Convert minor units of `from` into minor units of `base`. */
export function convert(amount: number, from: Currency, base: Currency, rates: Rates): number {
  if (from === base) return amount;
  const rate = rates[from];
  if (!rate) throw new Error(`No exchange rate for ${from}`);
  const major = amount / 10 ** CURRENCY_DECIMALS[from];
  return Math.round((major / rate) * 10 ** CURRENCY_DECIMALS[base]);
}

/** Net position per traveler in base currency: positive = is owed, negative = owes. */
export function netBalances(expenses: Expense[], travelers: Traveler[], base: Currency, rates: Rates): Map<string, number> {
  const net = new Map<string, number>(travelers.map(t => [t.id, 0]));
  for (const e of expenses) {
    const people = e.splitWith.filter(id => net.has(id));
    if (!people.length || !net.has(e.payerId)) continue;
    // Pending edits do not count until the admin approves them.
    const total = convert(e.amount, e.currency, base, rates);
    net.set(e.payerId, net.get(e.payerId)! + total);
    splitEvenly(total, people.length).forEach((share, i) => {
      net.set(people[i], net.get(people[i])! - share);
    });
  }
  return net;
}

export interface Transfer { from: string; to: string; amount: number }

/** The fewest payments that clear every balance (greedy largest-first; optimal for small groups). */
export function settleUp(net: Map<string, number>): Transfer[] {
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.v - a.v);
    creditors.sort((a, b) => b.v - a.v);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.v, c.v);
    if (amt > 0) out.push({ from: d.id, to: c.id, amount: amt });
    d.v -= amt;
    c.v -= amt;
    if (d.v === 0) debtors.shift();
    if (c.v === 0) creditors.shift();
  }
  return out;
}

/** Spend per currency, base currency first. */
export function totalsByCurrency(expenses: Expense[], base: Currency): [Currency, number][] {
  const t = new Map<Currency, number>();
  for (const e of expenses) t.set(e.currency, (t.get(e.currency) ?? 0) + e.amount);
  return [...t].sort((a, b) => (a[0] === base ? -1 : b[0] === base ? 1 : a[0].localeCompare(b[0])));
}

export function fmtMoney(amount: number, currency: Currency, opts: { sign?: boolean } = {}): string {
  const dec = CURRENCY_DECIMALS[currency];
  const major = Math.abs(amount) / 10 ** dec;
  const body = major.toLocaleString('en-US', {
    minimumFractionDigits: currency === 'INR' && Number.isInteger(major) ? 0 : dec,
    maximumFractionDigits: dec,
  });
  const sign = amount < 0 ? '−' : opts.sign && amount > 0 ? '+' : '';
  return `${sign}${CURRENCY_SYMBOL[currency]}${body}`;
}

/** "62.00" → 6200 for EUR. Returns null for anything that is not a positive amount. */
export function parseMoney(input: string, currency: Currency): number | null {
  const clean = input.replace(/[^\d.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(clean);
  if (!clean || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10 ** CURRENCY_DECIMALS[currency]);
}

/**
 * Recording a settle-up payment: the debtor "pays" the creditor's share of a one-person expense,
 * which cancels exactly that debt in netBalances. Amount is in the base currency.
 */
export function settlementExpense(t: Transfer, base: Currency, names: { from: string; to: string }, id: string, now: Date = new Date()): Expense {
  return {
    id,
    title: `${names.from} paid ${names.to} back`,
    amount: t.amount,
    currency: base,
    payerId: t.from,
    splitWith: [t.to],
    date: now.toISOString().slice(0, 10),
    category: 'other',
    autoScanned: false,
    pendingAmount: null,
    pendingBy: null,
    createdAt: now.toISOString(),
  };
}

/**
 * How many separate debts there would be without simplifying: every pair of people who owe each
 * other something on the raw expenses (after netting A↔B against B↔A). Shown next to the
 * simplified number so the saving is visible.
 */
export function rawDebtCount(expenses: Expense[], travelers: Traveler[], base: Currency, rates: Rates): number {
  const ids = new Set(travelers.map(t => t.id));
  const pair = new Map<string, number>(); // "a|b" with a < b: positive = b owes a
  for (const e of expenses) {
    const people = e.splitWith.filter(id => ids.has(id));
    if (!people.length || !ids.has(e.payerId)) continue;
    const total = convert(e.amount, e.currency, base, rates);
    splitEvenly(total, people.length).forEach((share, i) => {
      const debtor = people[i];
      if (debtor === e.payerId) return;
      const [a, b] = [e.payerId, debtor].sort();
      const k = `${a}|${b}`;
      pair.set(k, (pair.get(k) ?? 0) + (a === e.payerId ? share : -share));
    });
  }
  return [...pair.values()].filter(v => v !== 0).length;
}
