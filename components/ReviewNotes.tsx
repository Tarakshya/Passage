'use client';

// Review notes: a small "Note" button that exists only on T's private review link. T taps it on
// any screen, types or dictates a note, and the note is saved on the phone with where it was made
// (page, open panel, last thing tapped). "Copy notes for Claude" puts them all on the clipboard to
// paste into chat. Nothing is sent anywhere; the live app never shows this.

import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

interface Note { at: string; where: string; text: string }
const KEY = 'passage:review-notes';

/** Only on the review deployment (or with ?review on a local build, for testing). */
function isReview(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h.includes('git-review') || (/^(localhost|127\.0\.0\.1)$/.test(h) && new URLSearchParams(window.location.search).has('review'));
}

const load = (): Note[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Note[]; } catch { return []; } };
const store = (n: Note[]) => { try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } };

const label = (el: Element | null): string => {
  if (!el) return '';
  const t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};

/** "Trip “Austria–Croatia” · panel: Vienna reservations · last tapped: “To book”" */
function whereAmI(lastTap: string): string {
  const path = window.location.pathname;
  const page = path === '/' ? 'Trips home' : path === '/start' ? 'Clean start' : path.startsWith('/t/')
    ? `Trip “${document.body.dataset.trip || path}”${document.querySelector('.tab.on')?.textContent === 'Ledger' ? ' · Ledger tab' : ''}`
    : path;
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(d => !d.closest('.rn'));
  const panel = dialogs.length ? label(dialogs[dialogs.length - 1]) : '';
  return [page, panel && `panel: ${panel}`, lastTap && `last tapped: “${lastTap}”`].filter(Boolean).join(' · ');
}

export function ReviewNotes() {
  const [on, setOn] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [mode, setMode] = useState<'closed' | 'write' | 'list'>('closed');
  const [text, setText] = useState('');
  const [where, setWhere] = useState('');
  const [flash, setFlash] = useState('');
  const [sure, setSure] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // index of the note being edited, or null for a new one
  const lastTap = useRef('');
  const copyBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isReview()) return;
    setOn(true);
    setNotes(load());
    // Remember the last thing tapped in the app (not in this panel) to give each note context.
    const onTap = (e: Event) => {
      const el = (e.target as Element)?.closest?.('button, a, [role="button"], input, select, h1, h2, h3, h4');
      if (el && !el.closest('.rn')) lastTap.current = label(el);
    };
    document.addEventListener('pointerdown', onTap, true);
    return () => document.removeEventListener('pointerdown', onTap, true);
  }, []);

  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 2200); return () => clearTimeout(t); }, [flash]);

  if (!on) return null;

  const open = () => { setEditing(null); setWhere(whereAmI(lastTap.current)); setText(''); setMode('write'); };
  const edit = (i: number) => { setEditing(i); setWhere(notes[i].where); setText(notes[i].text); setSure(false); setMode('write'); };
  const save = () => {
    const v = text.trim();
    if (!v) return;
    if (editing !== null) {
      // Editing keeps the note's place and where it was made; only the words change.
      const next = notes.map((n, j) => (j === editing ? { ...n, text: v } : n));
      setNotes(next); store(next); setEditing(null); setMode('list'); setFlash(`Note ${editing + 1} updated`);
      return;
    }
    const next = [...notes, { at: new Date().toISOString(), where, text: v }];
    setNotes(next); store(next); setMode('closed'); setFlash(`Note ${next.length} saved`);
  };
  const cancelWrite = () => { setMode(editing !== null ? 'list' : 'closed'); setEditing(null); };
  const remove = (i: number) => { const next = notes.filter((_, j) => j !== i); setNotes(next); store(next); };
  const clearAll = () => {
    setEditing(null);
    if (!sure) { setSure(true); return; }
    setNotes([]); store([]); setSure(false); setMode('closed'); setFlash('Notes cleared');
  };

  const exportText = [
    `Passage review notes (${notes.length}) · ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
    ...notes.map((n, i) => `${i + 1}. [${n.where}]\n   ${n.text}`),
  ].join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(exportText); setFlash('Copied. Paste it into your chat with Claude.'); }
    catch { copyBox.current?.focus(); copyBox.current?.select(); setFlash('Select all and copy the text below'); }
  };

  return (
    <div className="rn">
      {mode === 'closed' && (
        <div className="rn-dock">
          {notes.length > 0 && <button className="rn-count" onClick={() => setMode('list')} aria-label={`Your ${notes.length} notes`}>{notes.length}</button>}
          <button className="rn-btn" onClick={open}><Icon name="edit_note" />Note</button>
        </div>
      )}

      {mode !== 'closed' && (
        <div className="rn-backdrop" onClick={() => { setMode('closed'); setEditing(null); }}>
          <div className="rn-panel" role="dialog" aria-label={mode === 'write' ? (editing !== null ? 'Edit review note' : 'New review note') : 'Your review notes'} onClick={e => e.stopPropagation()}>
            {mode === 'write' ? (
              <>
                <div className="rn-head"><b>{editing !== null ? `Edit note ${editing + 1}` : 'New note'}</b><button onClick={cancelWrite}>Cancel</button></div>
                <div className="rn-where">{where}</div>
                <textarea id="rn-text" className="input" autoFocus rows={4} value={text} onChange={e => setText(e.target.value)}
                  placeholder="What’s wrong, or what would you change? Tap the mic on your keyboard to dictate." />
                <div className="rn-actions">
                  {editing === null && notes.length > 0 && <button className="btn-line" onClick={() => setMode('list')}>All notes ({notes.length})</button>}
                  <button className="btn-primary" onClick={save} disabled={!text.trim()}>{editing !== null ? 'Save changes' : 'Save note'}</button>
                </div>
              </>
            ) : (
              <>
                <div className="rn-head"><b>Your notes ({notes.length})</b><button onClick={() => setMode('closed')} aria-label="Close">Done</button></div>
                <ol className="rn-list">
                  {notes.map((n, i) => (
                    <li key={n.at}>
                      <div className="rn-where">{n.where}</div>
                      <button className="rn-text" onClick={() => edit(i)} aria-label={`Edit note ${i + 1}: ${n.text}`}>{n.text}</button>
                      <div className="rn-tools">
                        <button onClick={() => edit(i)} aria-label={`Edit note ${i + 1}`}><Icon name="edit" /></button>
                        <button onClick={() => remove(i)} aria-label={`Delete note ${i + 1}`}><Icon name="delete" /></button>
                      </div>
                    </li>
                  ))}
                </ol>
                {notes.length > 0 ? (
                  <>
                    <button className="btn-primary" onClick={copy}><Icon name="content_copy" /> Copy notes for Claude</button>
                    <textarea ref={copyBox} className="rn-copybox" readOnly value={exportText} aria-label="Notes as text" />
                    <button className="btn-quiet" onClick={clearAll}>{sure ? 'Tap again to delete all notes' : 'Clear all notes'}</button>
                  </>
                ) : <p className="help">No notes yet. Tap Note on any screen to add one.</p>}
              </>
            )}
          </div>
        </div>
      )}
      {flash && <div className="rn-flash" role="status">{flash}</div>}
    </div>
  );
}
