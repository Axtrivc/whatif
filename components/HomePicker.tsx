'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dict, TAGLINE_EN, type Dict, type Locale, lp } from '@/lib/i18n';
import type { StockMeta } from '@/lib/stocks';

interface Props {
  stocks: StockMeta[];
  ranges: Record<string, { first: number; last: number }>;
  locale: Locale;
}

const AMOUNT_PRESETS = [10_000, 100_000, 1_000_000];
const MONTHLY_PRESETS = [100, 500, 1_000, 5_000];

export default function HomePicker({ stocks, ranges, locale }: Props) {
  const t: Dict = dict(locale);
  const router = useRouter();
  const warmedRef = useRef(new Set<string>());
  /** 预取标的历史数据(浏览器对并发同 URL 去重): 用户调年份/本金的间隙里
   *  拉完 JSON, 跳转回放页即可秒开, 不必盯着「载入历史数据…」 */
  const warm = (k: string) => {
    if (warmedRef.current.has(k)) return;
    warmedRef.current.add(k);
    fetch(`/data/${k}.json`).catch(() => warmedRef.current.delete(k));
  };
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
  const [dca, setDca] = useState(false);
  const [amount, setAmount] = useState(100_000);
  const [monthly, setMonthly] = useState(1_000);
  const [custom, setCustom] = useState('');
  const [customMonthly, setCustomMonthly] = useState('');

  const effAmount = custom ? Math.max(100, Number(custom.replace(/[^\d.]/g, '')) || 0) : amount;
  const effMonthly = customMonthly
    ? Math.max(10, Number(customMonthly.replace(/[^\d.]/g, '')) || 0)
    : monthly;

  const pick = (k: string) => {
    setKey(k);
    warm(k);
    const { first, last } = ranges[k];
    // 尽量保持已选年份, 超出范围则夹取
    setYear((y) => Math.max(first, Math.min(last, y)));
  };

  const play = () => {
    if (!stock || !effAmount) return;
    if (dca && !effMonthly) return;
    warm(stock.key);
    const q = dca ? `&m=dca&monthly=${effMonthly}` : '';
    router.push(`${lp(locale, '/replay')}?s=${stock.key}&y=${year}&a=${effAmount}${q}`);
  };

  if (!stock) {
    return (
      <div className="mt-10 rounded-2xl border border-ink-950/10 bg-black/[0.05] p-6 text-center text-sm text-ink-950/50">
        {t.dataMissing} <code className="font-mono text-ink-950/80">npm run fetch-data</code>
      </div>
    );
  }

  return (
    <section className="mt-12 border-y border-ink-950/8 py-8">
      <div className="text-[13px] font-medium text-ink-950/35">{t.pickStock}</div>
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {available.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => pick(s.key)}
            className={`rounded-lg border px-2 py-2.5 text-center transition active:scale-95 ${
              s.key === key
                ? 'border-ink-950 bg-ink-950 font-semibold text-white'
                : 'border-ink-950/15 text-ink-950/60 hover:border-ink-950/40 hover:text-ink-950'
            }`}
          >
            <div className="truncate text-sm leading-none" title={locale === 'zh' ? s.zh : s.en}>
              {locale === 'zh' ? s.zh : s.en}
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase opacity-60">{s.symbol}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-gain/70">
        {locale === 'zh' ? stock.tagline : TAGLINE_EN[stock.key] ?? stock.en}
      </p>
      <div className="mt-8 text-[13px] font-medium text-ink-950/35">{t.pickYear}</div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={ranges[key].first}
          max={ranges[key].last}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-950/15"
          aria-label={t.yearAria}
        />
        <span className="w-20 shrink-0 text-center font-mono text-lg font-semibold tabular-nums">
          {year}
        </span>
      </div>

      <div className="mt-8 text-[13px] font-medium text-ink-950/35">{t.pickAmount}</div>
      {/* 模式切换: 一次性买入 ↔ 每月定投 */}
      <div className="mt-3 inline-flex overflow-hidden rounded-full border border-ink-950/15" role="group" aria-label={locale === 'zh' ? '投入方式' : 'Investment mode'}>
        <button
          type="button"
          onClick={() => setDca(false)}
          aria-pressed={!dca}
          className={`px-4 py-1.5 text-xs font-bold transition ${
            !dca ? 'bg-ink-950 text-white' : 'text-ink-950/50 hover:text-ink-950/80'
          }`}
        >
          {t.pickModeLump}
        </button>
        <button
          type="button"
          onClick={() => setDca(true)}
          aria-pressed={dca}
            className={`px-4 py-1.5 text-xs font-bold transition ${
              dca ? 'bg-dca/25 text-dca' : 'text-ink-950/50 hover:text-ink-950/80'
            }`}
        >
          {t.pickModeDca}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {AMOUNT_PRESETS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAmount(a);
              setCustom('');
            }}
            className={`rounded-full border px-4 py-2 font-mono text-sm transition active:scale-95 ${
              !custom && amount === a
                ? 'border-ink-950 bg-ink-950 font-semibold text-white'
                : 'border-ink-950/15 text-ink-950/60 hover:border-ink-950/40 hover:text-ink-950'
            }`}
          >
            {t.amountLabel(a)}
          </button>
        ))}
        <input
          inputMode="decimal"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && play()}
          placeholder={t.customAmount}
          aria-label={t.customAmountAria}
          className="w-28 rounded-full border border-ink-950/10 bg-transparent py-2 pl-4 pr-3 font-mono text-sm text-ink-950 placeholder:text-ink-950/25 focus:border-ink-950/50 focus:outline-none"
        />
      </div>

      {/* 定投模式: 每月追加额 */}
      {dca && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-ink-950/45">{t.pickMonthly}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {MONTHLY_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMonthly(m);
                  setCustomMonthly('');
                }}
                className={`rounded-full border px-3.5 py-1.5 font-mono text-xs transition active:scale-95 ${
                  !customMonthly && monthly === m
                    ? 'border-dca bg-dca font-semibold text-ink-950'
                    : 'border-ink-950/15 text-ink-950/60 hover:border-dca/50 hover:text-dca'
                }`}
              >
                {t.amountLabel(m)}
              </button>
            ))}
            <input
              inputMode="decimal"
              value={customMonthly}
              onChange={(e) => setCustomMonthly(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && play()}
              placeholder={t.customAmount}
              aria-label={t.pickMonthly}
              className="w-24 rounded-full border border-ink-950/10 bg-transparent py-1.5 pl-3.5 pr-3 font-mono text-xs text-ink-950 placeholder:text-ink-950/25 focus:border-ink-950/50 focus:outline-none"
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={play}
        className="mt-8 w-full rounded-xl bg-ink-950 py-3.5 text-base font-semibold text-white transition hover:bg-ink-900 active:scale-[0.99]"
      >
        {t.startReplay}
      </button>
      <p className="mt-3 text-[12px] text-ink-950/35">
        {t.replaySummary(year, t.amountLabel(effAmount))}
      </p>
    </section>
  );
}
