'use client';

import { useState } from 'react';
import { fetchRecs, isStale } from '@/lib/recs-client';
import type { RecKind, RecSet, Stop, Trip } from '@/lib/types';
import { recKey } from '@/lib/types';
import { Avatar, Icon } from './ui';

const REC_ICON: Record<RecKind, string> = {
  food: 'restaurant', drink: 'local_bar', sight: 'photo_camera', museum: 'museum',
  outdoors: 'park', shop: 'shopping_bag', nightlife: 'nightlife', experience: 'wand_stars',
};

export function Recs({ trip, stop, me, onSave, onEditProfile }: {
  trip: Trip; stop: Stop; me: string; onSave: (s: RecSet) => void; onEditProfile: () => void;
}) {
  const [who, setWho] = useState(me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = trip.travelers.find(x => x.id === who) ?? trip.travelers[0];
  const set = trip.recs?.[recKey(stop.id, t.id)];
  const ready = (t.profile?.interests.length ?? 0) > 0;
  const label = t.id === me ? 'you' : t.name;

  async function run() {
    setBusy(true);
    setError(null);
    const r = await fetchRecs(trip, stop, t);
    setBusy(false);
    if (r.ok) onSave(r.set);
    else setError(r.message);
  }

  return (
    <section className="recs" aria-label={`Picked for travelers in ${stop.name}`}>
      <div className="section-h" style={{ margin: '22px 2px 10px' }}>
        <h3>Picked for {label}</h3>
        <span className="tag"><Icon name="wand_stars" />AI</span>
      </div>

      {trip.travelers.length > 1 && (
        <div className="chips" role="tablist" aria-label="Whose picks" style={{ marginBottom: 12 }}>
          {trip.travelers.map(x => (
            <button key={x.id} role="tab" aria-selected={x.id === t.id} className={`chip small ${x.id === t.id ? 'on' : ''}`}
              onClick={() => { setWho(x.id); setError(null); }}>
              <Avatar t={x} small />{x.id === me ? 'You' : x.name}
            </button>
          ))}
        </div>
      )}

      {!ready ? (
        <div className="rec-empty">
          <p>{t.id === me ? 'Pick five interests and Passage will suggest things for you here.' : `${t.name} hasn’t picked their interests yet.`}</p>
          {t.id === me && <button className="btn-line" onClick={onEditProfile}>Add your interests</button>}
        </div>
      ) : (
        <>
          <div className="interest-row">
            {t.profile!.interests.map(i => <span key={i} className="interest">{i}</span>)}
            {t.id === me && <button className="interest edit" onClick={onEditProfile} aria-label="Edit your interests"><Icon name="edit" />Edit</button>}
          </div>

          {set && !busy && (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {isStale(set, t) && (
                <div className="scan-note warn"><Icon name="info" fill /><span>{t.id === me ? 'Your' : `${t.name}’s`} interests changed since these were picked. Refresh for new ones.</span></div>
              )}
              {set.items.map(r => (
                <article key={r.name} className="rec">
                  <span className="rec-ic"><Icon name={REC_ICON[r.kind]} fill /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="r1">{r.name}</div>
                    <div className="r2">{r.area} · {r.distance}</div>
                    <p className="why">{r.why}</p>
                    <div className="rec-foot">
                      <span className="interest small">{r.interest}</span>
                      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer">Open <Icon name="open_in_new" /></a>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {busy && (
            <div className="rec-busy" role="status">
              <Icon name="progress_activity" className="spin" />
              <span>Looking around {stop.name} for {label}… this takes about 20 seconds.</span>
            </div>
          )}
          {error && <div className="scan-note bad" role="alert" style={{ marginTop: 12 }}><Icon name="error" fill /><span>{error}</span></div>}

          {!busy && (
            <button className={set ? 'btn-line' : 'btn-primary'} style={{ marginTop: 12 }} onClick={run}>
              {set ? `Refresh picks` : `Find things for ${label} in ${stop.name}`}
            </button>
          )}
          {set && !busy && (
            <div className="help" style={{ textAlign: 'center' }}>
              Picked by Claude from live web search · check details before you go
            </div>
          )}
        </>
      )}
    </section>
  );
}
