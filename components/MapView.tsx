'use client';

// A quiet, non-interactive map behind the trip tile and stop hero. MapLibre + OpenFreeMap:
// open data, no API key, no account. If it can't load (offline), the designed gradient shows.

import { useEffect, useRef, useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface Pin { lat: number; lng: number }

const STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** The colour tint only appears once the map has loaded, so the designed fallback art shows untouched. */
export function MapView({ pins, route = true, zoom }: { pins: Pin[]; route?: boolean; zoom?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const key = JSON.stringify(pins);

  useEffect(() => {
    if (!el.current || !pins.length || !navigator.onLine) return;
    let map: MLMap | null = null;
    let cancelled = false;
    void import('maplibre-gl').then(ml => {
      if (cancelled || !el.current) return;
      const m = new ml.Map({
        container: el.current, style: STYLE, interactive: false,
        attributionControl: { compact: true },
        center: [pins[0].lng, pins[0].lat], zoom: zoom ?? 5, fadeDuration: 0,
      });
      map = m;
      m.on('error', () => { /* tiles failed: gradient stays visible */ });
      m.on('load', () => {
        if (cancelled) return;
        const coords = pins.map(p => [p.lng, p.lat] as [number, number]);
        if (route && coords.length > 1) {
          m.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
          m.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-opacity': .9, 'line-dasharray': [2, 1.5] } });
        }
        m.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features: coords.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) } });
        m.addLayer({ id: 'halo', type: 'circle', source: 'pins', paint: { 'circle-radius': 11, 'circle-color': '#ffffff', 'circle-opacity': .28 } });
        m.addLayer({ id: 'pin', type: 'circle', source: 'pins', paint: { 'circle-radius': 5.5, 'circle-color': '#ffffff' } });
        if (coords.length > 1 && zoom === undefined) {
          const b = new ml.LngLatBounds(coords[0], coords[0]);
          coords.forEach(c => b.extend(c));
          m.fitBounds(b, { padding: { top: 40, bottom: 110, left: 40, right: 40 }, duration: 0, maxZoom: 9 });
        }
        setReady(true);
      });
    }).catch(() => { /* gradient fallback */ });
    return () => { cancelled = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, route, zoom]);

  return (
    <>
      <div ref={el} className="map" style={{ opacity: ready ? 1 : 0, transition: 'opacity .4s' }} aria-hidden="true" />
      <div className="tint" style={{ opacity: ready ? undefined : 0 }} aria-hidden="true" />
    </>
  );
}
