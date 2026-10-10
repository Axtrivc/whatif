import type { Metadata } from 'next';
import { Suspense } from 'react';
import ReplayClient from '@/components/ReplayClient';
import ReplayEarlyData from '@/components/ReplayEarlyData';

export const metadata: Metadata = {
  title: 'Investment Replay',
  description:
    'Pick a stock, a year, and an amount — watch an animated day-by-day replay of what compound interest would have done. Historical simulation, for reference only.',
  robots: { index: false },
  openGraph: {
    title: 'Investment Replay',
    description:
      'Pick a stock, a year, and an amount — watch an animated day-by-day replay of what compound interest would have done. Historical simulation, for reference only.',
    url: '/en/replay/',
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/en/opengraph-image', width: 1200, height: 630, alt: 'Investment Replay' }],
  },
};

export default function ReplayPageEn() {
  return (
    <>
      <ReplayEarlyData />
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center">
            <div className="animate-pulse font-mono text-sm text-ink-950/60">loading…</div>
          </div>
        }
      >
        <ReplayClient locale="en" />
      </Suspense>
    </>
  );
}
