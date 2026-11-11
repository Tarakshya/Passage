'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtMoney, parseMoney } from '@/lib/balances';
import { geocodeAddress } from '@/lib/geo';
import { newId } from '@/lib/mutations';
import { prepareFile, scan, scanContext } from '@/lib/scan-client';
import type { BookingScan, ReceiptScan } from '@/lib/schema';
import { todayIn } from '@/lib/time';
import { placeCode } from '@/lib/home';
import { flag, legLabel, placeName, sortedStops, targetFor } from '@/lib/trip';
import type { BookingStatus, Currency, Reservation, ReservationType, Trip } from '@/lib/types';
import { CURRENCY_DECIMALS, TRANSIT_TYPES } from '@/lib/types';
import { Icon, Sheet, STATUS_LABEL, TYPE_ICON, TYPE_LABEL } from './ui';

export interface ReservationPrefill {
  stopId?: string | null; legId?: string | null; type?: ReservationType; file?: File;
  /** A booking already read elsewhere (e.g. uploaded in the Ledger): fill the form from it, no second scan. */
  scanned?: { result: BookingScan; ms: number };
}

const TYPES: ReservationType[] = ['hotel', 'flight', 'train', 'ferry', 'bus', 'activity', 'dinner'];
const CURRENCIES: Currency[] = ['EUR', 'INR', 'USD', 'GBP', 'CHF', 'JPY'];

type Field = 'type' | 'title' | 'target' | 'start' | 'end' | 'address' | 'route' | 'service' | 'seat' | 'confirmation' | 'price' | 'cancelBy';

function validTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

export function ReservationSheet({ trip, initial, prefill, onSave, onDelete, onClose, onReceipt }: {
  trip: Trip;
  initial: Reservation | null;
  prefill: ReservationPrefill;
  onSave: (r: Reservation) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** The upload turned out to be a receipt: hand it to the Ledger. */
  onReceipt?: (r: ReceiptScan, ms: number) => void;
}) {
  const stops = useMemo(() => sortedStops(trip), [trip]);
  const firstStop = stops[0];
  const [type, setType] = useState<ReservationType>(initial?.type ?? prefill.type ?? (prefill.legId ? trip.legs.find(l => l.id === prefill.legId)?.mode ?? 'train' : 'hotel'));
  const transit = TRANSIT_TYPES.has(type);
  const [stopId, setStopId] = useState<string>(initial?.stopId ?? prefill.stopId ?? firstStop?.id ?? '');
  const [legId, setLegId] = useState<string>(initial?.legId ?? prefill.legId ?? trip.legs[0]?.id ?? '');
  const stop = stops.find(s => s.id === stopId);
  const leg = trip.legs.find(l => l.id === legId);

  const defaultStart = () => {
    if (TRANSIT_TYPES.has(type)) return { d: (trip.stops.find(s => s.id === leg?.from)?.depart ?? trip.stops.find(s => s.id === leg?.to)?.arrive ?? ''), t: '' };
    if (type === 'hotel') return { d: stop?.arrive ?? '', t: '15:00' };
    return { d: stop?.arrive ?? '', t: type === 'dinner' ? '19:30' : '10:00' };
  };
  const [startD, setStartD] = useState(initial?.startLocal.slice(0, 10) ?? defaultStart().d);
  const [startT, setStartT] = useState(initial?.startLocal.slice(11, 16) ?? defaultStart().t);
  const [endD, setEndD] = useState(initial?.endLocal?.slice(0, 10) ?? (type === 'hotel' ? stop?.depart ?? '' : ''));
  const [endT, setEndT] = useState(initial?.endLocal?.slice(11, 16) ?? (type === 'hotel' ? '11:00' : ''));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [route, setRoute] = useState(initial?.route ?? '');
  const [service, setService] = useState(initial?.service ?? '');
  const [seat, setSeat] = useState(initial?.seat ?? '');
  const [confirmation, setConfirmation] = useState(initial?.confirmation ?? '');
  const [price, setPrice] = useState(initial?.price != null && initial.currency ? (initial.price / 10 ** CURRENCY_DECIMALS[initial.currency]).toFixed(CURRENCY_DECIMALS[initial.currency]) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? trip.baseCurrency);
  const [cancelBy, setCancelBy] = useState(initial?.cancelBy ?? '');
  // A new booking typed in by hand starts as "To book"; a scanned confirmation is marked booked.
  const [status, setStatus] = useState<BookingStatus>(initial?.status ?? 'todo');
  const [scannedTz, setScannedTz] = useState<{ start?: string; end?: string }>({});
  const [source, setSource] = useState<'manual' | 'scan'>(initial?.source ?? 'manual');
  const [low, setLow] = useState<Set<Field>>(new Set());
  const [scanState, setScanState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; ms: number; lows: number } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(initial);

  // When the type changes on a new booking, re-seed the default dates so they make sense.
  const lastType = useRef(type);
  useEffect(() => {
    if (editing || lastType.current === type || source === 'scan') { lastType.current = type; return; }
    lastType.current = type;
    const d = defaultStart();
    setStartD(d.d); setStartT(d.t);
    setEndD(type === 'hotel' ? stop?.depart ?? '' : ''); setEndT(type === 'hotel' ? '11:00' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const placeTz = (id: string | null) => (id === null ? trip.home.tz : trip.stops.find(s => s.id === id)?.tz ?? trip.home.tz);
  const startTz = validTz(scannedTz.start) ? scannedTz.start : transit ? placeTz(leg?.from ?? null) : stop?.tz ?? trip.home.tz;
  const endTz = validTz(scannedTz.end) ? scannedTz.end : transit ? placeTz(leg?.to ?? null) : startTz;

  async function runScan(file: File) {
    setScanState({ kind: 'busy' });
    let media;
    try {
      media = await prepareFile(file);
    } catch (e) {
      setScanState({ kind: 'error', message: (e as Error).message });
      return;
    }
    const ctx = scanContext(trip, todayIn(firstStop?.tz ?? 'UTC'));
    const res = await scan('booking', trip.token, media, ctx);
    if (!res.ok) { setScanState({ kind: 'error', message: res.message }); return; }
    const r: BookingScan = res.result;
    if (!r.isBooking) {
      // Not a booking: it may be a receipt, which belongs in the Ledger.
      if (onReceipt) {
        const rr = await scan('receipt', trip.token, media, ctx);
        if (rr.ok && rr.result.isReceipt) { onReceipt(rr.result, rr.ms); return; }
      }
      setScanState({ kind: 'error', message: r.reason ?? "That doesn't look like a booking or a receipt. You can enter it by hand below." });
      return;
    }
    applyScan(r, res.ms);
  }

  function applyScan(r: BookingScan, ms: number) {
    const lows = new Set<Field>();
    const take = <T,>(f: { value: T | null; confidence: 'high' | 'low' }, field: Field, set: (v: T) => void) => {
      if (f.value === null || f.value === undefined || f.value === '') return;
      set(f.value);
      if (f.confidence === 'low') lows.add(field);
    };
    setSource('scan');
    take(r.type, 'type', v => setType(v));
    take(r.title, 'title', setTitle);
    take(r.startLocal, 'start', v => { setStartD(v.slice(0, 10)); setStartT(v.slice(11, 16)); });
    take(r.endLocal, 'end', v => { setEndD(v.slice(0, 10)); setEndT(v.slice(11, 16)); });
    setScannedTz({ start: r.startTz.value ?? undefined, end: r.endTz.value ?? undefined });
    if (r.startTz.confidence === 'low' && r.startTz.value) lows.add('start');
    take(r.address, 'address', setAddress);
    take(r.route, 'route', setRoute);
    take(r.service, 'service', setService);
    take(r.seat, 'seat', setSeat);
    take(r.confirmation, 'confirmation', setConfirmation);
    take(r.currency, 'price', v => setCurrency(v));
    take(r.price, 'price', v => setPrice(String(v)));
    take(r.cancelBy, 'cancelBy', setCancelBy);
    const isTransit = r.type.value ? TRANSIT_TYPES.has(r.type.value) : transit;
    if (isTransit && r.suggestedLegId.value && trip.legs.some(l => l.id === r.suggestedLegId.value)) {
      setLegId(r.suggestedLegId.value);
      if (r.suggestedLegId.confidence === 'low') lows.add('target');
    } else if (!isTransit && r.suggestedStopId.value && trip.stops.some(s => s.id === r.suggestedStopId.value)) {
      setStopId(r.suggestedStopId.value);
      if (r.suggestedStopId.confidence === 'low') lows.add('target');
    } else {
      lows.add('target');
    }
    setStatus('booked');
    setLow(lows);
    setScanState({ kind: 'done', ms, lows: lows.size });
  }

  // A file chosen from a stop card's Upload chip arrives with the prefill.
  const started = useRef(false);
  useEffect(() => {
    if (prefill.scanned && !started.current) { started.current = true; applyScan(prefill.scanned.result, prefill.scanned.ms); }
    if (prefill.file && !started.current) { started.current = true; void runScan(prefill.file); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill.file]);

  const priceMinor = price.trim() ? parseMoney(price, currency) : null;
  const errors = {
    title: !title.trim() ? 'Give it a name' : null,
    target: transit ? (!leg ? 'Pick a leg' : null) : (!stop ? 'Pick a stop' : null),
    start: !/^\d{4}-\d{2}-\d{2}$/.test(startD) || !/^\d{2}:\d{2}$/.test(startT) ? 'Add a date and time' : null,
    end: endD && endT && `${endD}T${endT}` < `${startD}T${startT}` && endTz === startTz ? 'Ends before it starts' : null,
    price: price.trim() && priceMinor === null ? 'Not a valid amount' : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  function save() {
    setTried(true);
    if (invalid) return;
    const r: Reservation = {
      id: initial?.id ?? newId('r'),
      type, status,
      stopId: transit ? null : stopId,
      legId: transit ? legId : null,
      title: title.trim(),
      startLocal: `${startD}T${startT}`, startTz,
      endLocal: endD && endT ? `${endD}T${endT}` : null, endTz: endD && endT ? endTz : null,
      address: address.trim() || null,
      lat: initial && initial.address === (address.trim() || null) ? initial.lat : null,
      lng: initial && initial.address === (address.trim() || null) ? initial.lng : null,
      route: transit ? route.trim() || null : null,
      service: transit ? service.trim() || null : null,
      seat: seat.trim() || null,
      confirmation: confirmation.trim() || null,
      price: priceMinor, currency: priceMinor !== null ? currency : null,
      cancelBy: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cancelBy) ? cancelBy : null,
      source,
    };
    onSave(r);
    // Pin the address in the background so live travel times use the real place.
    if (r.address && r.lat === null) {
      const near = targetFor(trip, { ...r, lat: null, lng: null });
      if (near) void geocodeAddress(r.address, near).then(p => p && onSave({ ...r, ...p }));
    }
    onClose();
  }

  const lowCls = (f: Field) => (low.has(f) ? 'low' : '');
  const clearLow = (f: Field) => low.has(f) && setLow(s => { const n = new Set(s); n.delete(f); return n; });
  const err = (k: keyof typeof errors) => tried && errors[k] ? <div className="help warn">{errors[k]}</div> : low.has(k as Field) ? <div className="help warn">Check this — Passage wasn’t sure</div> : null;

  // Hints use this trip's own places, so the ghost text matches what you're adding.
  const legFrom = leg ? placeName(trip, leg.from) : 'From';
  const legTo = leg ? placeName(trip, leg.to) : 'To';
  const hint = {
    title: type === 'hotel' ? 'Hotel name' : transit ? `${legFrom} → ${legTo}` : type === 'dinner' ? 'Restaurant' : 'What are you doing?',
    route: type === 'flight' ? `Airports, e.g. ${placeCode(legFrom)} → ${placeCode(legTo)}` : type === 'car' ? `Pick-up → drop-off` : `${type === 'train' ? 'Stations' : type === 'ferry' ? 'Ports' : 'Stops'}, e.g. ${legFrom} → ${legTo}`,
    service: ({ flight: 'Flight number, e.g. KL 878', train: 'Train number, e.g. IC 548', ferry: 'Ferry line or number', bus: 'Bus line or number', car: 'Rental company' } as Record<string, string>)[type] ?? '',
    address: ({ flight: 'Departure airport', train: 'Departure station', ferry: 'Departure port', bus: 'Departure stop', car: 'Pick-up address', hotel: 'Hotel address', dinner: 'Restaurant address', activity: 'Address' } as Record<string, string>)[type],
    seat: ({ flight: 'Seats, e.g. 32A, 32B', train: 'Coach and seats', ferry: 'Cabin or seats', bus: 'Seats', car: 'Car type', hotel: 'Room type', dinner: 'Table, e.g. for 3', activity: 'Tickets, e.g. 3 adults' } as Record<string, string>)[type],
  };
  const seatIcon = type === 'hotel' ? 'bed' : type === 'activity' || type === 'dinner' ? 'confirmation_number' : 'event_seat';

  const startLabel = type === 'hotel' ? 'Check-in' : transit ? 'Departs' : 'Starts';
  const endLabel = type === 'hotel' ? 'Check-out' : transit ? 'Arrives' : 'Ends';

  return (
    <Sheet
      label={editing ? 'Edit reservation' : 'New reservation'}
      title={editing ? 'Edit reservation' : 'New reservation'}
      onClose={onClose}
      tall
      footer={<button className="btn-primary" onClick={save} disabled={scanState.kind === 'busy'}>{editing ? 'Save changes' : 'Save reservation'}</button>}
    >
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runScan(f); }} />
      <button className={`autofill ${scanState.kind === 'busy' ? 'busy' : ''}`} onClick={() => fileRef.current?.click()} disabled={scanState.kind === 'busy'}>
        <span className="ic"><Icon name={scanState.kind === 'busy' ? 'progress_activity' : 'wand_stars'} /></span>
        <span>
          <div className="a1">{scanState.kind === 'busy' ? 'Reading your confirmation…' : 'Auto-fill from a confirmation'}</div>
          <div className="a2">{scanState.kind === 'busy' ? 'Usually about 5 seconds' : 'Any booking or receipt, as a screenshot or PDF'}</div>
        </span>
      </button>
      {scanState.kind === 'done' && (
        <div className={`scan-note ${scanState.lows ? 'warn' : 'ok'}`} role="status">
          <Icon name={scanState.lows ? 'info' : 'check_circle'} fill />
          <span>Read in {(scanState.ms / 1000).toFixed(1)} s. {scanState.lows ? `Check the ${scanState.lows} highlighted ${scanState.lows === 1 ? 'field' : 'fields'}, then save.` : 'Have a look, then save.'}</span>
        </div>
      )}
      {scanState.kind === 'error' && (
        <div className="scan-note bad" role="alert"><Icon name="error" fill /><span>{scanState.message}</span></div>
      )}

      <div className="or">{scanState.kind === 'done' ? 'CHECK THE DETAILS' : 'OR ENTER MANUALLY'}</div>

      <div className="field">
        <span className="label">Type</span>
        <div className="chips" role="radiogroup" aria-label="Type">
          {TYPES.map(t => (
            <button key={t} role="radio" aria-checked={type === t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => { setType(t); clearLow('type'); }}>
              <Icon name={TYPE_ICON[t]} fill={type === t} />{TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {low.has('type') && <div className="help warn">Check this — Passage wasn’t sure</div>}
      </div>

      <div className="field">
        <label className="label" htmlFor="res-target">{transit ? 'Which leg' : 'At which stop'}</label>
        <div className="select-wrap">
          {transit ? (
            <select id="res-target" className={`select ${lowCls('target')}`} value={legId} onChange={e => { setLegId(e.target.value); clearLow('target'); }}>
              {trip.legs.map(l => <option key={l.id} value={l.id}>{legLabel(trip, l)}</option>)}
            </select>
          ) : (
            <select id="res-target" className={`select ${lowCls('target')}`} value={stopId} onChange={e => { setStopId(e.target.value); clearLow('target'); }}>
              {stops.map(s => <option key={s.id} value={s.id}>{flag(s.country)}  {s.name}</option>)}
            </select>
          )}
          <Icon name="unfold_more" />
        </div>
        {err('target') ?? <div className="help">{transit ? 'Stays, activities and meals go under a city instead' : `Flights, trains and other transport go under the journey between two stops`}</div>}
      </div>

      <div className="field">
        <label className="label" htmlFor="res-title">Name</label>
        <input id="res-title" className={`input ${lowCls('title')}`} value={title} onChange={e => { setTitle(e.target.value); clearLow('title'); }}
          placeholder={hint.title} autoComplete="off" />
        {err('title')}
      </div>

      <div className="field">
        <span className="label">Dates <em>· local time, {startTz.split('/').at(-1)?.replace('_', ' ')}{endTz !== startTz ? ` → ${endTz.split('/').at(-1)?.replace('_', ' ')}` : ''}</em></span>
        <div className="row2">
          <label className={`dt ${lowCls('start')}`}>
            <span className="k">{startLabel}</span>
            <input type="date" value={startD} onChange={e => { setStartD(e.target.value); clearLow('start'); }} aria-label={`${startLabel} date`} />
            <input type="time" value={startT} onChange={e => { setStartT(e.target.value); clearLow('start'); }} aria-label={`${startLabel} time`} />
          </label>
          <label className={`dt ${lowCls('end')}`}>
            <span className="k">{endLabel}{type !== 'hotel' && ' · optional'}</span>
            <input type="date" value={endD} onChange={e => { setEndD(e.target.value); clearLow('end'); }} aria-label={`${endLabel} date`} />
            <input type="time" value={endT} onChange={e => { setEndT(e.target.value); clearLow('end'); }} aria-label={`${endLabel} time`} />
          </label>
        </div>
        {err('start') ?? err('end')}
      </div>

      <div className="field">
        <span className="label">Details <em>· optional</em></span>
        <div style={{ display: 'grid', gap: 10 }}>
          {transit && (
            <>
              <div className="icon-input"><Icon name="route" /><input className={`input ${lowCls('route')}`} value={route} onChange={e => { setRoute(e.target.value); clearLow('route'); }} placeholder={hint.route} aria-label="Route" /></div>
              <div className="icon-input"><Icon name="tag" /><input className={`input mono ${lowCls('service')}`} value={service} onChange={e => { setService(e.target.value); clearLow('service'); }} placeholder={hint.service} aria-label={hint.service.split(',')[0]} /></div>
            </>
          )}
          <div className="icon-input"><Icon name="location_on" /><input className={`input ${lowCls('address')}`} value={address} onChange={e => { setAddress(e.target.value); clearLow('address'); }} placeholder={hint.address} aria-label={hint.address} /></div>
          <div className="icon-input"><Icon name={seatIcon} /><input className={`input ${lowCls('seat')}`} value={seat} onChange={e => { setSeat(e.target.value); clearLow('seat'); }} placeholder={hint.seat} aria-label={hint.seat.split(',')[0]} /></div>
          <div className="icon-input"><Icon name="confirmation_number" /><input className={`input mono ${lowCls('confirmation')}`} value={confirmation} onChange={e => { setConfirmation(e.target.value); clearLow('confirmation'); }} placeholder={type === 'flight' ? 'Booking reference (PNR)' : 'Confirmation number'} aria-label="Confirmation number" autoCapitalize="characters" /></div>
          <div className="row3">
            <div className="icon-input"><Icon name="payments" /><input className={`input mono ${lowCls('price')}`} value={price} onChange={e => { setPrice(e.target.value); clearLow('price'); }} placeholder="Price" inputMode="decimal" aria-label="Price" /></div>
            <div className="select-wrap">
              <select className="select" value={currency} onChange={e => setCurrency(e.target.value as Currency)} aria-label="Currency">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <Icon name="unfold_more" />
            </div>
          </div>
          {err('price')}
          {priceMinor !== null && <div className="help">{fmtMoney(priceMinor, currency)} total</div>}
          <label className={`dt ${lowCls('cancelBy')}`}>
            <span className="k">Free cancellation until</span>
            <input type="datetime-local" value={cancelBy} onChange={e => { setCancelBy(e.target.value); clearLow('cancelBy'); }} />
          </label>
        </div>
      </div>

      <div className="field">
        <span className="label">Status</span>
        <div className="seg" role="radiogroup" aria-label="Status">
          {(['todo', 'pending', 'booked'] as BookingStatus[]).map(s => (
            <button key={s} role="radio" aria-checked={status === s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              <span className="d" style={s === 'todo' ? { boxShadow: 'inset 0 0 0 1.5px var(--gold)' } : { background: s === 'pending' ? 'var(--gold)' : 'var(--lagoon)' }} />{STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {editing && (
        <button className="btn-quiet" style={{ marginTop: 22 }} onClick={() => { onDelete(initial!.id); onClose(); }}>Delete reservation</button>
      )}
    </Sheet>
  );
}
