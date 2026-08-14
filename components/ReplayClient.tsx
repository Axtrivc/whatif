'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReplayExperience from '@/components/ReplayExperience';
import { STOCK_MAP, type Series } from '@/lib/stocks';

export default function ReplayClient() {
  const sp = useSearchParams();
  const key = sp.get('s') ?? 'msft';
  const year = Number(sp.get('y')) || 1996;
  const amount = Math.min(1e9, Math.max(100, Number(sp.get('a')) || 100_000));

  const stock = STOCK_MAP[key];
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stock) {
      setError('未知标的');
      return;
    }
    let alive = true;
    setSeries(null);
    setError(null);
    fetch(`/data/${key}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Series) => {
        if (alive) setSeries(data);
      })
      .catch(() => alive && setError('数据加载失败, 请刷新重试'));
    return () => {
      alive = false;
    };
  }, [key, stock]);

  if (!stock) {
    return (
      <Center>
        <p className="text-white/60">未知标的 {key}</p>
        <BackHome />
      </Center>
    );
  }

  if (error) {
    return (
      <Center>
        <p className="text-white/60">{error}</p>
        <BackHome />
      </Center>
    );
  }

  if (!series) {
    return (
      <Center>
        <div className="animate-pulse font-mono text-sm text-white/40">载入历史数据…</div>
      </Center>
    );
  }

  const firstYear = Number(series.first.slice(0, 4));
  const effYear = Math.max(firstYear, Math.min(new Date().getFullYear() - 1, year));

  return (
    <main className="flex min-h-dvh flex-col px-4 py-5">
      <div className="mx-auto flex w-full max-w-[880px] items-center justify-between pb-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          换一个
        </Link>
        <div className="font-mono text-xs text-white/35">
          {stock.zh} {stock.symbol} · {effYear} · ${amount >= 10000 ? `${amount / 10000}万` : amount}
        </div>
      </div>
      <ReplayExperience series={series} stock={stock} year={effYear} amount={amount} />
      <p className="mx-auto mt-6 max-w-[880px] text-center text-[11px] leading-5 text-white/30">
        后复权口径（分红再投资近似）· 不含税费 · 历史模拟不构成投资建议
      </p>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">{children}</div>
  );
}

function BackHome() {
  return (
    <Link
      href="/"
      className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
    >
      返回首页
    </Link>
  );
}
