'use client';

import { useState } from 'react';
import type { Profile, Traveler } from '@/lib/types';
import { Icon, Sheet } from './ui';

export const MAX_INTERESTS = 5;

const SUGGESTIONS = [
  'Food markets', 'Coffee houses', 'Street food', 'Fine dining', 'Vegetarian food', 'Natural wine', 'Craft beer',
  'Modern art', 'Museums', 'Architecture', 'History', 'Photography', 'Design shops', 'Bookshops', 'Vintage',
  'Live music', 'Nightlife', 'Football', 'Hiking', 'Beaches', 'Cycling', 'Long city walks', 'Wellness & spas', 'Hidden gems',
];

/** Normalise a pasted link: add https:// when missing; null for anything that isn't a web address. */
export function cleanLink(raw: string): string | null | 'invalid' {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return 'invalid';
    return u.toString();
  } catch {
    return 'invalid';
  }
}

export function ProfileSheet({ traveler, firstTime, onSave, onClose }: {
  traveler: Traveler; firstTime: boolean; onSave: (p: Profile) => void; onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(traveler.profile?.interests ?? []);
  const [custom, setCustom] = useState('');
  const [link, setLink] = useState(traveler.profile?.link ?? '');
  const [tried, setTried] = useState(false);

  const full = picked.length >= MAX_INTERESTS;
  const toggle = (i: string) => setPicked(p => (p.includes(i) ? p.filter(x => x !== i) : full ? p : [...p, i]));
  const addCustom = () => {
    const v = custom.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!v || full || picked.some(p => p.toLowerCase() === v.toLowerCase())) return;
    setPicked(p => [...p, v]);
    setCustom('');
  };
  const linkValue = cleanLink(link);
  const extras = picked.filter(p => !SUGGESTIONS.includes(p));

  function save() {
    setTried(true);
    if (picked.length !== MAX_INTERESTS || linkValue === 'invalid') return;
    onSave({ interests: picked, link: linkValue, updatedAt: new Date().toISOString() });
    onClose();
  }

  return (
    <Sheet
      label="Your interests"
      title={firstTime ? `Hi ${traveler.name} — what do you love?` : 'Your interests'}
      onClose={onClose}
      tall
      footer={
        <button className="btn-primary" onClick={save}>
          {picked.length === MAX_INTERESTS ? (firstTime ? 'Save and continue' : 'Save') : `Pick ${MAX_INTERESTS - picked.length} more`}
        </button>
      }
    >
      <p className="help" style={{ fontSize: 14, marginTop: 0 }}>
        Pick five. In each city, Passage can suggest a few things picked for you, near where you’re staying.
      </p>

      <div className="field" style={{ marginTop: 14 }}>
        <span className="label">Interests <em>· {picked.length} of {MAX_INTERESTS}</em></span>
        <div className="chips">
          {[...extras, ...SUGGESTIONS].map(i => {
            const on = picked.includes(i);
            return (
              <button key={i} className={`chip small ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && full}
                style={!on && full ? { opacity: .45 } : undefined} onClick={() => toggle(i)}>
                {on && <Icon name="check" />}{i}
              </button>
            );
          })}
        </div>
        {!full && (
          <div className="row3" style={{ marginTop: 12 }}>
            <input className="input" value={custom} onChange={e => setCustom(e.target.value)} placeholder="Or add your own"
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustom())} aria-label="Add your own interest" maxLength={40} />
            <button className="btn-line" onClick={addCustom} disabled={!custom.trim()}>Add</button>
          </div>
        )}
        {tried && picked.length !== MAX_INTERESTS && <div className="help warn">Pick exactly five.</div>}
      </div>

      <div className="field">
        <label className="label" htmlFor="profile-link">A page you love <em>· optional</em></label>
        <div className="icon-input">
          <Icon name="link" />
          <input id="profile-link" className="input" value={link} onChange={e => setLink(e.target.value)} inputMode="url" autoCapitalize="off"
            placeholder="An article, blog or page that feels like you" />
        </div>
        {linkValue === 'invalid'
          ? <div className="help warn">That doesn’t look like a web address.</div>
          : <div className="help">Passage reads it once to get a feel for your taste. You can change it anytime.</div>}
      </div>
    </Sheet>
  );
}
