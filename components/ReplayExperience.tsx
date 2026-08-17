'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { computeStats, durationFor, type ReplayInput } from '@/lib/engine';
import { moneyZh, pct, profitZh, usdPrice } from '@/lib/format';
import { startIndexForYear, type Series, type StockMeta } from '@/lib/stocks';
import { renderFrame, type SmoothState } from '@/components/replay-render';
import { buildShareImage } from '@/components/ShareCard';
import TickerTape from '@/components/TickerTape';

interface Props {
  series: Series;
  stock: StockMeta;
  year: number;
  amount: number;
  meme?: string; // 副标题梗(可选), 缺省为模式说明
}

const SPEEDS = [1, 2, 4] as const;
const UP = '#FF4C6C';
const DOWN = '#00F5D4';

/** 结算数字滚动(ease-out cubic, 从 0 滚到目标值) */
function CountUp({
  target,
  format,
  duration = 1100,
}: {
  target: number;
  format: (v: number) => string;
  duration?: number;
}) {
  const [text, setText] = useState(() => format(0));
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setText(format(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, format, duration]);
  return <>{text}</>;
}

export default function ReplayExperience({ series, stock, year, amount, meme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const plRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const startTsRef = useRef<number | null>(null);
  const accRef = useRef(0);
  const tRef = useRef(0);
  const smoothRef = useRef<SmoothState>({});
  const finaleTimerRef = useRef(0); // 终点停留计时器
  const maxMultRef = useRef(1); // 里程碑检测: 历史最高倍数
  const underRef = useRef(false); // 里程碑检测: 曾跌破本金

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [done, setDone] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const input = useMemo<ReplayInput>(() => {
    const start = startIndexForYear(series, year);
    return {
      dates: series.dates,
      closes: series.closes,
      start,
      end: series.points - 1,
      amount,
    };
  }, [series, year, amount]);

  const duration = useMemo(() => durationFor(input.end - input.start), [input]);
  const stats = useMemo(() => (done ? computeStats(input) : null), [done, input]);
  // prefers-reduced-motion: 关脉冲/闪光/CSS 动画, 自动播放直跳终点
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const amountLabel = moneyZh(amount);
  const title = `假如你在 ${year}年 买入 ${amountLabel} ${stock.zh}`;

  // ── 每帧: 画 canvas + 直写 DOM 指标(ref 直写绕过 React 重渲染, 保 60fps) ──
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
        ts: performance.now(),
        input,
        smooth: smoothRef.current,
        watermark: 'whatif.axtrivc.com',
        reduced,
      });

      // 右上角战报 + 底部价格直写
      const i0 = input.start;
      const i = Math.min(input.end, i0 + Math.floor(tt * (input.end - i0 + 1)));
      const value = (amount * input.closes[i]) / input.closes[i0];
      const gain = value - amount;
      const upNow = gain >= 0;
      if (pctRef.current) {
        pctRef.current.textContent = pct(gain / amount);
        pctRef.current.style.color = upNow ? UP : DOWN;
        pctRef.current.style.textShadow = `0 0 26px ${upNow ? UP : DOWN}66`;
      }
      if (plRef.current) plRef.current.textContent = profitZh(gain);
      if (plRef.current) plRef.current.style.color = upNow ? UP : DOWN;
      if (dateRef.current) dateRef.current.textContent = `${series.dates[i].slice(0, 4)}-${series.dates[i].slice(4, 6)}`;
      if (priceRef.current) {
        const buy = series.rawCloses?.[i0] ?? null;
        const cur = series.rawCloses?.[i] ?? null;
        priceRef.current.textContent = `买入价 ${usdPrice(buy)} · 当前收盘 ${usdPrice(cur)}`;
      }
      if (scrubRef.current && document.activeElement !== scrubRef.current) {
        scrubRef.current.value = String(tt);
      }
    },
    [input, series, reduced]
  );

  useEffect(() => {
    draw(tRef.current);
  }, [draw]);

  // ── rAF 驱动 ──
  useEffect(() => {
    if (!playing) {
      startTsRef.current = null;
      return;
    }
    // 首尾变速: 开场 4.5% 慢启动, 结尾 7% 减速撞线(acc 始终线性, 滑块与内容不错位)
    const ss = (x: number) => {
      const c = Math.min(Math.max(x, 0), 1);
      return c * c * (3 - 2 * c);
    };
    const paceMod = (p: number) => 0.3 + 0.7 * Math.min(ss(p / 0.045), ss((1 - p) / 0.07));
    const tick = (ts: number) => {
      if (startTsRef.current == null) startTsRef.current = ts;
      const dt = ((ts - startTsRef.current) / 1000) * speed * paceMod(accRef.current / duration);
      startTsRef.current = ts;
      accRef.current = Math.min(duration, accRef.current + dt);
      const nt = accRef.current / duration;
      tRef.current = nt;
      // 里程碑检测(回本 / 首破整数倍) → 渲染层闪光
      const i = Math.min(input.end, input.start + Math.floor(nt * (input.end - input.start + 1)));
      const m = input.closes[i] / input.closes[input.start];
      if (m < 1) {
        underRef.current = true;
      } else if (underRef.current) {
        underRef.current = false;
        smoothRef.current.flashTs = ts;
      }
      if (m > maxMultRef.current) {
        if (m >= 2 && Math.floor(m) > Math.floor(maxMultRef.current)) smoothRef.current.flashTs = ts;
        maxMultRef.current = m;
      }
      draw(nt);
      if (nt >= 1) {
        setPlaying(false);
        // 终点停留 0.9s(定格终值 + 光标脉冲)再弹结算卡
        finaleTimerRef.current = window.setTimeout(() => setDone(true), 900);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      startTsRef.current = null;
    };
  }, [playing, speed, duration, draw, input]);

  // 卸载时清理终点计时器
  useEffect(() => () => window.clearTimeout(finaleTimerRef.current), []);

  const restart = useCallback(() => {
    window.clearTimeout(finaleTimerRef.current);
    accRef.current = 0;
    tRef.current = 0;
    smoothRef.current = {};
    maxMultRef.current = 1;
    underRef.current = false;
    setDone(false);
    setPlaying(true);
  }, []);

  const scrub = useCallback(
    (v: number) => {
      window.clearTimeout(finaleTimerRef.current);
      setPlaying(false);
      accRef.current = v * duration;
      tRef.current = v;
      smoothRef.current = {};
      maxMultRef.current = 1;
      underRef.current = false;
      setDone(v >= 1);
      draw(v);
    },
    [duration, draw]
  );

  // reduced-motion: 首次自动播放改为直接定格终点出结算卡
  useEffect(() => {
    if (reduced) scrub(1);
  }, [reduced, scrub]);

  // ── 快捷键: 空格=播放/暂停(终点重播) ←/→=快退/快进5s R=重播 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (tRef.current >= 1) restart();
        else setPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = (e.key === 'ArrowRight' ? 5 : -5) / duration;
        scrub(Math.min(1, Math.max(0, tRef.current + step)));
      } else if (e.key === 'r' || e.key === 'R') {
        restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, restart, scrub]);

  const shareImage = async () => {
    if (!stats) return;
    setShareBusy(true);
    try {
      const blob = await buildShareImage({ stock, input, stats, rawCloses: series.rawCloses });
      const file = new File([blob], `whatif-${stock.key}-${year}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title } as ShareData);
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
      /* 剪贴板不可用时静默 */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5">
      {/* ════════ 顶部状态栏: 左(返回+本金) / 中(大标题+梗) / 右(战报区) ════════ */}
      <header className="grid grid-cols-[minmax(90px,auto)_1fr_minmax(150px,auto)] items-start gap-3 pb-4">
        <div className="flex flex-col gap-1.5 pt-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-white/50 transition hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            返回
          </Link>
          <span className="font-mono text-xs font-semibold text-white/55">{amountLabel} 本金</span>
        </div>

        <div className="min-w-0 text-center">
          <h1 className="truncate text-xl font-black leading-snug tracking-tight sm:text-3xl">
            假如你在 {year}年 买入 {amountLabel}{' '}
            <span style={{ color: UP, textShadow: `0 0 24px ${UP}59` }}>{stock.zh}</span>
          </h1>
          <p className="mt-1 truncate text-sm font-semibold text-white/55">
            {meme || '一直持有 · 红利复投'}
          </p>
        </div>

        <div className="pt-0.5 text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
            收益率
          </div>
          <div
            ref={pctRef as React.RefObject<HTMLDivElement>}
            className="text-4xl font-black leading-none tracking-tight tabular-nums sm:text-5xl"
            style={{ color: UP, textShadow: `0 0 26px ${UP}66` }}
          >
            +0.00%
          </div>
          <div className="mt-0.5 flex items-baseline justify-end gap-2 font-mono text-xs">
            <span ref={plRef as React.RefObject<HTMLSpanElement>} className="tabular-nums">
              +0万
            </span>
            <span ref={dateRef as React.RefObject<HTMLSpanElement>} className="text-white/40 tabular-nums">
              {series.dates[input.start].slice(0, 4)}-
              {series.dates[input.start].slice(4, 6)}
            </span>
          </div>
        </div>
      </header>

      {/* ════════ 电影感图表舞台(宽幅 + 盈亏双色流光边框) ════════ */}
      <div
        ref={boxRef}
        className="wi-stage-flow relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_80px_-24px_rgba(255,76,108,0.35)] sm:aspect-[2.2/1]"
        style={{
          background:
            'radial-gradient(130% 105% at 50% 0%, #151c33 0%, #0c1122 55%, #070a14 100%)',
        }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          role="img"
          aria-label={`${stock.zh} ${year} 年买入后逐日持有的资产曲线动画`}
        />
        <button
          type="button"
          aria-label={playing ? '暂停' : '播放'}
          className="absolute inset-0 h-full w-full cursor-pointer"
          onClick={() => {
            if (tRef.current >= 1) restart();
            else setPlaying((p) => !p);
          }}
        />

        {/* ════════ 终局结算战报: 背景压暗 + 弹簧卡 ════════ */}
        {stats && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
            <div className="wi-pop w-full max-w-md rounded-3xl border border-white/12 bg-ink-900/95 p-7 text-center shadow-2xl">
              <div className="mx-auto inline-flex rounded-full border border-white/15 px-4 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-white/50">
                最终收益率
              </div>
              <div
                className="mt-4 font-mono text-6xl font-black tabular-nums sm:text-7xl"
                style={{
                  color: stats.returnPct >= 0 ? UP : DOWN,
                  textShadow: `0 0 34px ${stats.returnPct >= 0 ? UP : DOWN}66`,
                }}
              >
                <CountUp target={stats.returnPct} format={pct} />
              </div>
              <p className="mt-3 text-sm text-white/60">
                最终剩余资产{' '}
                <span className="font-bold text-white">
                  <CountUp target={stats.finalValue} format={moneyZh} duration={1300} />
                </span>
                （{stats.profit >= 0 ? '盈利' : '亏损'}{' '}
                <span
                  className="font-bold"
                  style={{ color: stats.profit >= 0 ? UP : DOWN }}
                >
                  {profitZh(stats.profit)}
                </span>
                ）
              </p>
              <p className="mt-1 font-mono text-[11px] text-white/40">
                {stats.years.toFixed(1)} 年 · 年化 {(stats.cagr * 100).toFixed(1)}% · 最大回撤{' '}
                {(stats.maxDrawdown * 100).toFixed(0)}%
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={shareImage}
                  disabled={shareBusy}
                  className="wi-rise flex-1 rounded-xl bg-up py-2.5 text-sm font-bold text-white shadow-[0_6px_20px_-6px_rgba(255,77,79,0.6)] transition active:scale-95 disabled:opacity-50"
                >
                  {shareBusy ? '生成中…' : '生成分享海报'}
                </button>
                <button
                  type="button"
                  onClick={shareLink}
                  className="wi-rise flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/30 active:scale-95"
                  style={{ animationDelay: '80ms' }}
                >
                  {copied ? '已复制 ✓' : '复制战报链接'}
                </button>
                <button
                  type="button"
                  onClick={restart}
                  className="wi-rise flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/30 active:scale-95"
                  style={{ animationDelay: '160ms' }}
                >
                  再测一次
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════════ 行情走马灯 ════════ */}
      <TickerTape />

      {/* ════════ 底部状态信息 ════════ */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-white/35">历史数据模拟，仅供娱乐与复盘</span>
        <span ref={priceRef as React.RefObject<HTMLSpanElement>} className="font-mono text-white/35 tabular-nums">
          {`买入价 ${usdPrice(series.rawCloses?.[input.start] ?? null)} · 当前收盘 ${usdPrice(
            series.rawCloses?.[input.start] ?? null
          )}`}
        </span>
      </div>

      {/* ════════ 播放控制 ════════ */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (tRef.current >= 1 ? restart() : setPlaying((p) => !p))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          aria-label={playing ? '暂停' : '播放'}
        >
          {tRef.current >= 1 || !playing ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.5v11l10-5.5-10-5.5z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          )}
        </button>
        <input
          ref={scrubRef}
          type="range"
          min={0}
          max={1}
          step={0.001}
          defaultValue={0}
          onChange={(e) => scrub(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15"
          aria-label="进度"
        />
        <div className="flex shrink-0 overflow-hidden rounded-full border border-white/15" role="group" aria-label="播放速度">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          aria-label="重播"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" />
            <path d="M13.5 1.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-center text-[10px] text-white/25">
        空格 播放/暂停 · ← → 快退/快进 5 秒 · R 重播
      </p>
    </div>
  );
}
