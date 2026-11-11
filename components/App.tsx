'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEMO_TOKEN } from '@/lib/demo';
import {
  DEMO_HOTEL, forgetTrip, ToastContext, useLocation, useLocationPref, useMe, useNow, useRates, useTrip, type Sim,
} from '@/lib/hooks';
import { nextUp } from '@/lib/home';
import { isTracked, liveStatus, type LiveStatus } from '@/lib/live-status';

import { currentStop, targetFor } from '@/lib/trip';
import type { Expense, Leg, Reservation, Stop, Trip } from '@/lib/types';
import { ExpenseSheet } from './ExpenseSheet';
import { NextUp, Ticket, Timeline, type ItineraryHandlers } from './Itinerary';
import { ReservationSheet, type ReservationPrefill } from './ReservationSheet';
import { DemoPanel, ShareSheet, TripMenu, WhoAreYou } from './SmallSheets';
import { createTrip } from './Trips';
import { ProfileSheet } from './ProfileSheet';
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
  | { kind: 'menu' }
  | { kind: 'demo' }
  | { kind: 'who' }
  | { kind: 'profile'; firstTime: boolean; back?: SheetState };

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
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<ReservationPrefill | null>(null);

  const isDemo = token === DEMO_TOKEN;
  const now = useNow(isDemo ? sim.offsetMin : 0);
  const loc = useLocation(isDemo ? sim.location === 'device' : locPref);
  const here = isDemo
    ? sim.location === 'hotel' ? DEMO_HOTEL : sim.location === 'device' && loc.status === 'on' ? loc.here : null
    : loc.status === 'on' ? loc.here : null;
  const rates = useRates(trip?.baseCurrency ?? 'EUR');

  // A trip's creator skips "Who are you?", so ask for their interests once when they first land.
  useEffect(() => {
    if (!trip || !me) return;
    const k = `passage:askprofile:${trip.token}`;
    let ask = false;
    try { ask = localStorage.getItem(k) === '1'; localStorage.removeItem(k); } catch { /* ignore */ }
    if (ask && !trip.travelers.find(t => t.id === me)?.profile) setSheet({ kind: 'profile', firstTime: true });
  }, [trip?.token, me]); // eslint-disable-line react-hooks/exhaustive-deps
  // The trip's name on <body>, so review notes can say which trip a note was made on.
  useEffect(() => { if (trip) document.body.dataset.trip = trip.name; return () => { delete document.body.dataset.trip; }; }, [trip?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); }, [toast]);

  const notify = useCallback((msg: string, action?: { label: string; run: () => void }) => setToast({ msg, action }), []);

  const live = useCallback((r: Reservation): LiveStatus | null => (trip ? liveStatus(r, now, here, targetFor(trip, r)) : null), [trip, now, here]);
  const next = useMemo(() => (trip ? nextUp(trip.reservations.map(r => ({ r, s: live(r) }))) : null), [trip, live]);
  const needsLocation = !isDemo && !locPref && Boolean(trip?.reservations.some(r => isTracked(r) && live(r)));

  if (state.status === 'loading') {
    return (
      <main className="app"><div className="screen">
        <div className="skeleton" style={{ height: 78, width: '70%' }} />
        <div className="skeleton" style={{ height: 104, marginTop: 28 }} />
        <div className="skeleton" style={{ height: 132, marginTop: 14 }} />
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
  const meT = trip.travelers.find(t => t.id === meId);

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
    if (sheet?.kind === 'trip' && sheet.initial) await mutate({ kind: 'replaceTrip', trip: t });
    else await createTrip(t, href => router.push(href));
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

        <header className="topbar">
          <Link href="/" className="back"><Icon name="chevron_left" />Trips</Link>
          <div className="tb-right">
            {isDemo && (
              <button className={`demo-chip ${sim.offsetMin ? 'shifted' : ''}`} onClick={() => setSheet({ kind: 'demo' })} aria-label="Demo controls">
                {sim.offsetMin ? `Demo · +${sim.offsetMin} min` : 'Demo'}
              </button>
            )}
            <button className="icon-btn" onClick={() => setSheet({ kind: 'menu' })} aria-label="Trip options"><Icon name="more_horiz" /></button>
          </div>
        </header>

        {tab === 'trip' ? (
          <div className="screen">
            {state.offline && <div className="offline"><Icon name="cloud_off" />Offline — changes will send when you’re back online</div>}
            {next && <NextUp r={next.r} s={next.s} onOpen={() => openRes(next.r)} />}
            <Ticket trip={trip} now={now} expanded={expanded} onToggle={() => setExpanded(x => !x)} />
            {!isDemo && locPref && (loc.status === 'denied' || loc.status === 'unavailable') && (
              <div className="help" style={{ margin: '10px 2px 0' }}>Location is off, so leave-by times use buffers only.</div>
            )}
            {expanded && <Timeline trip={trip} current={current} live={live} h={h} skip={next?.r.id} />}
          </div>
        ) : (
          <Split trip={trip} me={meId} rates={rates} onOpen={e => setSheet({ kind: 'exp', initial: e })} onUpdate={saveExp}
            onSwitchMe={() => (isDemo ? setSheet({ kind: 'demo' }) : setSheet({ kind: 'who' }))} />
        )}

        <nav className="tabbar" aria-label="Sections">
          <button className={`tab ${tab === 'trip' ? 'on' : ''}`} onClick={() => setTab('trip')} aria-current={tab === 'trip' ? 'page' : undefined}>Trip</button>
          <button className="fab" aria-label={tab === 'trip' ? 'New reservation' : 'New expense'}
            onClick={() => (tab === 'trip' ? openRes(null, { stopId: current?.id }) : setSheet({ kind: 'exp', initial: null }))}>
            <Icon name="add" />
          </button>
          <button className={`tab ${tab === 'split' ? 'on' : ''}`} onClick={() => setTab('split')} aria-current={tab === 'split' ? 'page' : undefined}>Ledger</button>
        </nav>

        {stopForSheet && (
          <StopSheet trip={trip} stop={stopForSheet} live={live} me={meId} onClose={() => setSheet(null)} onOpen={r => openRes(r)}
            onSaveRecs={recs => void mutate({ kind: 'setRecs', recs })}
            onEditProfile={() => setSheet({ kind: 'profile', firstTime: false, back: sheet ?? undefined })}
            onAdd={() => openRes(null, { stopId: stopForSheet.id, type: trip.reservations.some(r => r.stopId === stopForSheet.id && r.type === 'hotel') ? 'activity' : 'hotel' })} />
        )}
        {sheet?.kind === 'res' && (
          <ReservationSheet trip={trip} initial={sheet.initial} prefill={sheet.prefill} onSave={saveRes} onDelete={deleteRes} onClose={() => setSheet(null)} />
        )}
        {sheet?.kind === 'exp' && (
          <ExpenseSheet trip={trip} me={meId} initial={sheet.initial} onSave={saveExp} onDelete={deleteExp} onClose={() => setSheet(null)} notify={notify} />
        )}
        {sheet?.kind === 'trip' && <TripForm initial={sheet.initial} onSave={saveTrip} onClose={() => setSheet(null)} />}
        {sheet?.kind === 'menu' && (
          <TripMenu onClose={() => setSheet(null)} onPick={k => setSheet(k === 'profile' ? { kind: 'profile', firstTime: false } : k === 'trip' ? { kind: 'trip', initial: trip } : { kind: k })}
            liveTimes={needsLocation ? () => { setLocPref(true); setSheet(null); } : undefined} isDemo={isDemo}
            onDelete={() => {
              if (isDemo) { try { localStorage.setItem('passage:nosample', '1'); } catch { /* ignore */ } }
              else forgetTrip(token);
              router.push('/');
            }} />
        )}
        {sheet?.kind === 'share' && <ShareSheet trip={trip} shared={shared} onClose={() => setSheet(null)} onEdit={() => setSheet({ kind: 'trip', initial: trip })} />}
        {sheet?.kind === 'demo' && (
          <DemoPanel sim={sim} setSim={setSim} trip={trip} now={now} me={meId} setMe={setMe} loc={loc} onReset={resetDemo} onClose={() => setSheet(null)} />
        )}
        {(sheet?.kind === 'who' || (!me && !trip.isDemo)) && (
          <WhoAreYou trip={trip} onClose={me ? () => setSheet(null) : undefined} onPick={id => {
            setMe(id);
            // First time on this trip: ask what they love, so recommendations can be made for them.
            const t = trip.travelers.find(x => x.id === id);
            setSheet(t?.profile ? null : { kind: 'profile', firstTime: true });
          }} />
        )}
        {sheet?.kind === 'profile' && meT && (
          <ProfileSheet traveler={meT} firstTime={sheet.firstTime} onClose={() => setSheet(sheet.back ?? null)}
            onSave={profile => void mutate({ kind: 'upsertProfile', travelerId: meT.id, profile })} />
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
