'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReplayExperience from '@/components/ReplayExperience';
import { STOCK_MAP, startIndexForYear, type Series } from '@/lib/stocks';

export default function ReplayClient() {
  const sp = useSearchParams();
  const key = sp.get('s') ?? 'msft';
  const year = Number(sp.get('y')) || 1996;
  const amount = Math.min(1e9, Math.max(100, Number(sp.get('a')) || 100_000));
  const meme = sp.get('m') || undefined;

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

  if (!stock || error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-white/60">{error || `未知标的 ${key}`}</p>
        <Link
          href="/"
          className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
        >
          返回首页
        </Link>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-white/40">载入历史数据…</div>
      </div>
    );
  }

  const firstYear = Number(series.first.slice(0, 4));
  let effYear = Math.max(firstYear, Math.min(new Date().getFullYear() - 1, year));
  // 数据陈旧时请求年份可能没有任何交易日 → 逐级回退到数据存在的年份
  if (startIndexForYear(series, effYear) < 0) {
    const lastDataYear = Number(series.last.slice(0, 4));
    effYear = startIndexForYear(series, lastDataYear) >= 0 ? lastDataYear : firstYear;
  }

  return (
    <ReplayExperience
      key={`${key}-${effYear}-${amount}`}
      series={series}
      stock={stock}
      year={effYear}
      amount={amount}
      meme={meme}
    />
  );
}
