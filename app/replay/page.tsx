import type { Metadata } from 'next';
import { Suspense } from 'react';
import ReplayClient from '@/components/ReplayClient';
import ReplayEarlyData from '@/components/ReplayEarlyData';
import { dict } from '@/lib/i18n';

export const metadata: Metadata = {
  title: '回放中',
  robots: { index: false },
};

export default function ReplayPage() {
  return (
    <>
      <ReplayEarlyData />
      <Suspense
        fallback={
          <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
            <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-950/10">
              <div className="wi-loading h-full w-1/3 rounded-full bg-ink-950/30" />
            </div>
            <div className="font-mono text-sm text-ink-950/60">{dict('zh').loadingData}</div>
          </div>
        }
      >
        <ReplayClient locale="zh" />
      </Suspense>
    </>
  );
}
