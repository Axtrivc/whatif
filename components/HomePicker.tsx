'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dict, MARKET_LABEL_I18N, TAGLINE_EN, type Dict, type Locale, lp } from '@/lib/i18n';
import type { Market, StockMeta } from '@/lib/stocks';
import { ccyPrefix } from '@/lib/tokens';

interface Props {
  stocks: StockMeta[];
  ranges: Record<string, { first: number; last: number; years?: number[] }>;
  locale: Locale;
}

const AMOUNT_PRESETS = [10_000, 100_000, 1_000_000];
const MONTHLY_PRESETS = [100, 500, 1_000, 5_000];
const PREF_KEY = 'whatif:prefs';

/** 选择器市场分组渲染顺序: 美股优先, 指数/港股/A股/商品/加密货币殿后(与 STOCKS 声明序无关) */
const MARKET_ORDER: Market[] = ['nasdaq', 'nyse', 'index', 'hk', 'ashare', 'gold', 'crypto'];

/** 金额解析: 支持 10万 / 1.5亿 / 10w / 50k / 2m / 1b 与裸数字(容忍千分位逗号), 非法输入返回 NaN */
function parseAmount(raw: string): number {
  const m = raw
    .trim()
    .toLowerCase()
    .replace(/[,，\s]/g, '')
    .match(/^(\d+(?:\.\d+)?)(万|亿|w|k|m|b)?$/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  const mult = ({ 万: 1e4, 亿: 1e8, w: 1e4, k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[m[2] ?? ''] ?? 1;
  return Math.round(n * mult);
}

export default function HomePicker({ stocks, ranges, locale }: Props) {
  const t: Dict = dict(locale);
  const router = useRouter();
  // 无效输入错误提示的关联 id(useId 保证 SSR 水合稳定且全局唯一)
  const uid = useId();
  const amountHintId = `${uid}-amount-hint`;
  const amountErrId = `${uid}-amount-error`;
  const monthlyErrId = `${uid}-monthly-error`;
  const amountInputRef = useRef<HTMLInputElement>(null);
  const monthlyInputRef = useRef<HTMLInputElement>(null);
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
  // 市场分组: 40+ 标的按 MARKET_ORDER 分段渲染, 每组独立标题 + 独立网格
  const groups = useMemo(
    () =>
      MARKET_ORDER.map((market) => ({
        market,
        items: available.filter((s) => s.market === market),
      })).filter((g) => g.items.length > 0),
    [available]
  );
  const [key, setKey] = useState(() => available.find((s) => s.key === 'msft')?.key ?? available[0]?.key);
  const stock = available.find((s) => s.key === key);

  // 可选年份: 优先用构建期传入的真实年份 years(数据空洞年已被剔除, 如 TSM 无 2005/2006);
  // 缺省回退 first..last 连续生成保持兼容。降序排列 → years[0] 仍为最新年(默认态语义不变)
  const years = useMemo(() => {
    if (!stock) return [];
    const { first, last, years: ys } = ranges[stock.key];
    if (ys?.length) return [...ys].sort((a, b) => b - a);
    const list: number[] = [];
    for (let y = last; y >= first; y--) list.push(y);
    return list;
  }, [stock, ranges]);

  /** 把任意输入年份吸附到可选年份列表中最近的一个(空洞年 2005→2004, 2006→2007) */
  const snapYear = (list: number[], v: number) =>
    list.length ? list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)) : v;

  const [year, setYear] = useState<number>(() => years.includes(1996) ? 1996 : years[0]);
  const [dca, setDca] = useState(false);
  const [amount, setAmount] = useState(100_000);
  const [monthly, setMonthly] = useState(1_000);
  const [custom, setCustom] = useState('');
  const [customMonthly, setCustomMonthly] = useState('');
  // 用户已主动选过标的时跳过 localStorage 恢复, 防止挂载竞态覆盖用户选择
  const userPickedRef = useRef(false);

  // 恢复上次配置(挂载后同步, 避开 SSR 水合差); 越界配置按当前范围夹取
  useEffect(() => {
    // 首次进站也预热初始标的(默认 msft): 用户调整年份/金额期间数据已在缓存, 开演秒出
    if (stock) warm(stock.key);
    try {
      if (userPickedRef.current) return;
      const raw = localStorage.getItem(PREF_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as {
        key?: string;
        year?: number;
        dca?: boolean;
        amount?: number;
        monthly?: number;
      };
      if (!p.key || !ranges[p.key]) return;
      setKey(p.key);
      warm(p.key);
      if (typeof p.year === 'number' && Number.isFinite(p.year)) {
        const { first, last, years: ys } = ranges[p.key];
        // 先夹到范围, 再吸附到该标的真实存在的年份 — 存过的空洞年(如 TSM 2005)恢复后直接对齐 2004
        const clamped = Math.round(Math.max(first, Math.min(last, p.year)));
        setYear(ys?.length ? snapYear(ys, clamped) : clamped);
      }
      if (typeof p.dca === 'boolean') setDca(p.dca);
      if (typeof p.amount === 'number' && p.amount >= 100) {
        setAmount(Math.round(p.amount));
        // 非预设值回填输入框 — 否则预设无高亮且输入框空白, 当前本金在界面上不可见
        setCustom(AMOUNT_PRESETS.includes(p.amount) ? '' : t.amountLabel(Math.round(p.amount)));
      }
      if (typeof p.monthly === 'number' && p.monthly >= 10) {
        setMonthly(Math.round(p.monthly));
        setCustomMonthly(MONTHLY_PRESETS.includes(p.monthly) ? '' : t.amountLabel(Math.round(p.monthly)));
      }
    } catch {
      /* 存储坏数据/不可用: 用默认配置 */
    }
    // 挂载一次即可; ranges 来自构建期数据, 引用稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自定义输入解析: 非空但解析失败(NaN)或 ≤0 → 视为无效(聚焦提示), 不再静默兜底成最小值开演
  const parsedCustom = custom ? parseAmount(custom) : null;
  const parsedMonthly = customMonthly ? parseAmount(customMonthly) : null;
  const okCustom = parsedCustom != null && Number.isFinite(parsedCustom) && parsedCustom > 0;
  const okMonthly = parsedMonthly != null && Number.isFinite(parsedMonthly) && parsedMonthly > 0;
  const amountInvalid = custom !== '' && !okCustom;
  const monthlyInvalid = dca && customMonthly !== '' && !okMonthly;
  // 摘要行兜底用预设值(无效输入被拦截在 play, 不会以此开演)
  const effAmount = okCustom ? Math.max(100, parsedCustom) : amount;
  const effMonthly = okMonthly ? Math.max(10, parsedMonthly) : monthly;

  const pick = (k: string) => {
    userPickedRef.current = true;
    setKey(k);
    warm(k);
    const { first, last, years: ys } = ranges[k];
    // 尽量保持已选年份, 超出范围则夹取; 再吸附到真实年份(从 AAPL 2005 切到 TSM 不会停留在空洞年)
    setYear((y) => {
      const clamped = Math.max(first, Math.min(last, y));
      return ys?.length ? snapYear(ys, clamped) : clamped;
    });
  };

  const play = () => {
    if (!stock) return;
    // 无效输入聚焦对应框 — 用户点了没反应是最差的反馈
    if (amountInvalid) {
      amountInputRef.current?.focus();
      return;
    }
    if (monthlyInvalid) {
      monthlyInputRef.current?.focus();
      return;
    }
    warm(stock.key);
    // 记住本次配置, 下次进站直接就位
    try {
      localStorage.setItem(
        PREF_KEY,
        JSON.stringify({
          key: stock.key,
          year,
          dca,
          amount: effAmount,
          monthly: dca ? effMonthly : undefined,
        })
      );
    } catch {
      /* 存储不可用时跳过 */
    }
    const q = dca ? `&m=dca&monthly=${effMonthly}` : '';
    router.push(`${lp(locale, '/replay')}?s=${stock.key}&y=${year}&a=${effAmount}${q}`);
  };

  if (!stock) {
    return (
      <div className="mt-10 rounded-lg border border-ink-950/10 bg-white p-6 text-center text-sm text-ink-950/60">
        {t.dataMissing} <code className="font-mono text-ink-950/80">npm run fetch-data</code>
      </div>
    );
  }

  // 年份滑杆已播放比例(驱动 .wi-range 填充轨)
  const yearP = (year - ranges[key].first) / Math.max(1, ranges[key].last - ranges[key].first);

  return (
    <section className="mt-12 border-y border-ink-950/10 py-8">
      <div className="wi-eyebrow">{t.pickStock}</div>
      {/* 市场分组: 组内 2/3/4/6 列自适应(中英同档) — sm 档 4 列起每 cell ≥118px,
          5 字中文名(如「超威半导体」)在 640-700px 不再截断; 长英文名 truncate + title 兜底 */}
      {groups.map((g) => (
        <div key={g.market} className="mt-5 first:mt-3">
          <div className="wi-eyebrow">{MARKET_LABEL_I18N[locale][g.market]}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
            {g.items.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => pick(s.key)}
                onMouseEnter={() => warm(s.key)}
                onFocus={() => warm(s.key)}
                aria-pressed={s.key === key}
                className={`rounded-md border px-1.5 py-2.5 text-center transition active:scale-95 sm:px-2 ${
                  s.key === key
                    ? 'border-ink-950 bg-ink-950 font-semibold text-white'
                    : 'border-ink-950/15 bg-white text-ink-950/60 hover:border-ink-950/40 hover:text-ink-950'
                }`}
              >
                {/* 英文名最长 18 字符(Berkshire Hathaway), 用 12px + truncate 兜底 */}
                <div
                  className={`truncate leading-none ${locale === 'en' ? 'text-xs' : 'text-sm'}`}
                  title={locale === 'zh' ? s.zh : s.en}
                >
                  {locale === 'zh' ? s.zh : s.en}
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase opacity-60">{s.symbol}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="mt-2 text-[11px] text-gain">
        {locale === 'zh' ? stock.tagline : TAGLINE_EN[stock.key] ?? stock.en}
      </p>
      <div className="wi-eyebrow mt-8">{t.pickYear}</div>
      <div className="mt-3 flex items-center gap-3">
        {/* 滑杆列: 轨道 + 紧贴其下的首末年份刻度(两端对齐, 跨度一眼可读), 刻度与轨道同宽 */}
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={ranges[key].first}
            max={ranges[key].last}
            value={year}
            onChange={(e) => setYear(snapYear(years, Number(e.target.value)))}
            className="wi-range w-full cursor-pointer"
            style={{ '--p': yearP } as React.CSSProperties}
            aria-label={t.yearAria}
            aria-valuetext={locale === 'zh' ? `${year}年` : String(year)}
          />
          <div
            aria-hidden
            className="mt-0.5 flex justify-between font-mono text-[9px] leading-3 tabular-nums text-ink-950/60"
          >
            <span>{ranges[key].first}</span>
            <span>{ranges[key].last}</span>
          </div>
        </div>
        <span className="w-20 shrink-0 rounded-md border border-ink-950/15 bg-white px-3 py-1 text-center font-mono text-lg font-semibold tabular-nums">
          {year}
        </span>
      </div>

      <div className="wi-eyebrow mt-8 flex items-center gap-2">
        {t.pickAmount}
        <span className="rounded border border-ink-950/15 px-1 py-px text-[9px] tracking-widest text-ink-950/60">
          {stock.ccy ?? 'USD'}
        </span>
      </div>
      {/* 模式切换: 一次性买入 ↔ 每月定投 */}
      <div
        className="mt-3 inline-flex overflow-hidden rounded-md border border-ink-950/15 bg-white"
        role="group"
        aria-label={locale === 'zh' ? '投入方式' : 'Investment mode'}
      >
        <button
          type="button"
          onClick={() => setDca(false)}
          aria-pressed={!dca}
          className={`border-r border-ink-950/10 px-4 py-2.5 text-xs font-bold transition sm:py-1.5 ${
            !dca ? 'bg-ink-950 text-white' : 'text-ink-950/60 hover:text-ink-950/80'
          }`}
        >
          {t.pickModeLump}
        </button>
        <button
          type="button"
          onClick={() => setDca(true)}
          aria-pressed={dca}
          className={`px-4 py-2.5 text-xs font-bold transition sm:py-1.5 ${
            dca ? 'bg-dca/20 text-dca' : 'text-ink-950/60 hover:text-ink-950/80'
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
            className={`rounded-md border px-4 py-2 font-mono text-sm transition active:scale-95 ${
              !custom && amount === a
                ? 'border-ink-950 bg-ink-950 font-semibold text-white'
                : 'border-ink-950/15 bg-white text-ink-950/60 hover:border-ink-950/40 hover:text-ink-950'
            }`}
          >
            {t.amountLabel(a)}
          </button>
        ))}
        <input
          ref={amountInputRef}
          inputMode="decimal"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && play()}
          placeholder={t.customAmount}
          aria-label={t.customAmountAria}
          aria-invalid={amountInvalid}
          aria-describedby={amountInvalid ? `${amountHintId} ${amountErrId}` : amountHintId}
          className={`w-40 rounded-md border bg-white py-2 pl-4 pr-3 font-mono text-base text-ink-950 placeholder:text-ink-950/25 focus:outline-none sm:w-36 sm:text-sm ${
            amountInvalid
              ? 'border-gain focus:border-gain'
              : 'border-ink-950/10 focus:border-ink-950/50'
          }`}
        />
      </div>
      {/* 格式与最低额常驻提示(<100 静默抬到 100 的口径在此告知, 行为不变);
          无效输入时追加可见错误提示, 与 input 的 aria-describedby 关联 */}
      <p id={amountHintId} className="mt-1.5 text-[10px] text-ink-950/60">
        {t.amountFormatHint} · {t.amountMinHint}
      </p>
      {amountInvalid && (
        <p id={amountErrId} role="alert" className="mt-1 text-[11px] font-medium text-gain">
          {t.amountInvalidHint}
        </p>
      )}

      {/* 定投模式: 每月追加额 */}
      {dca && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-ink-950/60">
            {t.pickMonthly}{' '}
            <span className="font-mono text-[10px] text-ink-950/60">({stock.ccy ?? 'USD'})</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {MONTHLY_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMonthly(m);
                  setCustomMonthly('');
                }}
                className={`rounded-md border px-3.5 py-2 font-mono text-xs transition active:scale-95 sm:py-1.5 ${
                  !customMonthly && monthly === m
                    ? 'border-dca bg-dca font-semibold text-ink-950'
                    : 'border-ink-950/15 bg-white text-ink-950/60 hover:border-dca/50 hover:text-dca'
                }`}
              >
                {t.amountLabel(m)}
              </button>
            ))}
            <input
              ref={monthlyInputRef}
              inputMode="decimal"
              value={customMonthly}
              onChange={(e) => setCustomMonthly(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && play()}
              placeholder={t.customAmount}
              aria-label={t.pickMonthly}
              aria-invalid={monthlyInvalid}
              aria-describedby={monthlyInvalid ? monthlyErrId : undefined}
              className={`w-40 rounded-md border bg-white py-1.5 pl-3.5 pr-3 font-mono text-base text-ink-950 placeholder:text-ink-950/25 focus:outline-none sm:w-32 sm:text-xs ${
                monthlyInvalid
                  ? 'border-gain focus:border-gain'
                  : 'border-ink-950/10 focus:border-ink-950/50'
              }`}
            />
          </div>
          {monthlyInvalid && (
            <p id={monthlyErrId} role="alert" className="mt-1 text-[11px] font-medium text-gain">
              {t.amountInvalidHint}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={play}
        className="mt-8 w-full rounded-lg bg-ink-950 py-3.5 text-base font-semibold tracking-wide text-white transition hover:bg-ink-800 active:scale-[0.99]"
      >
        {t.startReplay}
      </button>
      <p className="mt-3 text-[12px] text-ink-950/60">
        {t.replaySummary(year, t.amountLabel(effAmount), ccyPrefix(stock.ccy))}
      </p>
    </section>
  );
}
