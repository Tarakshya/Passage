'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Opens the last trip used on this phone, or the demo. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    let last = 'demo';
    try { last = localStorage.getItem('passage:last') ?? 'demo'; } catch { /* ignore */ }
    router.replace(`/t/${last}`);
  }, [router]);
  return <main className="app" />;
}
