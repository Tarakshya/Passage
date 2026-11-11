// Prints the demo trip as JSON with a 32-char token, for supabase/smoke-test.sql.
import { buildDemoTrip } from '../lib/demo';
process.stdout.write(JSON.stringify({ ...buildDemoTrip(new Date('2026-11-06T08:00:00Z')), token: 'a'.repeat(32), isDemo: false }));
