import type { Metadata } from 'next';
import { Trips } from '@/components/Trips';

export const metadata: Metadata = { title: 'Passage — plan your trip' };

/** A clean start: no sample trip, just "plan your first trip". Share this link with people who want to use the app. */
export default function Start() {
  return <Trips clean />;
}
