'use client';

import { DEMO_CITY, DEMO_TZ } from '@/lib/demo';

import { useState } from 'react';
import type { LocState, Sim } from '@/lib/hooks';
import { fmtDuration, instantToZoned } from '@/lib/time';
import type { Trip } from '@/lib/types';
import { Avatar, Icon, Sheet } from './ui';

export function WhoAreYou({ trip, onPick, onClose }: { trip: Trip; onPick: (id: string) => void; onClose?: () => void }) {
  return (
    <Sheet label="Who are you?" title="Who are you?" onClose={onClose ?? (() => {})}>
      <p className="help" style={{ fontSize: 14, marginTop: 0 }}>So {trip.name} knows who paid. This is remembered on this phone.</p>
      <div className="who">
        {trip.travelers.map(t => (
          <button key={t.id} onClick={() => onPick(t.id)}>
            <Avatar t={t} />{t.name}{t.id === trip.adminId && <span className="pill warn" style={{ marginLeft: 'auto' }}>Admin</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

type MenuKey = 'share' | 'trip' | 'profile' | 'demo';

/** Everything that used to crowd the trip screen, one tap away. */
export function TripMenu({ onPick, onClose, liveTimes, isDemo, isSample = isDemo, onDelete }: {
  onPick: (k: MenuKey) => void; onClose: () => void; liveTimes?: () => void; isDemo: boolean; isSample?: boolean; onDelete: () => void;
}) {
  const [sure, setSure] = useState(false);
  const row = (icon: string, label: string, sub: string, run: () => void) => (
    <button className="menu-row" onClick={run}>
      <Icon name={icon} /><span><b>{label}</b><small>{sub}</small></span><Icon name="chevron_right" />
    </button>
  );
  return (
    <Sheet label="Trip options" title="This trip" onClose={onClose}>
      <div className="menu">
        {row('ios_share', 'Share', 'Send the link to your group', () => onPick('share'))}
        {row('edit', 'Edit trip', 'Stops, dates and travelers', () => onPick('trip'))}
        {row('favorite', 'Your interests', 'What your picks are based on', () => onPick('profile'))}
        {liveTimes && row('near_me', 'Live leave-by times', 'Uses your location while the app is open', liveTimes)}
        {isDemo && row('tune', 'Demo controls', 'Move the clock, switch traveler', () => onPick('demo'))}
        <button className="menu-row danger" onClick={() => (sure ? onDelete() : setSure(true))}>
          <Icon name="delete" />
          <span><b>{sure ? 'Tap again to delete' : isSample ? 'Hide the sample trips' : 'Delete trip'}</b><small>{isSample ? 'You can bring them back from the home screen' : 'Removes it from this phone'}</small></span>
        </button>
      </div>
    </Sheet>
  );
}

export function ShareSheet({ trip, shared, onClose, onEdit }: { trip: Trip; shared: boolean; onClose: () => void; onEdit: () => void }) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/t/${trip.token}` : '';
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.share) await navigator.share({ title: trip.name, text: `Join ${trip.name} on Passage`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); }
    } catch { /* cancelled */ }
  };
  return (
    <Sheet label="Share trip" title="Share this trip" onClose={onClose}>
      {trip.isDemo ? (
        <p className="help" style={{ fontSize: 14, marginTop: 0 }}>This is the demo trip. It lives only on this phone, so changes here never affect anyone else. Create your own trip to get a share link.</p>
      ) : !shared ? (
        <p className="help" style={{ fontSize: 14, marginTop: 0 }}>Sharing isn’t switched on for this server yet, so this trip lives only on this phone.</p>
      ) : (
        <>
          <p className="help" style={{ fontSize: 14, marginTop: 0 }}>Anyone with this link can see the trip and add expenses. Keep it to your group.</p>
          <div className="share-box">{url}</div>
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={copy}>{copied ? 'Link copied' : 'Share link'}</button>
        </>
      )}
      <button className="btn-line" style={{ marginTop: 12 }} onClick={() => { onClose(); onEdit(); }}>Edit stops and travelers</button>
    </Sheet>
  );
}

export function DemoPanel({ sim, setSim, trip, now, me, setMe, loc, onReset, onClose }: {
  sim: Sim; setSim: (s: Sim) => void; trip: Trip; now: Date; me: string; setMe: (id: string) => void;
  loc: LocState; onReset: () => void; onClose: () => void;
}) {
  const local = instantToZoned(now, DEMO_TZ).slice(11, 16);
  return (
    <Sheet label="Demo controls" title="Demo controls" onClose={onClose}>
      <div className="demo-panel">
        <p className="help" style={{ fontSize: 14, marginTop: 0 }}>It’s Day 2 in Amsterdam. Move the clock to watch your next booking go from on track to at risk.</p>
        <div className="row">
          <div className="clock">{local} <span className="clock-sub">{DEMO_CITY}{sim.offsetMin ? ` · +${fmtDuration(sim.offsetMin)}` : ' · now'}</span></div>
          <input className="range" type="range" min={0} max={150} step={5} value={sim.offsetMin}
            onChange={e => setSim({ ...sim, offsetMin: Number(e.target.value) })} aria-label="Shift time forward" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[0, 30, 55, 70, 90].map(m => (
              <button key={m} className={`chip small ${sim.offsetMin === m ? 'on' : ''}`} onClick={() => setSim({ ...sim, offsetMin: m })}>{m ? `+${m} min` : 'Now'}</button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="label">Where you are</span>
          <div className="seg">
            <button className={sim.location === 'hotel' ? 'on' : ''} onClick={() => setSim({ ...sim, location: 'hotel' })}>At the hotel</button>
            <button className={sim.location === 'device' ? 'on' : ''} onClick={() => setSim({ ...sim, location: 'device' })}>My location</button>
            <button className={sim.location === 'none' ? 'on' : ''} onClick={() => setSim({ ...sim, location: 'none' })}>Unknown</button>
          </div>
          {sim.location === 'device' && loc.status !== 'on' && <div className="help warn">{loc.status === 'denied' ? 'Location is blocked, so tiles use time only.' : 'Waiting for your location…'}</div>}
        </div>
        <div className="row">
          <span className="label">View as</span>
          <div className="chips">
            {trip.travelers.map(t => (
              <button key={t.id} className={`chip small ${me === t.id ? 'on' : ''}`} onClick={() => setMe(t.id)}>
                <span className="av" style={{ background: me === t.id ? undefined : t.color }}>{t.name[0]}</span>{t.name}{t.id === trip.adminId ? ' (admin)' : ''}
              </button>
            ))}
          </div>
          <div className="help">View as GB and edit the market lunch bill to see the approval flow.</div>
        </div>
        <button className="btn-line" style={{ marginTop: 22 }} onClick={() => { onReset(); setSim({ offsetMin: 0, location: 'hotel' }); onClose(); }}>
          <Icon name="restart_alt" /> Reset the demo
        </button>
      </div>
    </Sheet>
  );
}
