'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeStats, durationFor, type ReplayInput } from '@/lib/engine';
import { money, multiple, pct } from '@/lib/format';
import { startIndexForYear, type Series, type StockMeta } from '@/lib/stocks';
import { renderFrame } from '@/components/replay-render';
import { buildShareImage } from '@/components/ShareCard';

interface Props {
  series: Series;
  stock: StockMeta;
  year: number;
  amount: number;
  locale?: 'zh' | 'en';
}

const SPEEDS = [1, 2, 4] as const;

export default function ReplayExperience({ series, stock, year, amount, locale = 'zh' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const startTsRef = useRef<number | null>(null);
  const accRef = useRef(0); // 已播放的秒数(不含暂停)

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [t, setT] = useState(0);
  const [done, setDone] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const input = useMemo<ReplayInput>(() => {
    const start = startIndexForYear(series, year);
    return { dates: series.dates, closes: series.closes, start, end: series.points - 1, amount };
  }, [series, year, amount]);

  const duration = useMemo(() => durationFor(input.end - input.start), [input]);
  const stats = useMemo(
    () => (done ? computeStats(input) : null),
    [done, input]
  );

  // 画布尺寸自适应 + 首帧
  const draw = useCallback(
    (tt: number) => {
      const cv = canvasRef.current;
      const box = boxRef.current;
      if (!cv || !box) return;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      renderFrame(ctx, {
        w,
        h,
        dpr,
        t: tt,
        input,
        asset: { zh: stock.zh, en: stock.en, symbol: stock.symbol },
        locale,
        site: 'whatif.axtrivc.com',
      });
    },
    [input, stock, locale]
  );

  useEffect(() => {
    draw(t);
  }, [t, draw]);

  // rAF 驱动
  useEffect(() => {
    if (!playing) {
      startTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (startTsRef.current == null) startTsRef.current = ts;
      const dt = ((ts - startTsRef.current) / 1000) * speed;
      startTsRef.current = ts;
      accRef.current = Math.min(duration, accRef.current + dt);
      const nt = accRef.current / duration;
      setT(nt);
      if (nt >= 1) {
        setPlaying(false);
        setDone(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      startTsRef.current = null;
    };
  }, [playing, speed, duration]);

  const restart = () => {
    accRef.current = 0;
    setDone(false);
    setT(0);
    setPlaying(true);
  };

  const scrub = (v: number) => {
    accRef.current = v * duration;
    setDone(v >= 1);
    setT(v);
  };

  const shareImage = async () => {
    setShareBusy(true);
    try {
      const st = computeStats(input);
      const blob = await buildShareImage({ stock, input, stats: st, locale });
      const file = new File([blob], `whatif-${stock.key}-${year}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `假如${year}年买入${stock.zh}`,
        } as ShareData);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setShareBusy(false);
    }
  };

  const shareLink = async () => {
    const url = `${location.origin}/replay/?s=${stock.key}&y=${year}&a=${amount}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      location.href = url; // 兜底无意义, 但保持类型完整
    }
  };

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div
        ref={boxRef}
        className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-[0_0_80px_-20px_rgba(255,59,48,0.35)] sm:aspect-[16/9]"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* 播放/暂停点击层 */}
        <button
          type="button"
          aria-label={playing ? '暂停' : '播放'}
          className="absolute inset-0 h-full w-full cursor-pointer"
          onClick={() => {
            if (t >= 1) restart();
            else setPlaying((p) => !p);
          }}
        />
      </div>

      {/* 总结卡(回放结束后展示, 不遮挡全局总览画面) */}
      {stats && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-ink-800/90 p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-white/60">
              {year} → {stats.endDate.slice(0, 4)} · {stats.years.toFixed(1)} 年 · 一直持有 · 红利复投
            </span>
            <span className="font-mono text-sm text-white/45">
              年化 {(stats.cagr * 100).toFixed(1)}% · 最大回撤 {(stats.maxDrawdown * 100).toFixed(0)}%
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="font-mono text-4xl font-extrabold tracking-tight text-white">
              {money(stats.finalValue, locale)}
            </span>
            <span className={`font-mono text-xl font-bold ${stats.returnPct >= 0 ? 'text-up' : 'text-down'}`}>
              {pct(stats.returnPct)}
            </span>
            <span className="font-mono text-lg text-white/70">{multiple(stats.multiple)}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={shareImage}
              disabled={shareBusy}
              className="flex-1 rounded-xl bg-up py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
            >
              {shareBusy ? '生成中…' : '生成分享图'}
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white/80 transition active:scale-95"
            >
              {copied ? '已复制 ✓' : '复制链接'}
            </button>
            <button
              type="button"
              onClick={restart}
              className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white/80 transition active:scale-95"
            >
              再看一遍 ↻
            </button>
          </div>
        </div>
      )}

      {/* 控制条 */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (t >= 1 ? restart() : setPlaying((p) => !p))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          aria-label={playing ? '暂停' : '播放'}
        >
          {t >= 1 ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.5v11l10-5.5-10-5.5z" />
            </svg>
          ) : playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.5v11l10-5.5-10-5.5z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            scrub(Number(e.target.value));
          }}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-[#ff3b30]"
          aria-label="进度"
        />
        <div className="flex shrink-0 overflow-hidden rounded-full border border-white/15">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 text-xs font-semibold transition ${
                speed === s ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={restart}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          aria-label="重播"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" />
            <path d="M13.5 1.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
