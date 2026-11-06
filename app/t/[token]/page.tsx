import { App } from '@/components/App';

export default async function TripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <App token={token} />;
}
