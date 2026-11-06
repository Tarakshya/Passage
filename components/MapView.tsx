'use client';

// A fast, static map: a handful of 256-px OpenStreetMap image tiles placed by hand, with the
// route and pins drawn on top as SVG. No map engine, no worker, no API key — a few small PNGs
// that the service worker caches, so the tile appears almost instantly and works offline.
//
// Tile use follows the OSM tile policy: visible attribution, a normal Referer (see the
// Referrer-Policy header in next.config.ts), and caching.

import { useEffect, useMemo, useRef, useState } from 'react';

export interface Pin { lat: number; lng: number }

const TILE = 256;
const tileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** Web-Mercator world pixel coordinates at zoom z. */
export function project(p: Pin, z: number): { x: number; y: number } {
  const scale = TILE * 2 ** z;
  const lat = Math.max(-85.05, Math.min(85.05, p.lat)) * (Math.PI / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * scale,
  };
}

interface Pad { top: number; right: number; bottom: number; left: number }

/** Highest zoom (≤ maxZoom) at which every pin fits inside the padded box. */
export function fitZoom(pins: Pin[], w: number, h: number, pad: Pad, maxZoom: number): number {
  for (let z = maxZoom; z >= 1; z--) {
    const pts = pins.map(p => project(p, z));
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= w - pad.left - pad.right && Math.max(...ys) - Math.min(...ys) <= h - pad.top - pad.bottom) return z;
  }
  return 1;
}

export function MapView({ pins, route = true, zoom, maxZoom = 9, pad = { top: 36, right: 32, bottom: 64, left: 32 } }: {
  pins: Pin[]; route?: boolean; zoom?: number; maxZoom?: number; pad?: Pad;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    if (!el.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width && height) setSize(s => (s && Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!size || !pins.length) return null;
    const z = zoom ?? (pins.length > 1 ? fitZoom(pins, size.w, size.h, pad, maxZoom) : maxZoom);
    const pts = pins.map(p => project(p, z));
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
    // Centre the pins inside the padded area, not the whole box.
    const cx = (minX + maxX) / 2 - (pad.left - pad.right) / 2;
    const cy = (minY + maxY) / 2 - (pad.top - pad.bottom) / 2;
    const ox = cx - size.w / 2;
    const oy = cy - size.h / 2;
    const n = 2 ** z;
    const tiles: { key: string; src: string; left: number; top: number }[] = [];
    for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + size.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + size.w) / TILE); tx++) {
        const wrapped = ((tx % n) + n) % n;
        tiles.push({ key: `${z}/${tx}/${ty}`, src: tileUrl(z, wrapped, ty), left: tx * TILE - ox, top: ty * TILE - oy });
      }
    }
    return { tiles, points: pts.map(p => ({ x: p.x - ox, y: p.y - oy })) };
    // pad is a fresh object each render; its values are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, JSON.stringify(pins), zoom, maxZoom, pad.top, pad.right, pad.bottom, pad.left]);

  useEffect(() => setLoaded(0), [layout?.tiles.length, layout?.tiles[0]?.key]);
  // Show once most tiles are in, so there is never a half-drawn checkerboard.
  const ready = Boolean(layout && loaded >= Math.ceil(layout.tiles.length * 0.75));

  return (
    <>
      <div ref={el} className="map" aria-hidden="true" style={{ opacity: ready ? 1 : 0, transition: 'opacity .35s' }}>
        {layout?.tiles.map(t => (
          <img key={t.key} src={t.src} alt="" width={TILE} height={TILE} decoding="async" draggable={false}
            onLoad={() => setLoaded(c => c + 1)} style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }} />
        ))}
      </div>
      <div className="tint" style={{ opacity: ready ? undefined : 0 }} aria-hidden="true" />
      {layout && ready && (
        <svg className="map-overlay" width={size!.w} height={size!.h} aria-hidden="true">
          {route && layout.points.length > 1 && (
            <polyline points={layout.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
          )}
          {layout.points.map((p, i) => (
            <g key={i}><circle cx={p.x} cy={p.y} r="11" fill="#fff" opacity=".28" /><circle cx={p.x} cy={p.y} r="5.5" fill="#fff" /></g>
          ))}
        </svg>
      )}
      {ready && (
        <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          © OpenStreetMap
        </a>
      )}
    </>
  );
}
