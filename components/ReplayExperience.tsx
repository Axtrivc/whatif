'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { computeStats, dcaInvested, dcaSeries, durationFor, investedSeries, type ReplayInput } from '@/lib/engine';
import { dateYM, fmtPrice, money, pct, profit } from '@/lib/format';
import { dict, type Locale } from '@/lib/i18n';
import { startIndexForYear, type Series, type StockMeta } from '@/lib/stocks';
import { renderFrame, type SmoothState } from '@/components/replay-render';
import { GAIN, LOSS } from '@/lib/tokens';
import { buildShareImage } from '@/components/ShareCard';
import { exportReplayVideo, videoExportSupported } from '@/lib/video-export';
import TickerTape from '@/components/TickerTape';

interface Props {
  series: Series;
  stock: StockMeta;
  year: number;
  amount: number;
  meme?: string; // 副标题梗(可选), 缺省为模式说明
  monthly?: number; // 每月定投额(缺省=一次性买入)
  compare?: boolean; // 定投页叠加一次性买入对比曲线
  locale?: Locale;
  homeHref?: string;
}

const SPEEDS = [1, 2, 4] as const;
// 盈亏双色与 canvas/海报同源(设计令牌, 白底可读)
const UP = GAIN;
const DOWN = LOSS;

/** 结算数字滚动(ease-out cubic, 从 0 滚到目标值); reduced-motion 时直接显示终值。
 *  format 经 ref 取最新 — 结算卡可见期间的任何父级重渲染都不应让数字闪回 0 重滚 */
function CountUp({
  target,
  format,
  duration = 1100,
  reduced = false,
}: {
  target: number;
  format: (v: number) => string;
  duration?: number;
  reduced?: boolean;
}) {
  const [text, setText] = useState(() => format(reduced ? target : 0));
  const fmtRef = useRef(format);
  fmtRef.current = format;
  useEffect(() => {
    if (reduced) {
      setText(fmtRef.current(target));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setText(fmtRef.current(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return <>{text}</>;
}

export default function ReplayExperience({
  series,
  stock,
  year,
  amount,
  meme,
  monthly,
  compare = false,
  locale = 'zh',
  homeHref = '/',
}: Props) {
  const t = dict(locale);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
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
  const [posterMsg, setPosterMsg] = useState<'ok' | 'fail' | null>(null); // 海报生成结果反馈
  const wasPlayingRef = useRef(false); // 拖动进度条前是否在播(松手自动恢复)
  const titleRef = useRef(0); // 标签页标题上次更新时刻(500ms 节流)
  const [videoPct, setVideoPct] = useState<number | null>(null); // null=空闲, 0-100=导出中
  const videoSupported = useMemo(() => videoExportSupported(), []);
  const videoAbortRef = useRef<AbortController | null>(null); // 卸载时中止编码

  const input = useMemo<ReplayInput>(() => {
    const start = startIndexForYear(series, year);
    return {
      dates: series.dates,
      closes: series.closes,
      start,
      end: series.points - 1,
      amount,
      monthly,
    };
  }, [series, year, amount, monthly]);

  const duration = useMemo(() => durationFor(input.end - input.start), [input]);
  const stats = useMemo(() => (done ? computeStats(input) : null), [done, input]);
  // 对比曲线: 同参数一次性买入(总投入=定投累计投入), useMemo 稳定引用供 WeakMap 缓存
  const compareSeries = useMemo(() => {
    if (!compare || !monthly) return undefined;
    const invested = dcaInvested(input);
    return dcaSeries({ ...input, amount: invested, monthly: undefined });
  }, [compare, monthly, input]);
  // 对比口径的一次性买入终值(结算卡展示)
  const lumpFinal = useMemo(() => {
    if (!compare || !monthly) return null;
    const invested = dcaInvested(input);
    const lumpInput = { ...input, amount: invested, monthly: undefined };
    return computeStats(lumpInput).finalValue;
  }, [compare, monthly, input]);
  // prefers-reduced-motion: 关脉冲/闪光/CSS 动画, 自动播放直跳终点
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const amountLabel = money(amount, locale, stock.ccy);
  const monthlyLabel = monthly ? money(monthly, locale, stock.ccy) : '';
  const stockName = locale === 'zh' ? stock.zh : stock.en;
  const title = monthly
    ? t.titleBuyDca(year, amountLabel, monthlyLabel, stockName)
    : t.titleBuyIn(year, amountLabel, stockName);

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
        locale,
        ccy: stock.ccy,
        compareSeries,
      });

      // 右上角战报 + 底部价格直写
      const i0 = input.start;
      const i = Math.min(input.end, i0 + Math.floor(tt * (input.end - i0 + 1)));
      // DCA 模式: 资产与累计投入都查引擎缓存序列; lump-sum 用比值法
      let value: number;
      let putIn: number;
      if (input.monthly) {
        const j = i - i0;
        value = dcaSeries(input)[j];
        putIn = investedSeries(input)[j];
      } else {
        value = (amount * input.closes[i]) / input.closes[i0];
        putIn = amount;
      }
      const gain = value - putIn;
      const upNow = gain >= 0;
      if (pctRef.current) {
        pctRef.current.textContent = pct(gain / putIn);
        pctRef.current.style.color = upNow ? UP : DOWN;
        // 标签页标题同步实时收益率(切去别的标签页也能瞟到, 500ms 节流;
        // 终点帧 tt>=1 强制放行, 避免抽查/快进后标题停在半路旧值)
        const nowMs = performance.now();
        if (tt >= 1 || nowMs - titleRef.current > 500) {
          titleRef.current = nowMs;
          document.title = `${pct(gain / putIn)} ${stockName} · WhatIf`;
        }
      }
      if (plRef.current) {
        plRef.current.textContent = input.monthly
          ? `${profit(gain, locale, stock.ccy)} / ${money(putIn, locale, stock.ccy)}`
          : profit(gain, locale, stock.ccy);
      }
      if (plRef.current) plRef.current.style.color = upNow ? UP : DOWN;
      if (dateRef.current) dateRef.current.textContent = dateYM(series.dates[i]);
      if (priceRef.current) {
        const buy = series.rawCloses?.[i0] ?? null;
        const cur = series.rawCloses?.[i] ?? null;
        priceRef.current.textContent = t.buyPriceNowPrice(
          fmtPrice(buy, stock.ccy),
          fmtPrice(cur, stock.ccy)
        );
      }
      if (scrubRef.current) {
        if (document.activeElement !== scrubRef.current) {
          scrubRef.current.value = String(tt);
          // --p 驱动滑杆已播放段填充(时间轴游标语言), 与拖动手感一致
          scrubRef.current.style.setProperty('--p', tt.toFixed(4));
        }
        // 读屏用户实时获知当前回放日期
        scrubRef.current.setAttribute('aria-valuetext', dateYM(series.dates[i]));
      }
    },
    [input, series, reduced, locale, t, compareSeries]
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
      // 切后台回来首帧 delta 会是整段隐藏时长, 限幅防内容时间一次性跳变
      const rawMs = Math.min(ts - startTsRef.current, 100);
      startTsRef.current = ts;
      const dt = (rawMs / 1000) * speed * paceMod(accRef.current / duration);
      accRef.current = Math.min(duration, accRef.current + dt);
      const nt = accRef.current / duration;
      tRef.current = nt;
      // 离屏帧丢弃: 后台标签 rAF 降频时, 只推进内容时间, 跳过重绘与 DOM 直写;
      // 里程碑检测同步跳过(无渲染则闪光无意义), 回到前台后由下一帧恢复
      if (document.hidden) {
        if (nt >= 1) {
          setPlaying(false);
          finaleTimerRef.current = window.setTimeout(() => setDone(true), 0);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // 里程碑检测(回本 / 首破整数倍) → 渲染层闪光; DCA 相对累计投入
      const i = Math.min(input.end, input.start + Math.floor(nt * (input.end - input.start + 1)));
      let m: number;
      if (input.monthly) {
        const j = i - input.start;
        m = dcaSeries(input)[j] / investedSeries(input)[j];
      } else {
        m = input.closes[i] / input.closes[input.start];
      }
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

  // 标签页标题: 进入时记下原标题, 离开回放(含切结算重播)时恢复
  useEffect(() => {
    const prev = document.title;
    return () => {
      document.title = prev;
    };
  }, []);

  // 视频导出进行中: 关闭/刷新页面前提醒, 防误触丢掉几分钟的编码
  useEffect(() => {
    if (videoPct == null) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [videoPct]);

  // 卸载时清理终点计时器 + 中止进行中的视频导出
  useEffect(
    () => () => {
      window.clearTimeout(finaleTimerRef.current);
      videoAbortRef.current?.abort();
    },
    []
  );

  const restart = useCallback(() => {
    window.clearTimeout(finaleTimerRef.current);
    accRef.current = 0;
    tRef.current = 0;
    smoothRef.current = {};
    maxMultRef.current = 1;
    underRef.current = false;
    setDone(false);
    setPosterMsg(null);
    setPlaying(true);
    draw(0); // 立即回到起点帧, 不等下一个 rAF(避免残留终局画面一闪)
  }, [draw]);

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
      setPosterMsg(null);
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
      // 空格/R 长按连发会造成播放状态抖动, 只放行方向键的重复
      if (e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.key === ' ') {
        e.preventDefault();
        if (tRef.current >= 1) restart();
        else setPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = (e.key === 'ArrowRight' ? 5 : -5) / duration;
        scrub(Math.min(1, Math.max(0, tRef.current + step)));
      } else if (['1', '2', '4'].includes(e.key)) {
        // 数字键切倍速(键位=档位值: 1x/2x/4x)
        setSpeed(Number(e.key) as (typeof SPEEDS)[number]);
      } else if (e.key === 'r' || e.key === 'R') {
        restart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, restart, scrub]);

  /** 进度条拖动: 按下先暂停(看清单帧), 松手恢复原播放状态 — 手感与主流播放器一致 */
  const scrubStart = () => {
    wasPlayingRef.current = playing && tRef.current < 1;
    if (tRef.current < 1) setPlaying(false);
  };
  const scrubEnd = () => {
    if (wasPlayingRef.current && tRef.current < 1) {
      wasPlayingRef.current = false;
      setPlaying(true);
    }
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareImage = async () => {
    if (!stats || shareBusy) return;
    setShareBusy(true);
    setPosterMsg(null);
    const fileName = `whatif-${stock.key}-${year}${monthly ? '-dca' : ''}.png`;
    try {
      const blob = await buildShareImage({ stock, input, stats, rawCloses: series.rawCloses, locale });
      const file = new File([blob], fileName, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title } as ShareData);
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') return; // 用户关掉分享面板: 海报已生成, 不算失败
          downloadBlob(blob, fileName); // 分享通道实际不可用(权限/环境) → 降级为下载, 别浪费已生成的海报
        }
      } else {
        downloadBlob(blob, fileName);
      }
      setPosterMsg('ok');
      setTimeout(() => setPosterMsg(null), 2000);
    } catch {
      setPosterMsg('fail'); // 生成环节失败才可见反馈, 按钮本身即重试入口
      setTimeout(() => setPosterMsg(null), 2600);
    } finally {
      setShareBusy(false);
    }
  };

  const shareLink = async () => {
    const base = locale === 'en' ? '/en/replay/' : '/replay/';
    const dcaQ = monthly ? `&m=dca&monthly=${monthly}${compare ? '&compare=1' : ''}` : '';
    const memeQ = meme ? `&mtext=${encodeURIComponent(meme)}` : ''; // 梗文案随链接传播, 分享出去的回放不丢副标题
    const url = `${location.origin}${base}?s=${stock.key}&y=${year}&a=${amount}${dcaQ}${memeQ}`;
    const fallbackCopy = () => {
      // 非安全上下文/剪贴板权限被拒: 退回隐藏 textarea + execCommand 方案
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        return document.execCommand('copy');
      } finally {
        ta.remove();
      }
    };
    let copiedOk = false;
    try {
      await navigator.clipboard.writeText(url);
      copiedOk = true;
    } catch {
      copiedOk = fallbackCopy();
    }
    if (copiedOk) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const exportVideo = async () => {
    if (!stats) return;
    if (videoPct != null) {
      videoAbortRef.current?.abort(); // 导出中再次点击 = 取消编码
      return;
    }
    setVideoPct(0);
    const ctl = new AbortController();
    videoAbortRef.current = ctl;
    try {
      const blob = await exportReplayVideo({
        input,
        locale,
        ccy: stock.ccy,
        compareSeries,
        onProgress: (p) => setVideoPct(Math.round(p * 100)),
        signal: ctl.signal,
      });
      if (ctl.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatif-${stock.key}-${year}${monthly ? '-dca' : ''}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      /* 编码失败/中止静默恢复按钮 */
    } finally {
      videoAbortRef.current = null;
      setVideoPct(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5">
      {/* ════════ 顶部状态栏(HUD 分区): 左(返回+本金) / 中(大标题+梗) / 右(战报区) ════════ */}
      <header className="grid grid-cols-[minmax(56px,auto)_1fr_minmax(88px,auto)] items-start gap-2 border-b border-ink-950/8 pb-4 sm:grid-cols-[minmax(90px,auto)_1fr_minmax(150px,auto)] sm:gap-3">
        <div className="flex flex-col gap-1.5 pt-1">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1 text-xs text-ink-950/50 transition hover:text-ink-950"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.back}
          </Link>
          <span className="font-mono text-xs font-semibold text-ink-950/55">
            {monthly
              ? locale === 'zh'
                ? `${amountLabel} + 每月 ${monthlyLabel}`
                : `${amountLabel} + ${monthlyLabel}/mo`
              : t.principal(amountLabel)}
          </span>
        </div>

        <div className="min-w-0 text-center">
          <h1 className="line-clamp-2 text-xl font-black leading-snug tracking-tight sm:text-3xl">
            {locale === 'zh' ? (
              monthly ? (
                <>
                  假如你在 {year}年 买入 {amountLabel}{' '}
                  <span className="text-ink-950/45" style={{}}>{stock.zh}</span>
                  ，每月再投 {monthlyLabel}
                </>
              ) : (
                <>
                  假如你在 {year}年 买入 {amountLabel}{' '}
                  <span className="text-ink-950/45" style={{}}>{stock.zh}</span>
                </>
              )
            ) : monthly ? (
              <>
                {amountLabel} of{' '}
                <span className="text-ink-950/45" style={{}}>{stock.en}</span> in{' '}
                {year}, plus {monthlyLabel}/mo
              </>
            ) : (
              <>
                If you bought {amountLabel} of{' '}
                <span className="text-ink-950/45" style={{}}>{stock.en}</span> in{' '}
                {year}
              </>
            )}
          </h1>
          <p className="mt-1 truncate text-sm font-semibold text-ink-950/55">
            {meme || (monthly ? t.dcaSubtitle : t.holdForever)}
          </p>
        </div>

        <div className="pt-0.5 text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-950/35">
            {t.returnRate}
          </div>
          <div
            ref={pctRef}
            className="text-[27px] font-black leading-none tracking-tight tabular-nums sm:text-5xl"
            style={{ color: UP }}
          >
            +0.00%
          </div>
          <div className="mt-0.5 flex items-baseline justify-end gap-2 font-mono text-xs">
            <span ref={plRef} className="tabular-nums">
              +0万
            </span>
            <span ref={dateRef} className="text-ink-950/40 tabular-nums">
              {series.dates[input.start].slice(0, 4)}-
              {series.dates[input.start].slice(4, 6)}
            </span>
          </div>
        </div>
      </header>

      {/* ════════ 图表舞台(宽幅画布 + 四角 HUD 角括号) ════════ */}
      <div className="wi-frame relative mt-1">
        <div
          ref={boxRef}
          className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-ink-950/12 bg-[#fbfbfc] sm:aspect-[2.2/1]"
        >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          role="img"
          aria-label={t.canvasAria(stockName, year)}
        />
        <button
          type="button"
          aria-label={playing ? t.pause : t.play}
          className="absolute inset-0 h-full w-full cursor-pointer touch-manipulation"
          onClick={() => {
            if (tRef.current >= 1) restart();
            else setPlaying((p) => !p);
          }}
        />

        {/* ════════ 终局结算战报: 背景压暗 + 弹簧卡 ════════ */}
        {stats && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 p-4 backdrop-blur-sm">
            <div className="wi-pop w-full max-w-md rounded-lg border border-ink-950/12 bg-white/95 p-7 text-center shadow-[0_24px_64px_-24px_rgba(17,17,20,0.35)]" role="status">
              <div className="mx-auto inline-flex rounded-[4px] border border-ink-950/15 bg-ink-950/[0.03] px-4 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-ink-950/50">
                {t.finalReturn}
              </div>
              <div
                className="mt-4 font-mono text-6xl font-black tabular-nums sm:text-7xl"
                style={{ color: stats.returnPct >= 0 ? UP : DOWN }}
              >
                <CountUp target={stats.returnPct} format={pct} reduced={reduced} />
              </div>
              <p className="mt-3 text-sm text-ink-950/60">
                {t.finalAssets}{' '}
                <span className="font-bold text-ink-950">
                  <CountUp target={stats.finalValue} format={(v) => money(v, locale, stock.ccy)} duration={1300} reduced={reduced} />
                </span>
                （{stats.profit >= 0 ? t.profit : t.loss}{' '}
                <span
                  className="font-bold"
                  style={{ color: stats.profit >= 0 ? UP : DOWN }}
                >
                  {profit(stats.profit, locale, stock.ccy)}
                </span>
                ）
              </p>
              {stats.invested != null && (
                <p className="mt-1 text-xs text-ink-950/50">
                  {t.invested} {money(stats.invested, locale, stock.ccy)}
                  {lumpFinal != null && (
                    <>
                      {' · '}
                      {locale === 'zh' ? '同期一次性' : 'Lump sum'}{' '}
                      <span className="font-mono">{money(lumpFinal, locale, stock.ccy)}</span>
                    </>
                  )}
                </p>
              )}
              <p className="mt-1 font-mono text-[11px] text-ink-950/50">
                {t.statsLine(
                  Number(stats.years.toFixed(1)),
                  Number((stats.cagr * 100).toFixed(1)),
                  Number((stats.maxDrawdown * 100).toFixed(0))
                )}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-1.5">
                <button
                  type="button"
                  onClick={shareImage}
                  disabled={shareBusy}
                  aria-label={shareBusy ? t.generating : posterMsg === 'fail' ? t.posterFail : t.genPoster}
                  className={`wi-rise whitespace-nowrap rounded-md px-2 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${
                    posterMsg === 'fail'
                      ? 'border border-gain/50 bg-white text-gain'
                      : posterMsg === 'ok'
                        ? 'border border-dca/50 bg-white text-dca'
                        : 'bg-ink-950 text-white hover:bg-ink-800'
                  }`}
                >
                  {shareBusy ? t.generating : posterMsg === 'ok' ? t.posterDone : posterMsg === 'fail' ? t.posterFail : t.genPoster}
                </button>
                {videoSupported && (
                  <button
                    type="button"
                    onClick={exportVideo}
                    aria-label={videoPct != null ? `${t.exporting(videoPct)} · ${t.cancelExport}` : t.exportVideo}
                    className="wi-rise whitespace-nowrap rounded-md border border-ink-950/15 bg-white px-2 py-2.5 text-sm font-semibold text-ink-950/80 transition hover:border-ink-950/35 active:scale-95"
                    style={{ animationDelay: '60ms' }}
                  >
                    {videoPct != null ? `${videoPct}% · ${t.cancelExport}` : t.exportVideo}
                  </button>
                )}
                <button
                  type="button"
                  onClick={shareLink}
                  className="wi-rise whitespace-nowrap rounded-md border border-ink-950/15 bg-white px-2 py-2.5 text-sm font-semibold text-ink-950/80 transition hover:border-ink-950/35 active:scale-95"
                  style={{ animationDelay: '120ms' }}
                >
                  {copied ? t.copied : t.copyLink}
                </button>
                <button
                  type="button"
                  onClick={restart}
                  className="wi-rise whitespace-nowrap rounded-md border border-ink-950/15 bg-white px-2 py-2.5 text-sm font-semibold text-ink-950/80 transition hover:border-ink-950/35 active:scale-95"
                  style={{ animationDelay: '180ms' }}
                >
                  {t.replayAgain}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ════════ 行情走马灯 ════════ */}
      <TickerTape />

      {/* ════════ 底部状态信息 ════════ */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-950/45">{t.simNote}</span>
        <span ref={priceRef} className="font-mono text-ink-950/45 tabular-nums">
          {t.buyPriceNowPrice(
            fmtPrice(series.rawCloses?.[input.start] ?? null, stock.ccy),
            fmtPrice(series.rawCloses?.[input.start] ?? null, stock.ccy)
          )}
        </span>
      </div>

      {/* ════════ 播放控制(时间轴控制台) ════════ */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (tRef.current >= 1 ? restart() : setPlaying((p) => !p))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-950/12 bg-white text-ink-950 transition hover:border-ink-950/40 active:scale-95"
          aria-label={playing ? t.pause : t.play}
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
          onPointerDown={scrubStart}
          onPointerUp={scrubEnd}
          onTouchStart={scrubStart}
          onTouchEnd={scrubEnd}
          className="wi-range flex-1 cursor-pointer touch-manipulation"
          aria-label={t.progressAria}
        />
        <div
          className="flex shrink-0 overflow-hidden rounded-md border border-ink-950/15 bg-white"
          role="group"
          aria-label={t.speedGroup}
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={`border-r border-ink-950/10 px-2.5 py-1 font-mono text-xs font-semibold transition last:border-r-0 ${
                speed === s ? 'bg-ink-950 text-white' : 'text-ink-950/50 hover:text-ink-950/80'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={restart}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-950/12 bg-white text-ink-950 transition hover:border-ink-950/40 active:scale-95"
          aria-label={t.replayBtn}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeLinecap="round" />
            <path d="M13.5 1.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-center text-[10px] text-ink-950/35">{t.kbdHint}</p>
    </div>
  );
}
