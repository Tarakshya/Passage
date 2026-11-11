'use client';

import { useRef, useState } from 'react';
import { fmtMoney, parseMoney } from '@/lib/balances';
import { editExpense, newId } from '@/lib/mutations';
import { prepareFile, scan, scanContext } from '@/lib/scan-client';
import { todayIn } from '@/lib/time';
import { sortedStops } from '@/lib/trip';
import type { Currency, Expense, Trip } from '@/lib/types';
import { CURRENCY_DECIMALS } from '@/lib/types';
import { Icon, Sheet } from './ui';

const CURRENCIES: Currency[] = ['EUR', 'INR', 'USD', 'GBP', 'CHF', 'JPY'];
const CATS: { id: Expense['category']; label: string; icon: string }[] = [
  { id: 'food', label: 'Food', icon: 'restaurant' },
  { id: 'stay', label: 'Stay', icon: 'hotel' },
  { id: 'transit', label: 'Transit', icon: 'train' },
  { id: 'taxi', label: 'Taxi', icon: 'local_taxi' },
  { id: 'activity', label: 'Activity', icon: 'local_activity' },
  { id: 'other', label: 'Other', icon: 'receipt_long' },
];

export function ExpenseSheet({ trip, me, initial, onSave, onDelete, onClose, notify }: {
  trip: Trip; me: string; initial: Expense | null;
  onSave: (e: Expense) => void; onDelete: (id: string) => void; onClose: () => void; notify: (msg: string) => void;
}) {
  const tz = sortedStops(trip)[0]?.tz ?? trip.home.tz;
  const [title, setTitle] = useState(initial?.title ?? '');
  const shown = initial ? (initial.pendingBy === me && initial.pendingAmount != null ? initial.pendingAmount : initial.amount) : null;
  const [amount, setAmount] = useState(shown != null && initial ? (shown / 10 ** CURRENCY_DECIMALS[initial.currency]).toFixed(CURRENCY_DECIMALS[initial.currency]) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? trip.baseCurrency);
  const [payer, setPayer] = useState(initial?.payerId ?? me);
  const [split, setSplit] = useState<string[]>(initial?.splitWith ?? trip.travelers.map(t => t.id));
  const [date, setDate] = useState(initial?.date ?? todayIn(tz));
  const [category, setCategory] = useState<Expense['category']>(initial?.category ?? 'food');
  const [scanned, setScanned] = useState(initial?.autoScanned ?? false);
  const [scanState, setScanState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'done'; ms: number; low: boolean } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = Boolean(initial?.autoScanned && me !== trip.adminId);

  async function runScan(file: File) {
    setScanState({ kind: 'busy' });
    try {
      const media = await prepareFile(file);
      const res = await scan('receipt', trip.token, media, scanContext(trip, todayIn(tz)));
      if (!res.ok) { setScanState({ kind: 'error', message: res.message }); return; }
      const r = res.result;
      if (!r.isReceipt) { setScanState({ kind: 'error', message: r.reason ?? "That doesn't look like a receipt." }); return; }
      if (r.merchant.value) setTitle(r.merchant.value);
      if (r.currency.value) setCurrency(r.currency.value);
      if (r.total.value != null) setAmount(String(r.total.value));
      if (r.date.value) setDate(r.date.value);
      if (r.category.value) setCategory(r.category.value);
      setScanned(true);
      const low = [r.merchant, r.total, r.currency, r.date].some(f => f.confidence === 'low');
      setScanState({ kind: 'done', ms: res.ms, low });
    } catch (e) {
      setScanState({ kind: 'error', message: (e as Error).message });
    }
  }

  const minor = parseMoney(amount, currency);
  const errors = {
    title: !title.trim() ? 'What was it for?' : null,
    amount: minor === null ? 'Enter an amount' : null,
    split: !split.length ? 'Pick at least one person' : null,
  };

  function save() {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const draft: Expense = {
      id: initial?.id ?? newId('e'), title: title.trim(), amount: minor!, currency, payerId: payer, splitWith: split,
      date, category, autoScanned: scanned, pendingAmount: initial?.pendingAmount ?? null, pendingBy: initial?.pendingBy ?? null,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    const next = initial ? editExpense(trip, initial, draft, me) : draft;
    if (next.pendingAmount != null && next.pendingAmount !== initial?.pendingAmount) {
      const admin = trip.travelers.find(t => t.id === trip.adminId)?.name ?? 'the admin';
      notify(`Sent to ${admin} to approve ${fmtMoney(next.pendingAmount, next.currency)}`);
    }
    onSave(next);
    onClose();
  }

  const toggle = (id: string) => setSplit(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const perHead = minor && split.length ? Math.round(minor / split.length) : null;

  return (
    <Sheet
      label={initial ? 'Edit expense' : 'New expense'}
      title={initial ? 'Edit expense' : 'New expense'}
      onClose={onClose}
      tall
      footer={<button className="btn-primary" onClick={save} disabled={scanState.kind === 'busy'}>{initial ? 'Save changes' : 'Add expense'}</button>}
    >
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runScan(f); }} />
      {!initial && (
        <>
          <button className={`autofill ${scanState.kind === 'busy' ? 'busy' : ''}`} onClick={() => fileRef.current?.click()} disabled={scanState.kind === 'busy'}>
            <span className="ic"><Icon name={scanState.kind === 'busy' ? 'progress_activity' : 'document_scanner'} /></span>
            <span>
              <div className="a1">{scanState.kind === 'busy' ? 'Reading the receipt…' : 'Scan a receipt'}</div>
              <div className="a2">Snap the bill — we’ll fill in the total</div>
            </span>
          </button>
          {scanState.kind === 'done' && (
            <div className={`scan-note ${scanState.low ? 'warn' : 'ok'}`} role="status">
              <Icon name={scanState.low ? 'info' : 'check_circle'} fill />
              <span>Read in {(scanState.ms / 1000).toFixed(1)} s. {scanState.low ? 'Some of it was hard to read — check the total.' : 'Check the total, then add it.'}</span>
            </div>
          )}
          {scanState.kind === 'error' && <div className="scan-note bad" role="alert"><Icon name="error" fill /><span>{scanState.message}</span></div>}
          <div className="or">{scanState.kind === 'done' ? 'CHECK THE DETAILS' : 'OR ENTER MANUALLY'}</div>
        </>
      )}

      {locked && (
        <div className="scan-note warn" style={{ marginTop: 4 }}>
          <Icon name="gavel" fill />
          <span>Claude scanned this bill, so a new amount goes to {trip.travelers.find(t => t.id === trip.adminId)?.name} to approve.</span>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="exp-title">What for</label>
        <input id="exp-title" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="What was it? e.g. Dinner, taxi, museum tickets" autoComplete="off" />
        {tried && errors.title && <div className="help warn">{errors.title}</div>}
      </div>

      <div className="field">
        <label className="label" htmlFor="exp-amount">Amount</label>
        <div className="row3">
          <input id="exp-amount" className="input mono" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          <div className="select-wrap">
            <select className="select" value={currency} onChange={e => setCurrency(e.target.value as Currency)} aria-label="Currency">
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <Icon name="unfold_more" />
          </div>
        </div>
        {tried && errors.amount && <div className="help warn">{errors.amount}</div>}
      </div>

      <div className="field">
        <span className="label">Paid by</span>
        <div className="chips" role="radiogroup" aria-label="Paid by">
          {trip.travelers.map(t => (
            <button key={t.id} role="radio" aria-checked={payer === t.id} className={`chip small ${payer === t.id ? 'on' : ''}`} onClick={() => setPayer(t.id)}>
              <span className="av" style={{ background: payer === t.id ? undefined : t.color }}>{t.name[0]}</span>{t.id === me ? 'You' : t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Split between <em>· equally</em></span>
        <div className="chips">
          {trip.travelers.map(t => (
            <button key={t.id} role="checkbox" aria-checked={split.includes(t.id)} className={`chip small ${split.includes(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)}>
              <Icon name={split.includes(t.id) ? 'check' : 'add'} />{t.id === me ? 'You' : t.name}
            </button>
          ))}
        </div>
        {tried && errors.split ? <div className="help warn">{errors.split}</div> : perHead !== null && split.length > 1 && <div className="help">{fmtMoney(perHead, currency)} each</div>}
      </div>

      <div className="field">
        <span className="label">Category</span>
        <div className="chips">
          {CATS.map(c => (
            <button key={c.id} className={`chip small ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)} aria-pressed={category === c.id}>
              <Icon name={c.icon} fill={category === c.id} />{c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="dt">
          <span className="k">Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </div>

      {initial && <button className="btn-quiet" style={{ marginTop: 22 }} onClick={() => { onDelete(initial.id); onClose(); }}>Delete expense</button>}
    </Sheet>
  );
}
