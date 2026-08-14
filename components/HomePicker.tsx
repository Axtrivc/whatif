'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StockMeta } from '@/lib/stocks';

interface Props {
  stocks: StockMeta[];
  ranges: Record<string, { first: number; last: number }>;
}

const AMOUNT_PRESETS = [10_000, 100_000, 1_000_000];

export default function HomePicker({ stocks, ranges }: Props) {
  const router = useRouter();
  const available = useMemo(
    () => stocks.filter((s) => ranges[s.key]),
    [stocks, ranges]
  );
  const [key, setKey] = useState(() => available.find((s) => s.key === 'msft')?.key ?? available[0]?.key);
  const stock = available.find((s) => s.key === key);

  const years = useMemo(() => {
    if (!stock) return [];
    const { first, last } = ranges[stock.key];
    const list: number[] = [];
    for (let y = last; y >= first; y--) list.push(y);
    return list;
  }, [stock, ranges]);

  const [year, setYear] = useState<number>(() => years.includes(1996) ? 1996 : years[0]);
  const [amount, setAmount] = useState(100_000);
  const [custom, setCustom] = useState('');

  const effAmount = custom ? Math.max(100, Number(custom.replace(/[^\d.]/g, '')) || 0) : amount;

  const pick = (k: string) => {
    setKey(k);
    const { first, last } = ranges[k];
    // 尽量保持已选年份, 超出范围则夹取
    setYear((y) => Math.max(first, Math.min(last, y)));
  };

  const play = () => {
    if (!stock || !effAmount) return;
    router.push(`/replay/?s=${stock.key}&y=${year}&a=${effAmount}`);
  };

  if (!stock) {
    return (
      <div className="mt-10 rounded-2xl border border-white/10 bg-ink-800 p-6 text-center text-sm text-white/50">
        数据文件缺失，请先运行 <code className="font-mono text-up">npm run fetch-data</code>
      </div>
    );
  }

  return (
    <section className="mt-10 rounded-3xl border border-white/8 bg-ink-800/70 p-5 backdrop-blur">
      <div className="text-xs font-bold uppercase tracking-widest text-white/35">① 选标的</div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {available.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => pick(s.key)}
            className={`rounded-xl px-2 py-2.5 text-center transition active:scale-95 ${
              s.key === key
                ? 'bg-up font-bold text-white shadow-[0_0_24px_-6px_rgba(255,59,48,0.7)]'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <div className="text-sm leading-none">{s.zh}</div>
            <div className="mt-1 font-mono text-[9px] uppercase opacity-60">{s.symbol}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/35">{stock.tagline}</p>

      <div className="mt-6 text-xs font-bold uppercase tracking-widest text-white/35">② 选年份</div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={ranges[key].first}
          max={ranges[key].last}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15"
          aria-label="年份"
        />
        <span className="w-20 shrink-0 rounded-lg bg-white/8 py-1 text-center font-mono text-lg font-bold">
          {year}
        </span>
      </div>

      <div className="mt-6 text-xs font-bold uppercase tracking-widest text-white/35">③ 本金 (USD)</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {AMOUNT_PRESETS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAmount(a);
              setCustom('');
            }}
            className={`rounded-full px-4 py-2 font-mono text-sm font-bold transition active:scale-95 ${
              !custom && amount === a
                ? 'bg-up text-white'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {a >= 10000 ? `$${a / 10000}万` : `$${a / 1000}K`}
          </button>
        ))}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-white/40">
            $
          </span>
          <input
            inputMode="decimal"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="自定义"
            className="w-28 rounded-full border border-white/10 bg-transparent py-2 pl-6 pr-3 font-mono text-sm text-white placeholder:text-white/25 focus:border-up/60 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={play}
        className="mt-7 w-full rounded-2xl bg-gradient-to-r from-[#ff3b30] to-[#ff6a3d] py-4 text-lg font-black tracking-wide text-white transition hover:brightness-110 active:scale-[0.98]"
      >
        开始穿越 ▶
      </button>
      <p className="mt-3 text-center text-[11px] text-white/30">
        {year} 年投入 {effAmount >= 10000 ? `$${(effAmount / 10000).toFixed(0)}万` : `$${effAmount}`} · 一直持有到今天
      </p>
    </section>
  );
}
