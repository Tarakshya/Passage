'use client';

// A fast, static city map: the few 256-px OpenStreetMap image tiles that cover the box, placed by
// hand. No map engine, no worker, no API key, no markers — a handful of small PNGs that the
// service worker caches, so it appears almost at once and works offline.
//
// Tile use follows the OSM tile policy: visible attribution, a normal Referer (see the
// Referrer-Policy header in next.config.ts), and caching.

import { useEffect, useMemo, useRef, useState } from 'react';

export interface LatLng { lat: number; lng: number }

const TILE = 256;
const tileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** Web-Mercator world pixel coordinates at zoom z. */
export function project(p: LatLng, z: number): { x: number; y: number } {
  const scale = TILE * 2 ** z;
  const lat = Math.max(-85.05, Math.min(85.05, p.lat)) * (Math.PI / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * scale,
  };
}

/**
 * The tiles covering a w×h box around `center`. `focusY` is where the centre sits vertically
 * (0.4 = a little above the middle, clear of text laid over the bottom of the tile).
 */
export function tilesFor(center: LatLng, z: number, w: number, h: number, focusY = 0.5) {
  const c = project(center, z);
  const ox = c.x - w / 2;
  const oy = c.y - h * focusY;
  const n = 2 ** z;
  const out: { key: string; src: string; left: number; top: number }[] = [];
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
      out.push({ key: `${z}/${tx}/${ty}`, src: tileUrl(z, ((tx % n) + n) % n, ty), left: tx * TILE - ox, top: ty * TILE - oy });
    }
  }
  return out;
}

export function MapView({ center, zoom = 12, focusY = 0.5 }: { center: LatLng; zoom?: number; focusY?: number }) {
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

  const tiles = useMemo(
    () => (size ? tilesFor(center, zoom, size.w, size.h, focusY) : []),
    [size, center.lat, center.lng, zoom, focusY], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // A new city starts hidden again, so the old one never shows half-replaced.
  useEffect(() => setLoaded(0), [tiles[0]?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = tiles.length > 0 && loaded >= Math.ceil(tiles.length * 0.75);

  return (
    <>
      <div ref={el} className="map" aria-hidden="true" style={{ opacity: ready ? 1 : 0, transition: 'opacity .35s' }}>
        {tiles.map(t => (
          <img key={t.key} src={t.src} alt="" width={TILE} height={TILE} decoding="async" draggable={false}
            onLoad={() => setLoaded(c => c + 1)} style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }} />
        ))}
      </div>
      <div className="tint" style={{ opacity: ready ? undefined : 0 }} aria-hidden="true" />
      {ready && (
        <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          © OpenStreetMap
        </a>
      )}
    </>
  );
}
