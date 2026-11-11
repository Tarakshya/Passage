import type { Metadata, Viewport } from 'next';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/hanken-grotesk/800.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/instrument-serif/latin-ext-400.css';
import '@fontsource/instrument-serif/latin-ext-400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Passage',
  description: 'Your trip as a boarding pass: one route, bookings read from screenshots, live leave-by times and a group split.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Passage', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: '#0F1626',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
