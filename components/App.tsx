'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEMO_TOKEN } from '@/lib/demo';
import {
  DEMO_HOTEL, knownTrips, ToastContext, useLocation, useLocationPref, useMe, useNow, useRates, useTrip,
  type KnownTrip, type Sim,
} from '@/lib/hooks';
import { isTracked, liveStatus, mostUrgent, type LiveStatus } from '@/lib/live-status';
import { storeFor } from '@/lib/store';
import { fmtRange } from '@/lib/time';
import { currentStop, targetFor } from '@/lib/trip';
import type { Expense, Leg, Reservation, Stop, Trip } from '@/lib/types';
import { ExpenseSheet } from './ExpenseSheet';
import { Timeline, TripTile, type ItineraryHandlers } from './Itinerary';
import { ReservationSheet, type ReservationPrefill } from './ReservationSheet';
import { DemoPanel, ShareSheet, WhoAreYou } from './SmallSheets';
import { Split } from './Split';
import { StopSheet } from './StopSheet';
import { TripForm } from './TripForm';
import { Icon } from './ui';

type SheetState =
  | { kind: 'stop'; stopId: string }
  | { kind: 'res'; initial: Reservation | null; prefill: ReservationPrefill }
  | { kind: 'exp'; initial: Expense | null }
  | { kind: 'trip'; initial: Trip | null }
  | { kind: 'share' }
  | { kind: 'demo' }
  | { kind: 'who' };

export function App({ token }: { token: string }) {
  const router = useRouter();
  const { state, mutate, resetDemo, shared } = useTrip(token);
  const trip = state.status === 'ready' ? state.trip : null;
  const [me, setMe] = useMe(trip);
  const [tab, setTab] = useState<'trip' | 'split'>('trip');
  const [expanded, setExpanded] = useState(true);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; run: () => void } } | null>(null);
  const [sim, setSim] = useState<Sim>({ offsetMin: 0, location: 'hotel' });
  const [locPref, setLocPref] = useLocationPref(token);
  const [others, setOthers] = useState<KnownTrip[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<ReservationPrefill | null>(null);

  const isDemo = token === DEMO_TOKEN;
  const now = useNow(isDemo ? sim.offsetMin : 0);
  const loc = useLocation(isDemo ? sim.location === 'device' : locPref);
  const here = isDemo
    ? sim.location === 'hotel' ? DEMO_HOTEL : sim.location === 'device' && loc.status === 'on' ? loc.here : null
    : loc.status === 'on' ? loc.here : null;
  const rates = useRates(trip?.baseCurrency ?? 'EUR');

  useEffect(() => { setOthers(knownTrips().filter(t => t.token !== token)); }, [token, trip?.name]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); }, [toast]);

  const notify = useCallback((msg: string, action?: { label: string; run: () => void }) => setToast({ msg, action }), []);

  const live = useCallback((r: Reservation): LiveStatus | null => (trip ? liveStatus(r, now, here, targetFor(trip, r)) : null), [trip, now, here]);
  const urgent = useMemo(() => {
    if (!trip) return null;
    const pairs = trip.reservations.map(r => ({ r, s: live(r) }));
    const s = mostUrgent(pairs.map(p => p.s));
    return s ? pairs.find(p => p.s === s) as { r: Reservation; s: LiveStatus } : null;
  }, [trip, live]);
  const needsLocation = !isDemo && !locPref && Boolean(trip?.reservations.some(r => isTracked(r) && live(r)));

  if (state.status === 'loading') {
    return (
      <main className="app"><div className="screen">
        <div className="screen-head"><h1 className="screen-title">Trips</h1></div>
        <div className="skeleton" style={{ height: 198 }} />
        <div className="skeleton" style={{ height: 156, marginTop: 70 }} />
      </div></main>
    );
  }
  if (state.status !== 'ready' || !trip) {
    return (
      <main className="app"><div className="empty-state">
        <Icon name={state.status === 'error' ? 'cloud_off' : 'link_off'} />
        <h2>{state.status === 'error' ? 'Can’t reach this trip' : 'This trip link doesn’t work'}</h2>
        <p>{state.status === 'error' ? 'You’re offline and this phone hasn’t opened it before.' : 'It may have been mistyped, or the trip was deleted.'}</p>
        <button className="btn-primary" style={{ marginTop: 18 }} onClick={() => router.push(`/t/${DEMO_TOKEN}`)}>Open the demo trip</button>
      </div></main>
    );
  }

  const current = currentStop(trip, now);
  const meId = me ?? trip.adminId;

  const openRes = (initial: Reservation | null, prefill: ReservationPrefill = {}) => setSheet({ kind: 'res', initial, prefill });
  const h: ItineraryHandlers = {
    openStop: s => setSheet({ kind: 'stop', stopId: s.id }),
    openReservation: r => openRes(r),
    addToStop: (s: Stop, opts) => {
      if (opts?.scan) {
        // The picker must open inside the tap itself or iOS blocks it.
        pendingUpload.current = { stopId: s.id, type: opts.type };
        fileRef.current?.click();
        return;
      }
      openRes(null, { stopId: s.id, type: opts?.type });
    },
    addToLeg: (l: Leg) => openRes(null, { legId: l.id, type: l.mode }),
  };

  const saveRes = (r: Reservation) => void mutate({ kind: 'upsertReservation', reservation: r });
  const deleteRes = (id: string) => {
    const old = trip.reservations.find(r => r.id === id);
    void mutate({ kind: 'deleteReservation', id });
    if (old) notify('Reservation deleted', { label: 'Undo', run: () => saveRes(old) });
  };
  const saveExp = (e: Expense) => void mutate({ kind: 'upsertExpense', expense: e });
  const deleteExp = (id: string) => {
    const old = trip.expenses.find(e => e.id === id);
    void mutate({ kind: 'deleteExpense', id });
    if (old) notify('Expense deleted', { label: 'Undo', run: () => saveExp(old) });
  };

  const saveTrip = async (t: Trip) => {
    if (sheet?.kind === 'trip' && sheet.initial) {
      await mutate({ kind: 'replaceTrip', trip: t });
      return;
    }
    await storeFor(t.token).create(t);
    try { localStorage.setItem(`passage:me:${t.token}`, t.adminId); } catch { /* ignore */ }
    router.push(`/t/${t.token}`);
  };

  const stopForSheet = sheet?.kind === 'stop' ? trip.stops.find(s => s.id === sheet.stopId) : undefined;

  return (
    <ToastContext.Provider value={notify}>
      <main className="app">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f && pendingUpload.current) openRes(null, { ...pendingUpload.current, file: f });
          pendingUpload.current = null;
        }} />

        {isDemo && (
          <button className={`demo-chip ${sim.offsetMin ? 'shifted' : ''}`} onClick={() => setSheet({ kind: 'demo' })} aria-label="Demo controls">
            <Icon name="science" fill />{sim.offsetMin ? `Demo · +${sim.offsetMin} min` : 'Demo'}
          </button>
        )}

        {tab === 'trip' ? (
          <div className="screen">
            <div className="screen-head">
              <h1 className="screen-title">Trips</h1>
              {!isDemo && <button className="icon-btn-acc" onClick={() => setSheet({ kind: 'trip', initial: null })} aria-label="New trip"><Icon name="add" /></button>}
            </div>
            {state.offline && <div className="offline"><Icon name="cloud_off" />Offline — changes will send when you’re back online</div>}
            <TripTile trip={trip} now={now} expanded={expanded} onToggle={() => setExpanded(x => !x)} urgent={urgent} />
            <div style={{ display: 'flex', gap: 8, margin: '10px 0 0' }}>
              <button className="chip-btn" onClick={() => setSheet({ kind: 'share' })}><Icon name="ios_share" />Share</button>
              <button className="chip-btn" onClick={() => setSheet({ kind: 'trip', initial: trip })}><Icon name="edit" />Edit trip</button>
              {needsLocation && <button className="chip-btn" onClick={() => setLocPref(true)}><Icon name="near_me" className="acc" />Live times</button>}
            </div>
            {!isDemo && locPref && (loc.status === 'denied' || loc.status === 'unavailable') && (
              <div className="help" style={{ margin: '8px 4px 0' }}>Location is off, so leave-by times use buffers only.</div>
            )}
            {expanded && (
              <>
                <div className="divider"><span>Itinerary</span></div>
                <Timeline trip={trip} current={current} live={live} h={h} />
              </>
            )}
            <div className="divider" style={{ marginTop: 10 }}><span>{others.length ? 'Your other trips' : 'Start your own'}</span></div>
            {others.map(o => (
              <button key={o.token} className="trip-row" onClick={() => router.push(`/t/${o.token}`)}>
                <span className="thumb" style={o.token === DEMO_TOKEN ? { background: 'linear-gradient(135deg,#2E6BD6,#6C63FF 52%,#C23B78)' } : undefined} />
                <span>
                  <div className="t1">{o.name}{o.token === DEMO_TOKEN ? ' · demo' : ''}</div>
                  <div className="t2">{o.start && o.end ? `${fmtRange(o.start, o.end).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())} · ` : ''}{o.stops} stops</div>
                </span>
                <Icon name="chevron_right" />
              </button>
            ))}
            {isDemo && (
              <button className="trip-row" onClick={() => setSheet({ kind: 'trip', initial: null })}>
                <span className="thumb" />
                <span><div className="t1">Plan a real trip</div><div className="t2">Add your stops, share the link with your group</div></span>
                <Icon name="add" />
              </button>
            )}
          </div>
        ) : (
          <Split trip={trip} me={meId} rates={rates} onOpen={e => setSheet({ kind: 'exp', initial: e })} onUpdate={saveExp}
            onSwitchMe={() => (isDemo ? setSheet({ kind: 'demo' }) : setSheet({ kind: 'who' }))} />
        )}

        <nav className="tabbar" aria-label="Sections">
          <button className={`tab ${tab === 'trip' ? 'on' : ''}`} onClick={() => setTab('trip')} aria-current={tab === 'trip' ? 'page' : undefined}><Icon name="map" fill={tab === 'trip'} />Trip</button>
          <button className="fab" aria-label={tab === 'trip' ? 'New reservation' : 'New expense'}
            onClick={() => (tab === 'trip' ? openRes(null, { stopId: current?.id }) : setSheet({ kind: 'exp', initial: null }))}>
            <Icon name="add" />
          </button>
          <button className={`tab ${tab === 'split' ? 'on' : ''}`} onClick={() => setTab('split')} aria-current={tab === 'split' ? 'page' : undefined}><Icon name="receipt_long" fill={tab === 'split'} />Split</button>
        </nav>

        {stopForSheet && (
          <StopSheet trip={trip} stop={stopForSheet} live={live} onClose={() => setSheet(null)} onOpen={r => openRes(r)}
            onAdd={() => openRes(null, { stopId: stopForSheet.id, type: trip.reservations.some(r => r.stopId === stopForSheet.id && r.type === 'hotel') ? 'activity' : 'hotel' })} />
        )}
        {sheet?.kind === 'res' && (
          <ReservationSheet trip={trip} initial={sheet.initial} prefill={sheet.prefill} onSave={saveRes} onDelete={deleteRes} onClose={() => setSheet(null)} />
        )}
        {sheet?.kind === 'exp' && (
          <ExpenseSheet trip={trip} me={meId} initial={sheet.initial} onSave={saveExp} onDelete={deleteExp} onClose={() => setSheet(null)} notify={notify} />
        )}
        {sheet?.kind === 'trip' && <TripForm initial={sheet.initial} onSave={saveTrip} onClose={() => setSheet(null)} />}
        {sheet?.kind === 'share' && <ShareSheet trip={trip} shared={shared} onClose={() => setSheet(null)} onEdit={() => setSheet({ kind: 'trip', initial: trip })} />}
        {sheet?.kind === 'demo' && (
          <DemoPanel sim={sim} setSim={setSim} trip={trip} now={now} me={meId} setMe={setMe} loc={loc} onReset={resetDemo} onClose={() => setSheet(null)} />
        )}
        {(sheet?.kind === 'who' || (!me && !trip.isDemo)) && (
          <WhoAreYou trip={trip} onPick={id => { setMe(id); setSheet(null); }} onClose={me ? () => setSheet(null) : undefined} />
        )}

        {toast && (
          <div className="toast" role="status">
            <span>{toast.msg}</span>
            {toast.action && <button onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>}
          </div>
        )}
      </main>
    </ToastContext.Provider>
  );
}
