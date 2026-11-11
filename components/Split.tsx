'use client';

import { useMemo } from 'react';
import { fmtMoney, netBalances, settleUp, totalsByCurrency } from '@/lib/balances';
import type { RatesState } from '@/lib/hooks';
import { approveEdit, rejectEdit } from '@/lib/mutations';
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
  const { net, transfers, error } = useMemo(() => {
    try {
      const n = netBalances(trip.expenses, trip.travelers, base, rates.rates);
      return { net: n, transfers: settleUp(n), error: null };
    } catch (e) {
      return { net: new Map<string, number>(), transfers: [], error: (e as Error).message };
    }
  }, [trip.expenses, trip.travelers, base, rates.rates]);
  const mine = net.get(me) ?? 0;
  const myTransfers = transfers.filter(t => t.from === me || t.to === me);
  const others = transfers.filter(t => t.from !== me && t.to !== me);
  const totals = totalsByCurrency(trip.expenses, base);
  const isAdmin = me === trip.adminId;
  const pending = trip.expenses.filter(e => e.pendingAmount != null);
  const sorted = [...trip.expenses].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const foreign = trip.expenses.some(e => e.currency !== base);
  const meT = trip.travelers.find(t => t.id === me);

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
          {myTransfers.map(t => {
            const other = t.from === me ? t.to : t.from;
            const ot = trip.travelers.find(x => x.id === other)!;
            return (
              <div className="p" key={`${t.from}-${t.to}`}>
                <Avatar t={ot} small />
                <span>{t.from === me ? `You owe ${ot.name}` : `${ot.name} owes you`}</span>
                <span className={`amt ${t.from === me ? 'neg' : ''}`}>{fmtMoney(t.amount, base)}</span>
              </div>
            );
          })}
          {others.map(t => (
            <div className="p" key={`${t.from}-${t.to}`}>
              <Avatar t={trip.travelers.find(x => x.id === t.from)!} small />
              <span>{name(t.from)} owes {name(t.to)}</span>
              <span className="amt plain">{fmtMoney(t.amount, base)}</span>
            </div>
          ))}
          {error && <div className="fx">Can’t convert every currency right now.</div>}
          {foreign && !error && (
            <div className="fx">
              In {base} · {rates.estimate ? 'estimated rates (offline)' : `ECB rates of ${rates.date}`}
            </div>
          )}
        </section>
      )}

      {totals.length > 0 && (
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
