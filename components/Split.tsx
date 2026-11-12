'use client';

import { useMemo, useState } from 'react';
import { fmtMoney, netBalances, rawDebtCount, settlementExpense, settleUp, spendSummary, totalsByCurrency } from '@/lib/balances';
import type { RatesState } from '@/lib/hooks';
import { approveEdit, newId, rejectEdit } from '@/lib/mutations';
import { fmtDay } from '@/lib/time';
import type { Expense, Trip } from '@/lib/types';
import { Avatar, Icon } from './ui';

const CAT: Record<Expense['category'], string> = {
  stay: 'hotel', transit: 'train', food: 'restaurant', taxi: 'local_taxi', activity: 'local_activity', other: 'receipt_long',
};

export function Split({ trip, me, rates, onOpen, onUpdate, onSwitchMe }: {
  trip: Trip; me: string; rates: RatesState; onOpen: (e: Expense) => void; onUpdate: (e: Expense) => void; onSwitchMe: () => void;
}) {
  const name = (id: string) => (id === me ? 'You' : trip.travelers.find(t => t.id === id)?.name ?? 'Someone');
  const base = trip.baseCurrency;
  const { net, transfers, raw, spend, error } = useMemo(() => {
    try {
      const n = netBalances(trip.expenses, trip.travelers, base, rates.rates);
      return { net: n, transfers: settleUp(n), raw: rawDebtCount(trip.expenses, trip.travelers, base, rates.rates), spend: spendSummary(trip.expenses, trip.travelers, me, base, rates.rates), error: null };
    } catch (e) {
      return { net: new Map<string, number>(), transfers: [], raw: 0, spend: null, error: (e as Error).message };
    }
  }, [trip.expenses, trip.travelers, base, rates.rates, me]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const plainName = (id: string) => trip.travelers.find(t => t.id === id)?.name ?? 'Someone';
  const markPaid = (t: { from: string; to: string; amount: number }) => {
    onUpdate(settlementExpense(t, base, { from: plainName(t.from), to: plainName(t.to) }, newId('e')));
    setConfirming(null);
  };
  const mine = net.get(me) ?? 0;
  const totals = totalsByCurrency(trip.expenses, base);
  const isAdmin = me === trip.adminId;
  const pending = trip.expenses.filter(e => e.pendingAmount != null);
  const sorted = [...trip.expenses].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const foreign = trip.expenses.some(e => e.currency !== base);
  const meT = trip.travelers.find(t => t.id === me);
  const foreignNote = totals.filter(([c]) => c !== base).map(([c, v]) => fmtMoney(v, c)).join(' + ');

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Ledger</h1>
          <p className="screen-sub">{trip.name.replace('–', ' → ')} group</p>
        </div>
        <button className="avatars" onClick={onSwitchMe} aria-label={`Travelers. You are ${meT?.name}. Switch`}>
          {trip.travelers.map(t => <Avatar key={t.id} t={t} />)}
        </button>
      </div>

      {trip.expenses.length > 0 && (
        <section className="balances" aria-label="Balances">
          <div className="k">{mine > 0 ? 'You’re owed overall' : mine < 0 ? 'You owe overall' : 'You’re all square'}</div>
          <div className={`big ${mine < 0 ? 'neg' : mine === 0 ? 'zero' : ''}`}>{fmtMoney(mine, base, { sign: true })}</div>
          {/* The trip's spend, then your part of it. What you're owed = what you paid − your share. */}
          {spend && (
            <div className="spend" aria-label="Trip spend">
              <div><div className="k">Trip total</div><div className="v">{fmtMoney(spend.total, base)}</div><div className="s">everyone</div></div>
              <div><div className="k">Your share</div><div className="v">{fmtMoney(spend.share, base)}</div><div className="s">what you used</div></div>
              <div><div className="k">You paid</div><div className="v">{fmtMoney(spend.paid, base)}</div><div className="s">out of pocket</div></div>
            </div>
          )}
          {error && <div className="fx">Can’t convert every currency right now. Totals by currency are below.</div>}
          {foreign && !error && (
            <div className="fx">
              All in {base} · {foreignNote} converted at {rates.estimate ? 'estimated rates (offline)' : `ECB rates of ${rates.date}`}
            </div>
          )}
        </section>
      )}

      {transfers.length > 0 && (
        <section className="settle" aria-label="Settle up">
          <div className="section-h">
            <h3>Settle up</h3>
            <span className="tag">Simplified · {transfers.length} {transfers.length === 1 ? 'payment' : 'payments'}</span>
          </div>
          <p className="help settle-why">
            The fewest payments that clear every debt in the group{raw > transfers.length ? `, instead of ${raw} separate ones` : ''}.
          </p>
          {transfers.map(t => {
            const k = `${t.from}-${t.to}`;
            const from = trip.travelers.find(x => x.id === t.from)!;
            return (
              <div className="settle-row" key={k}>
                <Avatar t={from} small />
                <span className="settle-who"><b>{name(t.from)}</b> {t.from === me ? 'pay' : 'pays'} <b>{name(t.to)}</b></span>
                <span className="amt">{fmtMoney(t.amount, base)}</span>
                {confirming === k ? (
                  <button className="paid sure" onClick={() => markPaid(t)}>Confirm</button>
                ) : (
                  <button className="paid" onClick={() => setConfirming(k)} aria-label={`Mark ${fmtMoney(t.amount, base)} from ${plainName(t.from)} to ${plainName(t.to)} as paid`}>Paid</button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {error && totals.length > 0 && (
        <div className="totals">
          {totals.map(([c, v]) => (
            <div className="total" key={c}><div className="k">{c} TOTAL</div><div className="v">{fmtMoney(v, c)}</div></div>
          ))}
        </div>
      )}

      <div className="section-h">
        <h3>Activity</h3>
        <span className="tag">Shared log</span>
      </div>

      {pending.map(e => (
        <section className={`approval ${isAdmin ? '' : 'waiting'}`} key={`p-${e.id}`} aria-label="Bill edit needs approval">
          <div className="h">
            <span className="gv"><Icon name="gavel" fill /></span>
            <div>
              <div className="h1">{isAdmin ? 'Bill edit needs approval' : 'Waiting for the trip admin'}</div>
              <div className="h2">{isAdmin ? 'You’re the trip admin' : `${name(trip.adminId)} will approve or keep the scanned amount`}</div>
            </div>
            <span className="pill">Pending</span>
          </div>
          <div className="inner">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t1">{e.title}</div>
              <div className="t2">{name(e.pendingBy ?? '')} edited the auto-scanned amount</div>
            </div>
            <div>
              <div className="was">{fmtMoney(e.amount, e.currency)}</div>
              <div className="now">{fmtMoney(e.pendingAmount!, e.currency)}</div>
            </div>
          </div>
          {isAdmin && (
            <div className="btns">
              <button className="btn-ok" onClick={() => onUpdate(approveEdit(e))}>Approve</button>
              <button className="btn-keep" onClick={() => onUpdate(rejectEdit(e))}>Keep {fmtMoney(e.amount, e.currency).replace(/\.00$/, '')}</button>
            </div>
          )}
        </section>
      ))}

      {!sorted.length && (
        <div className="empty-state">
          <Icon name="receipt_long" />
          <h2>No expenses yet</h2>
          <p>Tap + to log what you paid, or scan a receipt.</p>
        </div>
      )}

      {sorted.map(e => {
        const c = CAT[e.category];
        const n = e.splitWith.length;
        return (
          <button className="exp" key={e.id} onClick={() => onOpen(e)}>
            <span className="ic"><Icon name={c} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="t1">{e.title}</div>
              <div className="t2">{name(e.payerId)} paid · {n === 1 ? `for ${name(e.splitWith[0])}` : `split ${n} ways`}{e.autoScanned ? ' · scanned' : ''}</div>
            </div>
            <div className="r">
              <div className="amt">{fmtMoney(e.amount, e.currency)}</div>
              <div className="dt2">{fmtDay(e.date)}</div>
            </div>
          </button>
        );
      })}

      <div className="footnote">
        <Icon name="visibility" />
        <span>Shared log — anyone with the link can add expenses. Edits to auto-scanned bills need admin approval.</span>
      </div>
    </div>
  );
}
