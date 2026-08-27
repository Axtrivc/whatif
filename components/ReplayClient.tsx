'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReplayExperience from '@/components/ReplayExperience';
import { dict, type Locale } from '@/lib/i18n';
import { STOCK_MAP, startIndexForYear, type Series } from '@/lib/stocks';

export default function ReplayClient({ locale = 'zh' }: { locale?: Locale }) {
  const t = dict(locale);
  const sp = useSearchParams();
  const key = sp.get('s') ?? 'msft';
  const year = Number(sp.get('y')) || 1996;
  const amount = Math.min(1e9, Math.max(100, Number(sp.get('a')) || 100_000));
  // 梗文案参数改为 mtext, 避免与定投模式 m=dca 冲突; 旧 m= 参数仅当非 dca 值时生效
  const memeRaw = sp.get('mtext') ?? sp.get('m');
  const meme = memeRaw && memeRaw !== 'dca' ? memeRaw : undefined;
  // 定投模式: m=dca 时启用, monthly 为每月追加额(默认本金的 1/10)
  const dca = sp.get('m') === 'dca' || sp.get('mode') === 'dca';
  const monthly = dca
    ? Math.min(1e8, Math.max(10, Number(sp.get('monthly')) || Math.round(amount / 10)))
    : undefined;
  // 对比模式(仅定投页有效): 同屏叠加同参数的一次性买入曲线
  const compare = dca && sp.get('compare') === '1';

  const stock = STOCK_MAP[key];
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stock) {
      setError('unknown');
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
      .catch(() => alive && setError('load'));
    return () => {
      alive = false;
    };
  }, [key, stock]);

  const homeHref = locale === 'en' ? '/en/' : '/';
  if (!stock || error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-ink-950/60">{error === 'load' ? t.loadFailed : t.unknownStock}</p>
        <Link
          href={homeHref}
          className="rounded-full border border-ink-950/15 px-5 py-2 text-sm text-ink-950/70 transition hover:border-ink-950/40 hover:text-ink-950"
        >
          {t.backHome}
        </Link>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="animate-pulse font-mono text-sm text-ink-950/40">{t.loadingData}</div>
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
      key={`${key}-${effYear}-${amount}-${monthly ?? 0}-${compare ? 'c' : ''}`}
      series={series}
      stock={stock}
      year={effYear}
      amount={amount}
      meme={meme}
      monthly={monthly}
      compare={compare}
      locale={locale}
      homeHref={homeHref}
    />
  );
}
