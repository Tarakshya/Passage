'use client';

import { fmtMoney } from '@/lib/balances';
import { fmtDay, fmtDayLabel, fmtTime, zonedToInstant } from '@/lib/time';
import { countryName, ticketRange } from '@/lib/home';
import { isTransit } from '@/lib/trip';
import type { RecSet, Reservation, Stop, Trip } from '@/lib/types';
import { Recs } from './Recs';
import { LiveLine, type LiveFn } from './Itinerary';
import { MapView } from './MapView';
import { Icon, Sheet, STATUS_LABEL, TYPE_ICON } from './ui';

export function ReservationCard({ r, live, onOpen }: { r: Reservation; live: LiveFn; onOpen: () => void }) {
  const transit = isTransit(r);
  const s = live(r);
  const startK = r.type === 'hotel' ? 'Check-in' : transit ? 'Departs' : 'Starts';
  const endK = r.type === 'hotel' ? 'Check-out' : transit ? 'Arrives' : 'Ends';
  const stampCls = r.status === 'booked' ? '' : r.status === 'pending' ? 'pend' : 'todo';
  const cancelOpen = r.cancelBy && zonedToInstant(r.cancelBy, r.startTz) > new Date();
  return (
    <button className={`res-card ${s?.state ?? ''}`} onClick={onOpen} aria-label={`${r.title}, ${STATUS_LABEL[r.status]}. Edit`}>
      <div className="top">
        <span className={`res-icon ${r.status}`}><Icon name={TYPE_ICON[r.type]} fill /></span>
        <div className="grow">
          <div className="r1">{r.title}</div>
          <div className="r2">{(transit ? [r.route, r.service] : [r.address]).filter(Boolean).join(' · ') || (transit ? 'Transit' : 'No address yet')}</div>
        </div>
        <span className={`stamp ${stampCls}`}>{r.status === 'todo' ? 'To book' : STATUS_LABEL[r.status]}</span>
      </div>
      <div className="insets">
        <div className="inset"><div className="k">{startK}</div><div className="v">{fmtDay(r.startLocal.slice(0, 10))} · {fmtTime(r.startLocal)}</div></div>
        <div className="inset"><div className="k">{endK}</div><div className="v">{r.endLocal ? `${fmtDay(r.endLocal.slice(0, 10))} · ${fmtTime(r.endLocal)}` : '—'}</div></div>
      </div>
      {(r.confirmation || r.seat || r.price != null) && (
        <div className="kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {r.confirmation && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="k">Booking ID</span><span className="v">{r.confirmation}</span></div>}
          {r.seat && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="k">{r.type === 'hotel' ? 'Room' : 'Seat'}</span><span className="v" style={{ fontFamily: 'var(--sans)' }}>{r.seat}</span></div>}
          {r.price != null && r.currency && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="k">Price</span><span className="v">{fmtMoney(r.price, r.currency)}</span></div>}
        </div>
      )}
      {r.cancelBy && (
        cancelOpen
          ? <div className="note-ok"><Icon name="verified" fill />Free cancellation until {fmtDay(r.cancelBy.slice(0, 10))}, {fmtTime(r.cancelBy)}</div>
          : <div className="note-ok" style={{ color: 'var(--muted)' }}><Icon name="block" />Free cancellation ended {fmtDay(r.cancelBy.slice(0, 10))}</div>
      )}
      {s && <LiveLine s={s} r={r} />}
    </button>
  );
}

export function StopSheet({ trip, stop, live, me, onClose, onOpen, onAdd, onSaveRecs, onEditProfile }: {
  trip: Trip; stop: Stop; live: LiveFn; me: string; onClose: () => void; onOpen: (r: Reservation) => void; onAdd: () => void;
  onSaveRecs: (s: RecSet) => void; onEditProfile: () => void;
}) {
  const mine = trip.reservations
    .filter(r => r.stopId === stop.id)
    .sort((a, b) => zonedToInstant(a.startLocal, a.startTz).getTime() - zonedToInstant(b.startLocal, b.startTz).getTime());
  const days = [...new Set(mine.map(r => r.startLocal.slice(0, 10)))];
  return (
    <Sheet
      label={`${stop.name} reservations`}
      onClose={onClose}
      dark
      className="stop-sheet"
      hero={
        <div className="hero">
          <MapView center={{ lat: stop.lat, lng: stop.lng }} zoom={13} />
          <div className="title">
            <div className="k">STOP {String(stop.order).padStart(2, '0')} · {ticketRange(stop.arrive, stop.depart)} · {countryName(stop.country).toUpperCase()}</div>
            <h2>{stop.name}</h2>
          </div>
        </div>
      }
      title={
        <>
          <h2>Plans</h2>
          <button className="add-pill" onClick={onAdd}><Icon name="add" />Add</button>
        </>
      }
    >
      <div>
        {!mine.length && <p className="help" style={{ margin: '6px 2px 0', fontSize: 14 }}>Nothing booked in {stop.name} yet.</p>}
        {days.map(d => (
          <div key={d}>
            <div className="day-label">{fmtDayLabel(d)}</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {mine.filter(r => r.startLocal.startsWith(d)).map(r => <ReservationCard key={r.id} r={r} live={live} onOpen={() => onOpen(r)} />)}
            </div>
          </div>
        ))}
        <button className="add-row" onClick={onAdd}><Icon name="add" />Add an activity or meal in {stop.name}</button>
        <Recs trip={trip} stop={stop} me={me} onSave={onSaveRecs} onEditProfile={onEditProfile} />
      </div>
    </Sheet>
  );
}
