import { describe, expect, it } from 'vitest';
import { fitZoom, project } from '../components/MapView';

const pad = { top: 36, right: 32, bottom: 64, left: 32 };
const austriaCroatia = [
  { lat: 48.2082, lng: 16.3738 }, { lat: 47.9186, lng: 13.7997 }, { lat: 42.6507, lng: 18.0944 },
  { lat: 43.5081, lng: 16.4402 }, { lat: 43.1729, lng: 16.4411 },
];

describe('static map', () => {
  it('projects to Web Mercator pixels', () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(project({ lat: 0, lng: 180 }, 1).x).toBe(512);
  });
  it('fits all five demo stops in the 375-px trip tile', () => {
    const z = fitZoom(austriaCroatia, 301, 198, pad, 9);
    expect(z).toBe(4);
    const pts = austriaCroatia.map(p => project(p, z));
    expect(Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x))).toBeLessThanOrEqual(301 - 64);
  });
  it('zooms right in when the stops are close together', () => {
    expect(fitZoom([{ lat: 48.2, lng: 16.37 }, { lat: 48.21, lng: 16.38 }], 301, 198, pad, 9)).toBe(9);
  });
});
