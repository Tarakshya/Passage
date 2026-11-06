// MapLibre runs its tile work in a Web Worker loaded from a URL. Next's bundler doesn't emit that
// file, so on install we copy the worker (matching the installed version) into public/.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/maplibre-gl-worker.mjs');
console.log('maplibre worker copied to public/');
