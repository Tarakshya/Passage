'use client';

import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type PlaceHit } from '@/lib/geo';
import { prepareFile, scan } from '@/lib/scan-client';
import { cityQuery, stopFromBooking, type StopFill } from '@/lib/stop-from-booking';
import { newId, newToken } from '@/lib/mutations';
import { addDays, todayIn } from '@/lib/time';
import { flag, sortedStops } from '@/lib/trip';
import type { Currency, Leg, Mode, Place, Reservation, Stop, Traveler, Trip } from '@/lib/types';
import { Icon, Sheet, TYPE_ICON } from './ui';

// Avatar colours: all light enough to carry navy initials on the dark theme.
const COLORS = ['var(--acc)', '#C9AE7A', '#A9B8FF', '#F2A7C3', '#F4F1E9', '#FFB37A'];
const MODES: Mode[] = ['flight', 'train', 'ferry', 'bus', 'car'];
const CURRENCIES: Currency[] = ['EUR', 'INR', 'USD', 'GBP', 'CHF', 'JPY'];

function PlaceSearch({ value, onPick, placeholder, label }: { value: Place | null; onPick: (p: PlaceHit) => void; placeholder: string; label: string }) {
  const [q, setQ] = useState(value?.name ?? '');
  useEffect(() => { if (value?.name) setQ(value.name); }, [value?.name]);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      ctl.current?.abort();
      ctl.current = new AbortController();
      searchPlaces(q, ctl.current.signal).then(h => { setHits(h); setErr(false); }).catch(e => { if ((e as Error).name !== 'AbortError') setErr(true); });
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);
  return (
    <div>
      <div className="icon-input">
        <Icon name="search" />
        <input className="input" value={q} placeholder={placeholder} aria-label={label} autoComplete="off"
          onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      </div>
      {open && q.trim().length > 1 && (
        <div className="suggest" role="listbox">
          {err && <div className="help" style={{ padding: 12 }}>Can’t search places offline.</div>}
          {hits.map(h => (
            <button key={`${h.name}${h.lat}`} role="option" aria-selected={false} onClick={() => { onPick(h); setQ(h.name); setOpen(false); }}>
              <span aria-hidden="true">{flag(h.country)}</span>
              <span>{h.name} <small>{h.detail}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface StopDraft {
  id: string; place: Place | null; arrive: string; depart: string;
  /** A hotel booking this stop was filled from; saved as a booked stay with the trip. */
  stay?: StopFill['stay'];
}
type FillState = { kind: 'busy' } | { kind: 'done'; title: string } | { kind: 'error'; message: string };

export function TripForm({ initial, onSave, onClose, canInvite = false }: { initial: Trip | null; canInvite?: boolean; onSave: (t: Trip) => Promise<void>; onClose: () => void }) {
  const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [name, setName] = useState(initial?.name ?? '');
  const [travelers, setTravelers] = useState<Traveler[]>(initial?.travelers ?? [{ id: newId('p'), name: '', color: COLORS[0] }]);
  const [home, setHome] = useState<Place | null>(initial?.home ?? null);
  const [base, setBase] = useState<Currency>(initial?.baseCurrency ?? 'EUR');
  const [stops, setStops] = useState<StopDraft[]>(
    initial ? sortedStops(initial).map(s => ({ id: s.id, place: s, arrive: s.arrive, depart: s.depart }))
      : [{ id: newId('s'), place: null, arrive: addDays(today, 30), depart: addDays(today, 33) }],
  );
  const [modes, setModes] = useState<Record<string, Mode>>(() => Object.fromEntries((initial?.legs ?? []).map(l => [`${l.from}>${l.to}`, l.mode])));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // Fixed up front so a booking scanned while creating the trip counts toward this trip's quota.
  const [token] = useState(() => initial?.token ?? newToken());
  const [fill, setFill] = useState<Record<string, FillState>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const fillFor = useRef<string | null>(null);

  async function fillStop(stopId: string, file: File) {
    setFill(f => ({ ...f, [stopId]: { kind: 'busy' } }));
    const fail = (message: string) => setFill(f => ({ ...f, [stopId]: { kind: 'error', message } }));
    let media;
    try { media = await prepareFile(file); } catch (e) { fail((e as Error).message); return; }
    const res = await scan('booking', token, media, { tripName: name.trim() || 'New trip', today, stops: [], legs: [] });
    if (!res.ok) { fail(res.message); return; }
    const q = cityQuery(res.result);
    if (!res.result.isBooking || !q) { fail(res.result.reason ?? 'Couldn’t tell which city that booking is in. Search for the city instead.'); return; }
    let hit: PlaceHit | undefined;
    try { hit = (await searchPlaces(q))[0]; } catch { /* offline */ }
    if (!hit) { fail(`Couldn’t find “${q}” on the map. Search for the city instead.`); return; }
    const out = stopFromBooking(res.result, hit);
    if ('error' in out) { fail(out.error); return; }
    setStop(stopId, { place: out.place, arrive: out.arrive, depart: out.depart, stay: out.stay });
    setFill(f => ({ ...f, [stopId]: { kind: 'done', title: out.stay.title } }));
  }

  const seq = [null, ...stops.map(s => s.id), null];
  const legKeys = seq.slice(1).map((to, i) => `${seq[i]}>${to}`);
  const nameOf = (id: string | null) => (id === null ? home?.name ?? 'Home' : stops.find(s => s.id === id)?.place?.name ?? 'Next stop');
  const modeFor = (k: string, i: number) => modes[k] ?? (i === 0 || i === legKeys.length - 1 ? 'flight' : 'train');

  const errors = {
    name: !name.trim() ? 'Name the trip' : null,
    you: !travelers[0]?.name.trim() ? 'Add yourself first' : null,
    home: !home ? 'Where do you start from?' : null,
    stops: stops.some(s => !s.place) ? 'Pick a place for every stop' : stops.some(s => s.depart < s.arrive) ? 'A stop ends before it starts' : null,
  };

  async function save() {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    const tStops: Stop[] = stops.map((s, i) => ({ ...s.place!, id: s.id, order: i + 1, arrive: s.arrive, depart: s.depart }));
    const legs: Leg[] = legKeys.map((k, i) => {
      const [from, to] = [seq[i], seq[i + 1]];
      const existing = initial?.legs.find(l => l.from === from && l.to === to);
      const mode = modeFor(k, i);
      const title = from === null ? `Outbound ${mode}` : to === null ? `Return ${mode}` : `${mode[0].toUpperCase()}${mode.slice(1)} to ${nameOf(to)}`;
      return { id: existing?.id ?? newId('l'), from, to, mode, title: existing && existing.mode === mode ? existing.title : title };
    });
    const people = travelers.filter(t => t.name.trim()).map(t => ({ ...t, name: t.name.trim() }));
    const stopIds = new Set(tStops.map(s => s.id));
    const legIds = new Set(legs.map(l => l.id));
    const trip: Trip = {
      id: initial?.id ?? newId('trip'),
      token,
      name: name.trim(), home: home!, baseCurrency: base,
      adminId: initial?.adminId ?? people[0].id,
      travelers: people, stops: tStops, legs,
      // Bookings on removed stops or legs go with them.
      reservations: [
        ...(initial?.reservations ?? []).filter(r => (r.stopId ? stopIds.has(r.stopId) : r.legId ? legIds.has(r.legId) : false)),
        // Stays the stops were filled from.
        ...stops.filter(s => s.stay).map((s): Reservation => ({ ...s.stay!, id: newId('r'), stopId: s.id })),
      ],
      expenses: initial?.expenses ?? [],
      isDemo: initial?.isDemo ?? false,
    };
    try {
      await onSave(trip);
      onClose();
    } catch (e) {
      setSaveErr((e as Error).message);
      setBusy(false);
    }
  }

  const [copied, setCopied] = useState(false);
  /** Send the trip's link from the phone's share menu (or copy it where there isn't one). */
  async function invite() {
    const url = `${window.location.origin}/t/${token}`;
    const others = travelers.slice(1).map(t => t.name.trim()).filter(Boolean);
    const text = `${others.length ? `${others.join(', ')}, join` : 'Join'} “${name.trim() || 'our trip'}” on Passage`;
    try {
      if (navigator.share) await navigator.share({ title: name.trim() || 'Passage', text, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); }
    } catch { /* cancelled */ }
  }

  const setStop = (id: string, patch: Partial<StopDraft>) => setStops(s => s.map(x => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <Sheet label={initial ? 'Edit trip' : 'New trip'} title={initial ? 'Edit trip' : 'New trip'} onClose={onClose} tall
      footer={<button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : initial ? 'Save trip' : 'Create trip'}</button>}>
      <div className="field" style={{ marginTop: 6 }}>
        <label className="label" htmlFor="trip-name">Trip name</label>
        <input id="trip-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Give your trip a name"
          autoComplete="off" autoCorrect="off" name="passage-trip-name" />
        {tried && errors.name && <div className="help warn">{errors.name}</div>}
      </div>

      <div className="field">
        <span className="label">Travelers</span>
        <div style={{ display: 'grid', gap: 10 }}>
          {travelers.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="avatar" style={{ background: t.color, margin: 0, border: 0 }} aria-hidden="true">{t.name.trim()[0]?.toUpperCase() ?? ''}</span>
              {/* No "name" in the hint, label or field name: iPhones match that word and pop up
                  contact autofill, which pushed the screen around. */}
              <input className="input" value={t.name} placeholder={i === 0 ? 'You' : 'Who else is going?'} aria-label={i === 0 ? 'You' : `Traveler ${i + 1}`}
                autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} data-form-type="other" name={`pg-t${i}`}
                onChange={e => setTravelers(ts => ts.map(x => (x.id === t.id ? { ...x, name: e.target.value } : x)))} />
              {i > 0 && (!initial || !initial.expenses.some(e => e.payerId === t.id || e.splitWith.includes(t.id))) && (
                <button className="close-btn" aria-label={`Remove ${t.name || 'traveler'}`} onClick={() => setTravelers(ts => ts.filter(x => x.id !== t.id))}><Icon name="close" /></button>
              )}
            </div>
          ))}
        </div>
        {tried && errors.you && <div className="help warn">{errors.you}</div>}
        {travelers.length < 8 && (
          <button className="chip small" style={{ marginTop: 10 }} onClick={() => setTravelers(ts => [...ts, { id: newId('p'), name: '', color: COLORS[ts.length % COLORS.length] }])}>
            <Icon name="person_add" />Add traveler
          </button>
        )}
        {travelers.length > 1 && (initial ? canInvite && (
          <button className="chip small invite" style={{ marginTop: 10, marginLeft: 8 }} onClick={invite}>
            <Icon name="ios_share" />{copied ? 'Link copied' : 'Share the trip with them'}
          </button>
        ) : (
          <div className="help">Once you create the trip, you’ll get a link to send them. They open it, pick their name and join.</div>
        ))}
      </div>

      <div className="field">
        <span className="label">Starting from</span>
        <PlaceSearch value={home} placeholder="Bangalore" label="Home city" onPick={p => setHome({ name: p.name, country: p.country, lat: p.lat, lng: p.lng, tz: p.tz })} />
        {tried && errors.home && <div className="help warn">{errors.home}</div>}
      </div>

      <div className="field">
        <span className="label">Stops</span>
        {stops.map((s, i) => (
          <div key={s.id}>
            <div className="help" style={{ margin: '10px 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name={TYPE_ICON[modeFor(legKeys[i], i)]} className={modeFor(legKeys[i], i) === 'flight' ? 'fly-down' : ''} />
              <select aria-label={`How you get to stop ${i + 1}`} value={modeFor(legKeys[i], i)} onChange={e => setModes(m => ({ ...m, [legKeys[i]]: e.target.value as Mode }))}
                style={{ border: 0, background: 'transparent', fontWeight: 700, color: 'var(--text-3)' }}>
                {MODES.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
              </select>
              <span>from {nameOf(seq[i])}</span>
            </div>
            <div className="stop-edit">
              <div className="h">
                <span className="idx mono" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
                <span className="n">{s.place?.name ?? (i === 0 ? 'First stop' : 'Next stop')}</span>
                {stops.length > 1 && <button className="close-btn" aria-label="Remove stop" onClick={() => setStops(st => st.filter(x => x.id !== s.id))}><Icon name="close" /></button>}
              </div>
              <div style={{ marginTop: 10 }}>
                <PlaceSearch value={s.place} placeholder="Search a city" label={`Stop ${i + 1} city`} onPick={p => setStop(s.id, { place: { name: p.name, country: p.country, lat: p.lat, lng: p.lng, tz: p.tz } })} />
              </div>
              {fill[s.id]?.kind === 'done' ? (
                <div className="scan-note ok"><Icon name="check_circle" fill /><span>Filled from your booking at {(fill[s.id] as { title: string }).title}. It’s added as a booked stay. Check the dates.</span></div>
              ) : (
                <button className={`fill-stop ${fill[s.id]?.kind === 'busy' ? 'busy' : ''}`} disabled={fill[s.id]?.kind === 'busy'}
                  onClick={() => { fillFor.current = s.id; fileRef.current?.click(); }}>
                  <Icon name={fill[s.id]?.kind === 'busy' ? 'progress_activity' : 'document_scanner'} />
                  <span>{fill[s.id]?.kind === 'busy' ? 'Reading your booking…' : 'Fill from a hotel booking'}<small>A screenshot or PDF. Fills the city and dates.</small></span>
                </button>
              )}
              {fill[s.id]?.kind === 'error' && <div className="scan-note bad"><Icon name="error" fill /><span>{(fill[s.id] as { message: string }).message}</span></div>}
              <div className="row2" style={{ marginTop: 10 }}>
                <label className="dt"><span className="k">Arrive</span><input type="date" value={s.arrive} onChange={e => setStop(s.id, { arrive: e.target.value, depart: s.depart < e.target.value ? e.target.value : s.depart })} /></label>
                <label className="dt"><span className="k">Leave</span><input type="date" value={s.depart} min={s.arrive} onChange={e => setStop(s.id, { depart: e.target.value })} /></label>
              </div>
            </div>
          </div>
        ))}
        {tried && errors.stops && <div className="help warn">{errors.stops}</div>}
        <button className="add-row" onClick={() => setStops(st => { const last = st.at(-1)!; return [...st, { id: newId('s'), place: null, arrive: last.depart, depart: addDays(last.depart, 2) }]; })}>
          <Icon name="add_circle" fill />Add a stop
        </button>
        <div className="help" style={{ margin: '10px 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={TYPE_ICON[modeFor(legKeys.at(-1)!, legKeys.length - 1)]} className={modeFor(legKeys.at(-1)!, legKeys.length - 1) === 'flight' ? 'fly-down' : ''} />
          <select aria-label="How you get home" value={modeFor(legKeys.at(-1)!, legKeys.length - 1)} onChange={e => setModes(m => ({ ...m, [legKeys.at(-1)!]: e.target.value as Mode }))}
            style={{ border: 0, background: 'transparent', fontWeight: 700, color: 'var(--text-3)' }}>
            {MODES.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
          <span>back to {home?.name ?? 'home'}</span>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="trip-cur">Currency</label>
        <div className="select-wrap">
          <select id="trip-cur" className="select" value={base} onChange={e => setBase(e.target.value as Currency)}>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <Icon name="unfold_more" />
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f && fillFor.current) void fillStop(fillFor.current, f);
      }} />
      {saveErr && <div className="scan-note bad" style={{ marginTop: 16 }}><Icon name="error" fill /><span>Couldn’t save: {saveErr}</span></div>}
    </Sheet>
  );
}
