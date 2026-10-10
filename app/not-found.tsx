'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function NotFound() {
  const pathname = usePathname();
  // mounted 门控: SSR 预渲染固定为中文按钮, 客户端按路径前缀切换, 避免水合文本冲突
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isEn = mounted && (pathname?.startsWith('/en') ?? false);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-5 text-center">
      <div className="font-mono text-7xl font-black text-ink-950">
        404
      </div>
      <p className="mt-4 text-sm text-ink-950/55">
        这个「假如」不存在 —— 也许历史里根本没有那一天。
        <span className="block text-ink-950/35">This &quot;what if&quot; doesn&apos;t exist.</span>
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href={isEn ? '/en/' : '/'}
          prefetch={false}
          className="rounded-md bg-ink-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 active:scale-95"
        >
          {isEn ? 'Back home' : '回首页'}
        </Link>
        <Link
          href={isEn ? '/en/replay/?s=msft&y=1996&a=100000' : '/replay/?s=msft&y=1996&a=100000'}
          prefetch={false}
          className="rounded-md border border-ink-950/15 bg-white px-6 py-2.5 text-sm font-semibold text-ink-950/80 transition hover:border-ink-950/35 active:scale-95"
        >
          {isEn ? 'Watch Microsoft 1996' : '直接看微软 1996'}
        </Link>
      </div>
    </main>
  );
}
