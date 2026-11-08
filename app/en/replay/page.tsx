import type { Metadata } from 'next';
import { Suspense } from 'react';
import ReplayClient from '@/components/ReplayClient';
import ReplayEarlyData from '@/components/ReplayEarlyData';
import { dict } from '@/lib/i18n';

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
    siteName: 'WhatIf', // 页面级 openGraph 整体替换根 layout 的, 显式带回 og:site_name
    images: [{ url: '/en/opengraph-image', width: 1200, height: 630, alt: 'Investment Replay' }],
  },
};

export default function ReplayPageEn() {
  return (
    <>
      <ReplayEarlyData />
      <Suspense
        fallback={
          <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
            <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-950/10">
              <div className="wi-loading h-full w-1/3 rounded-full bg-ink-950/30" />
            </div>
            <div className="font-mono text-sm text-ink-950/60">{dict('en').loadingData}</div>
          </div>
        }
      >
        <ReplayClient locale="en" />
      </Suspense>
    </>
  );
}
