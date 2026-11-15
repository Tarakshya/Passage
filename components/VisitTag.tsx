'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const KEY = 'passage:from';
const TAG = /^[a-z0-9-]{1,32}$/;

function device(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Other';
}

/**
 * Tagged links: when T sends someone https://…/?from=vivek, the first open (and each later visit,
 * once per browser session) is logged under "vivek" so she can see whether it was opened.
 * The tag is remembered on that phone and removed from the address bar, so a link he forwards
 * isn't counted as him.
 */
export function VisitTag() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get('from')?.toLowerCase().trim() ?? null;
      if (fromUrl && TAG.test(fromUrl)) {
        localStorage.setItem(KEY, fromUrl);
        url.searchParams.delete('from');
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      }
      const tag = localStorage.getItem(KEY);
      if (!tag || !TAG.test(tag) || sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supaUrl || !anon) return;
      const db = createClient(supaUrl, anon, { auth: { persistSession: false } });
      void db.rpc('log_visit', { p_tag: tag, p_path: url.pathname, p_device: device() });
    } catch { /* never get in the way of the app */ }
  }, []);
  return null;
}
