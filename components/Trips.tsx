'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buildDemoTrip, buildPastTrip, isSampleToken } from '@/lib/demo';
import { placeCode, sortTrips, summaryStatus, ticketRange, timeOfDay, tripSummary, type TripSummary } from '@/lib/home';
import { forgetTrip, knownTrips, restoreTrip, useNow, useTemp } from '@/lib/hooks';
import { storeFor } from '@/lib/store';
import { daysBetween } from '@/lib/time';
import type { Trip } from '@/lib/types';
import { TripForm } from './TripForm';
import { ArrivedStamp, Icon, Sheet } from './ui';

/** Saves a brand-new trip, makes its creator the admin on this phone, and opens it. */
export async function createTrip(t: Trip, go: (href: string) => void) {
  await storeFor(t.token).create(t);
  try {
    localStorage.setItem(`passage:me:${t.token}`, t.adminId);
    localStorage.setItem(`passage:askprofile:${t.token}`, '1'); // ask the creator what they love on arrival
    if (t.travelers.length > 1) localStorage.setItem(`passage:askshare:${t.token}`, '1'); // then offer the link for everyone else
  } catch { /* ignore */ }
  go(`/t/${t.token}`);
}

function TripCard({ s, now, temp }: { s: TripSummary; now: Date; temp: number | null }) {
  const st = summaryStatus(s, now);
  const first = s.stops[0];
  const last = s.stops.at(-1);
  const codes = [s.home, ...s.stops.map(x => x.name)].filter(Boolean).map(placeCode);
  const nights = first && last ? daysBetween(first.arrive, last.depart) : null;
  const left = s.total - s.booked;
  return (
    <Link href={`/t/${s.token}`} className={`ticket trip-card ${st.phase}`} aria-label={`${s.name}, ${st.text}`} draggable={false}>
      <div className="main">
        <div className="status">
          {st.phase === 'now' && <span className="live-dot" aria-hidden="true" />}
          {st.text}{st.city && ` · ${st.city.name}`}{st.city && temp !== null && `, ${temp}°`}
        </div>
        <h2>{s.name}</h2>
        {codes.length > 1 && <div className="codes" aria-hidden="true">{codes.join('  ·  ')}</div>}
        <div className="meta">
          {first && last && <div>Dates<b>{ticketRange(first.arrive, last.depart)}</b></div>}
          {nights !== null && <div>Nights<b>{nights}</b></div>}
          {s.crew.length > 0 && <div>Crew<b>{s.crew.length}</b></div>}
        </div>
      </div>
      {/* A finished trip gets an arrival stamp on the paper part of the ticket. */}
      {st.phase === 'past' && last && <ArrivedStamp code={placeCode(s.home ?? last.name)} date={last.depart} />}
      {s.total > 0 && (
        <div className="stub">
          <small>Booked</small>
          <div className="big">{s.booked}/{s.total}</div>
          {left > 0 && <div className="togo">{left} to go</div>}
        </div>
      )}
    </Link>
  );
}

/**
 * Swipe a trip ticket left to reveal Delete. Vertical scrolling is left to the browser; a swipe
 * never opens the trip, and tapping an open card closes it again.
 */
function Swipe({ children, onDelete, name }: { children: ReactNode; onDelete: () => void; name: string }) {
  const REVEAL = 104;
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const drag = useRef<{ x: number; y: number; base: number; axis?: 'x' | 'y' } | null>(null);
  const swiped = useRef(false);
  const settle = (o: boolean) => { setOpen(o); setDx(o ? -REVEAL : 0); };
  return (
    <div className={`swipe ${open ? 'open' : ''} ${dx < 0 ? 'moving' : ''}`}>
      <button className="swipe-del" onClick={onDelete} tabIndex={open ? 0 : -1} aria-hidden={!open} aria-label={`Delete ${name}`}>
        <Icon name="delete" />Delete
      </button>
      <div
        className="swipe-card"
        style={{ transform: `translateX(${dx}px)`, transition: drag.current?.axis === 'x' ? 'none' : undefined }}
        onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, base: open ? -REVEAL : 0 }; swiped.current = false; }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const mx = e.clientX - d.x;
          const my = e.clientY - d.y;
          if (!d.axis) {
            if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) d.axis = 'x';
            else if (Math.abs(my) > 8) d.axis = 'y';
          }
          if (d.axis === 'x') { swiped.current = true; setDx(Math.max(-REVEAL * 1.25, Math.min(0, d.base + mx))); }
        }}
        onPointerUp={() => { if (drag.current?.axis === 'x') settle(dx < -REVEAL / 2); drag.current = null; }}
        onPointerCancel={() => { if (drag.current?.axis === 'x') settle(dx < -REVEAL / 2); drag.current = null; }}
        onClickCapture={e => {
          // A swipe, or a tap on an open card, must not open the trip.
          if (swiped.current || open) { e.preventDefault(); e.stopPropagation(); if (!swiped.current) settle(false); }
          swiped.current = false;
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Add to Home Screen: Android/desktop Chrome get the browser's own install prompt; iPhone gets the two taps it needs. */
/** The "How it works" tips: on an empty home screen, and behind the link under the sample trips. */
function Tips({ installed, onDownload }: { installed: boolean; onDownload: () => void }) {
  const download = onDownload;
  return (
    <>
    <p className="ai-line"><b>Passage does the busywork:</b> it reads your bookings and receipts, and researches each city around what you love. You check everything before it’s saved, booked or expensed.</p>
    <ol className="tips">
      <li><b className="c-gold">Start with your stops.</b> Add each city and your dates. Passage lays out the route and shows what’s left to book.</li>
      <li><b className="c-lagoon">Screenshot your bookings.</b> Tap + and add a confirmation screenshot or PDF. Passage fills in the details; you confirm and save.</li>
      <li><b className="c-lagoon">Tap a city</b> to see everything booked there, plus places curated for your interests.</li>
      <li><b><span className="late">Next Up</span> warns when you’re running late.</b></li>
      <li><b className="c-lagoon">Log what you pay in the Ledger.</b> Scan a receipt; Passage works out who owes whom.</li>
      {installed
        ? <li><b className="c-lagoon">It’s on your home screen.</b> Passage opens like an app and works offline.</li>
        : <li><button className="tip-link" onClick={download}>Download</button> Passage to your home screen. It opens like an app and works offline.</li>}
    </ol>
    </>
  );
}

function HowItWorksSheet({ installed, onDownload, onClose }: { installed: boolean; onDownload: () => void; onClose: () => void }) {
  return (
    <Sheet label="How it works" title="How it works" onClose={onClose} className="how-sheet">
      <div className="first-trip in-sheet">
        <Tips installed={installed} onDownload={onDownload} />
        <p className="sheet-tip">On the sample trip, tap <b>Demo</b> at the top to move the clock and watch Next Up warn you you&rsquo;re running late.</p>
      </div>
    </Sheet>
  );
}

function InstallSheet({ onClose }: { onClose: () => void }) {
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <Sheet label="Download Passage" title="Download Passage" onClose={onClose}>
      <p className="help" style={{ fontSize: 14.5, marginTop: 0 }}>Passage installs from your browser in a few seconds. It gets its own icon, opens full screen and works offline.</p>
      <ol className="install-steps">
        {ios ? (
          <>
            <li>Tap the <b>Share</b> button <Icon name="ios_share" /> at the bottom of Safari.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b>. Passage is now on your home screen.</li>
          </>
        ) : (
          <>
            <li>Open your browser’s menu <Icon name="more_vert" /> (top right in Chrome).</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
            <li>Confirm. Passage is now on your home screen.</li>
          </>
        )}
      </ol>
      <button className="btn-line" style={{ marginTop: 18 }} onClick={onClose}>Got it</button>
    </Sheet>
  );
}

interface InstallEvent extends Event { prompt: () => Promise<void> }

const NO_SAMPLE = 'passage:nosample';
const samples = () => [tripSummary(buildDemoTrip(new Date())), tripSummary(buildPastTrip(new Date()))];

/**
 * `clean` is the /start link: no sample trip, just "plan your first trip". Opening /start once
 * remembers that on the phone, so "‹ Trips" from inside a trip stays clean too; the home screen
 * offers a link to bring the sample trip back.
 */
export function Trips({ clean = false }: { clean?: boolean }) {
  const router = useRouter();
  const now = useNow();
  const [list, setList] = useState<TripSummary[] | null>(null);
  const [how, setHow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hideSample, setHideSample] = useState(clean);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [install, setInstall] = useState(false);
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setInstalled(Boolean(standalone));
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const download = async () => {
    if (installEvt) { await installEvt.prompt().catch(() => setInstall(true)); setInstallEvt(null); }
    else setInstall(true);
  };

  useEffect(() => {
    let hide = clean;
    try {
      if (clean) localStorage.setItem(NO_SAMPLE, '1');
      else hide = localStorage.getItem(NO_SAMPLE) === '1';
    } catch { /* ignore */ }
    setHideSample(hide);
    // The samples are rebuilt for today: one always mid-trip, one finished a few weeks ago.
    const mine = knownTrips().filter(t => !isSampleToken(t.token));
    setList(hide ? mine : [...mine, ...samples()]);
  }, [clean]);

  const hideTheSample = () => {
    try { localStorage.setItem(NO_SAMPLE, '1'); } catch { /* ignore */ }
    setHideSample(true);
  };
  const remove = (t: TripSummary) => {
    if (t.isDemo) {
      hideTheSample();
      setToast({ msg: 'Sample trips hidden', undo: () => showSample() });
      return;
    }
    const snap = forgetTrip(t.token);
    setList(l => (l ?? []).filter(x => x.token !== t.token));
    setToast({ msg: `Deleted “${t.name}”`, undo: () => { restoreTrip(snap); setList(l => [t, ...(l ?? [])]); } });
  };

  const showSample = () => {
    try { localStorage.removeItem(NO_SAMPLE); } catch { /* ignore */ }
    setHideSample(false);
    setList(l => [...(l ?? []).filter(t => !t.isDemo), ...samples()]);
    if (clean) router.replace('/');
  };

  const sorted = list ? sortTrips(list.filter(t => !t.isDemo), now) : [];
  const demos = hideSample || !list ? [] : sortTrips(list.filter(t => t.isDemo), now);
  const demo = demos[0];
  const live = sorted.find(t => summaryStatus(t, now).phase === 'now') ?? (demo && !sorted.length ? demo : undefined);
  const city = live ? summaryStatus(live, now).city : null;
  const temp = useTemp(city);
  const empty = list !== null && !sorted.length && !demo;

  return (
    <main className="app">
      <div className="screen home">
        <div className="wordmark">Passage</div>
        {/* The greeting uses the phone's clock, so it's filled in after load (the server's clock can disagree). */}
        <h1 className="screen-title">{list ? `${timeOfDay(now)}.` : '\u00a0'}</h1>
        {!empty && <p className="screen-sub">{sorted.length ? 'Your trips' : 'Two sample trips to explore, one under way and one finished. Or plan your own.'}</p>}

        {!list && <div className="skeleton" style={{ height: 150, marginTop: 22 }} />}
        {empty ? (
          <div className="first-trip">
            <h2 className="how">How it works</h2>
            <Tips installed={installed} onDownload={download} />
            <button className="btn-primary go" onClick={() => setCreating(true)}>Where to next?<Icon name="arrow_forward" /></button>
          </div>
        ) : (
          <>
            <div className="trip-list">
              {sorted.map(t => (
                <Swipe key={t.token} name={t.name} onDelete={() => remove(t)}><TripCard s={t} now={now} temp={t === live ? temp : null} /></Swipe>
              ))}
              {demo && sorted.length > 0 && <div className="lbl" style={{ margin: '10px 2px -4px' }}><span>Sample trips</span></div>}
              {demos.map(s => (
                <Swipe key={s.token} name="the sample trips" onDelete={() => remove(s)}><TripCard s={s} now={now} temp={s === live ? temp : null} /></Swipe>
              ))}
            </div>
            <button className="add-row" onClick={() => setCreating(true)}><Icon name="add" />Plan a new trip</button>
            <button className="how-link" onClick={() => setHow(true)}><Icon name="info" />How it works</button>
          </>
        )}
        {hideSample && list !== null && <button className="quiet-link" onClick={showSample}>See the sample trips</button>}
      </div>
      {how && <HowItWorksSheet installed={installed} onClose={() => setHow(false)} onDownload={() => { setHow(false); void download(); }} />}
      {install && <InstallSheet onClose={() => setInstall(false)} />}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.undo && <button onClick={() => { toast.undo!(); setToast(null); }}>Undo</button>}
        </div>
      )}
      {creating && <TripForm initial={null} onSave={t => createTrip(t, href => router.push(href))} onClose={() => setCreating(false)} />}
    </main>
  );
}
