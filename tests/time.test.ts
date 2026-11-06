import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fmtRange, instantToZoned, zonedToInstant } from '../lib/time';

describe('time zones', () => {
  it('converts Vienna wall time to UTC in winter and summer', () => {
    expect(zonedToInstant('2026-01-15T09:57', 'Europe/Vienna').toISOString()).toBe('2026-01-15T08:57:00.000Z');
    expect(zonedToInstant('2026-07-22T09:57', 'Europe/Vienna').toISOString()).toBe('2026-07-22T07:57:00.000Z');
  });
  it('handles India (+05:30) and round-trips', () => {
    const i = zonedToInstant('2026-11-04T03:40', 'Asia/Kolkata');
    expect(i.toISOString()).toBe('2026-11-03T22:10:00.000Z');
    expect(instantToZoned(i, 'Asia/Kolkata')).toBe('2026-11-04T03:40');
  });
  it('survives the DST change night', () => {
    // 2026-10-25 03:00 Vienna clocks go back to 02:00.
    expect(zonedToInstant('2026-10-25T12:00', 'Europe/Vienna').toISOString()).toBe('2026-10-25T11:00:00.000Z');
    expect(zonedToInstant('2026-03-29T12:00', 'Europe/Vienna').toISOString()).toBe('2026-03-29T10:00:00.000Z');
  });
  it('does date arithmetic across months', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
    expect(daysBetween('2026-07-22', '2026-08-04')).toBe(13);
    expect(fmtRange('2026-07-22', '2026-07-24')).toBe('JUL 22 – 24');
    expect(fmtRange('2026-07-30', '2026-08-02')).toBe('JUL 30 – AUG 2');
  });
});
