'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { BookingStatus, ReservationType, Traveler } from '@/lib/types';
import { ICONS } from './icons.generated';

export const TYPE_ICON: Record<ReservationType, string> = {
  hotel: 'hotel', flight: 'flight', train: 'train', ferry: 'directions_boat', bus: 'directions_bus',
  car: 'directions_car', activity: 'local_activity', dinner: 'restaurant',
};
export const TYPE_LABEL: Record<ReservationType, string> = {
  hotel: 'Hotel', flight: 'Flight', train: 'Train', ferry: 'Ferry', bus: 'Bus', car: 'Car',
  activity: 'Activity', dinner: 'Dinner',
};
export const STATUS_LABEL: Record<BookingStatus, string> = { todo: 'To do', pending: 'Pending', booked: 'Booked' };

/** Material Symbols Rounded as inline SVG, sized by font-size like the icon font it replaces. */
export function Icon({ name, fill, className = '', size }: { name: string; fill?: boolean; className?: string; size?: number }) {
  const paths = ICONS[name];
  if (!paths && process.env.NODE_ENV !== 'production') console.warn(`Icon "${name}" missing: run node scripts/build-icons.mjs`);
  const d = paths ? (fill && paths[1] ? paths[1] : paths[0]) : '';
  return (
    <svg className={`ms ${className}`} style={size ? { fontSize: size } : undefined} viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function Avatar({ t, small }: { t: Traveler; small?: boolean }) {
  return (
    <span className={`avatar ${small ? 'sm' : ''}`} style={{ background: t.color }} title={t.name}>
      {t.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Bottom sheet: backdrop tap or Escape closes; focus moves in and returns on close. */
export function Sheet({
  title, onClose, children, footer, tall, dark, hero, label, className = '',
}: {
  title?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode;
  tall?: boolean; dark?: boolean; hero?: ReactNode; label: string; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, read through a ref: parents re-render often (the clock ticks every 30 s)
  // and pass a new function each time. Re-running the effect below on each render used to pull
  // focus back to the sheet, which closed any open date picker or keyboard mid-use.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    ref.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className={`backdrop ${dark ? 'dark' : ''}`} onClick={onClose}>
      <div className="sheet-wrap">
        {hero}
        <div
          ref={ref}
          className={`sheet ${tall ? 'tall' : ''} ${className}`}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onClick={e => e.stopPropagation()}
        >
          <div className="grab" />
          {title !== undefined && (
            <div className="sheet-head">
              {typeof title === 'string' ? <h2>{title}</h2> : title}
              <button className="close-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
            </div>
          )}
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
