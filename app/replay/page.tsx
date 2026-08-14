import type { Metadata } from 'next';
import { Suspense } from 'react';
import ReplayClient from '@/components/ReplayClient';

export const metadata: Metadata = {
  title: '回放中',
  robots: { index: false },
};

export default function ReplayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="animate-pulse font-mono text-sm text-white/40">loading…</div>
        </div>
      }
    >
      <ReplayClient />
    </Suspense>
  );
}
