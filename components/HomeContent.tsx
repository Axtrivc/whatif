import Link from 'next/link';
import HomePicker from '@/components/HomePicker';
import SiteHeader from '@/components/SiteHeader';
import { computeStats } from '@/lib/engine';
import { dict, lp, type Locale } from '@/lib/i18n';
import { moneyEn, moneyZh, multiple } from '@/lib/format';
import { loadSeries, STOCKS } from '@/lib/stocks';

const PRESETS: { key: string; year: number; amount: number }[] = [
  { key: 'msft', year: 1996, amount: 100_000 },
  { key: 'aapl', year: 2005, amount: 100_000 },
  { key: 'nvda', year: 2015, amount: 100_000 },
  { key: 'amzn', year: 2002, amount: 100_000 },
  { key: 'btc', year: 2013, amount: 10_000 },
  { key: 'spx', year: 1990, amount: 100_000 },
  { key: 'gold', year: 2004, amount: 100_000 },
  { key: 'brkb', year: 2011, amount: 100_000 },
  { key: 'nflx', year: 2007, amount: 100_000 },
  { key: 'amd', year: 2015, amount: 100_000 },
  { key: 'tsm', year: 2005, amount: 100_000 },
  { key: 'tencent', year: 2008, amount: 100_000 },
  { key: 'moutai', year: 2003, amount: 100_000 },
];

/** 定投变体参数: 首笔 = amount/10, 每月追加 = amount/100 (10 万 → 首笔 1 万 + 每月 1000) */
const DCA_MONTHLY_FACTOR = 100;

interface PresetCard {
  key: string;
  zh: string;
  name: string;
  symbol: string;
  year: number;
  amount: number;
  monthly?: number;
  multText: string;
  up: boolean; // 盈亏语义(倍数≥1), 直接取自引擎而非解析展示文本
  final: string; // 说明行终值: zh 万/亿(币种中性无符号) / en 币种缩写 — 与同行「首笔/每月」格式口径一致
  years: number;
}

/** 主页正文(中英共用): 构建期读取数据算出预设案例的真实结果 */
export default async function HomeContent({ locale }: { locale: Locale }) {
  const t = dict(locale);
  const nameOf = (k: string) => {
    const s = STOCKS.find((x) => x.key === k);
    return s ? (locale === 'zh' ? s.zh : s.en) : k;
  };

  // 每个标的可选年份范围(26 个 JSON 并行读, 构建期省一轮串行 IO)
  const ranges: Record<string, { first: number; last: number }> = {};
  let latestData = ''; // 最新一条行情日期 → 页脚"数据截至"信任信号
  let earliestData = '99991231'; // 最早一条行情日期 → 英雄区数据条
  const loaded = await Promise.all(STOCKS.map(async (s) => [s, await loadSeries(s.key)] as const));
  for (const [s, series] of loaded) {
    if (!series) continue;
    ranges[s.key] = {
      first: Number(series.first.slice(0, 4)),
      last: new Date().getFullYear() - 1,
    };
    if (series.last > latestData) latestData = series.last;
    if (series.first < earliestData) earliestData = series.first;
  }
  // 数据跨度年数(如 COST/MCD 自 1986 → 40 年)
  const spanYears =
    earliestData === '99991231'
      ? 0
      : Math.max(0, Number(latestData.slice(0, 4)) - Number(earliestData.slice(0, 4)));

  // 预设案例真实结果(每个案例生成一次性买入 + 定投两个变体)
  const cards: PresetCard[] = [];
  for (const p of PRESETS) {
    const meta = STOCKS.find((s) => s.key === p.key);
    if (!meta) continue; // PRESETS 与 STOCKS 失配时跳过而非构建崩溃
    const series = await loadSeries(p.key);
    if (!series) continue;
    if (Number(series.first.slice(0, 4)) > p.year) continue;
    const start = series.dates.findIndex((d) => d.slice(0, 4) === String(p.year));
    if (start < 0) continue;
    const base = { dates: series.dates, closes: series.closes, start, end: series.points - 1 };
    const variants: { monthly?: number }[] = [{}, { monthly: p.amount / DCA_MONTHLY_FACTOR }];
    for (const v of variants) {
      const stats = computeStats({ ...base, amount: v.monthly ? p.amount / 10 : p.amount, monthly: v.monthly });
      cards.push({
        key: meta.key,
        zh: meta.zh,
        name: locale === 'zh' ? meta.zh : meta.en,
        symbol: meta.symbol,
        year: p.year,
        amount: v.monthly ? p.amount / 10 : p.amount,
        monthly: v.monthly,
        multText: multiple(stats.multiple),
        up: stats.multiple >= 1,
        final: locale === 'zh' ? moneyZh(stats.finalValue) : moneyEn(stats.finalValue, meta.ccy),
        years: Math.round(stats.years),
      });
    }
  }

  const allAssets = STOCKS.filter((s) => ranges[s.key]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16">
      <SiteHeader locale={locale} ctaHref={lp(locale, '/replay')} ctaLabel={t.playNow} />

      <section className="pt-14 sm:pt-20">
        <div className="wi-eyebrow flex items-center gap-2">
          <span aria-hidden className="inline-block h-1.5 w-1.5 bg-gain" />
          WHATIF // REPLAY ENGINE
        </div>
        <h1 className="mt-4 max-w-xl text-4xl font-bold leading-[1.15] tracking-tight sm:text-6xl">
          {locale === 'en' ? (
            <>
              What if you had bought{' '}
              <span className="text-gain">back then</span>?
            </>
          ) : (
            <>
              假如<span className="text-gain">当时</span>买了…
            </>
          )}
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-7 text-ink-950/55">
          {t.heroSub}
          <br />
          {t.heroSub2}
        </p>

        {/* 信任数据条: 全部来自构建期真实数据, 零运维成本 */}
        <dl className="mt-10 flex max-w-md items-end gap-x-10 border-y border-ink-950/10 py-4">
          {[
            { v: String(allAssets.length), l: t.trustAssets },
            { v: earliestData === '99991231' ? '—' : earliestData.slice(0, 4), l: t.trustSince },
            { v: `${spanYears}+`, l: t.trustSpan },
          ].map((s) => (
            <div key={s.l}>
              <dt className="wi-eyebrow">{s.l}</dt>
              <dd className="mt-1 font-mono text-xl font-bold tabular-nums leading-none">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <HomePicker stocks={STOCKS} ranges={ranges} locale={locale} />

      {/* 预设案例: 数字全部来自真实历史数据 */}
      <section className="mt-20">
        <h2 className="wi-eyebrow mb-5">{t.hotPicks}</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {cards.map((p) => {
            const up = p.up;
            return (
              <Link
                key={`${p.key}-${p.year}-${p.monthly ?? 'lump'}`}
                href={`${lp(locale, '/replay')}?s=${p.key}&y=${p.year}&a=${p.amount}${
                  p.monthly ? `&m=dca&monthly=${p.monthly}` : ''
                }`}
                prefetch={false}
                className="group relative overflow-hidden rounded-lg border border-ink-950/10 bg-white p-4 transition duration-200 hover:border-ink-950/35 hover:shadow-[0_10px_28px_-18px_rgba(17,17,20,0.45)]"
              >
                {/* 左缘模式色条: 暖红=一次性买入, 青绿=定投 */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-[3px] ${
                    p.monthly ? 'bg-dca' : 'bg-gain'
                  } opacity-60 transition group-hover:opacity-100`}
                />
                {/* 标题拆两行: 年份+代码/模式一行, 名称独占一行 — "2015 · 超威半导体"这类长名在 2 列卡里必截断 */}
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-ink-950/35">
                  <span className="tabular-nums">{p.year}</span>
                  {p.monthly ? (
                    <span className="rounded border border-dca/40 px-1.5 py-0.5 font-sans text-[10px] font-medium normal-case tracking-normal text-dca">
                      {t.presetDcaTag}
                    </span>
                  ) : (
                    <span>{p.symbol}</span>
                  )}
                </div>
                {/* 名称允许自然换行: 超长英文名(Berkshire Hathaway 18 字符)任何固定字号总有临界宽度,
                    换行 + grid 拉齐同行卡高, 全断点完整显示 */}
                <div className="mt-1.5 break-words text-sm font-bold leading-snug">{p.name}</div>
                <div
                  className={`mt-2 font-mono text-xl font-bold tracking-tight tabular-nums ${
                    up ? 'text-gain' : 'text-loss'
                  }`}
                >
                  {p.multText}
                </div>
              {/* 说明行 3 行兜底: 320-390px 窄卡(内容 ~104-129px)下中文 2 行也会截掉终值 */}
              <div className="mt-0.5 line-clamp-3 text-[11px] leading-4 text-ink-950/45">
                {locale === 'zh'
                  ? p.monthly
                    ? <>{`首笔 ${moneyZh(p.amount)} + 每月 ${moneyZh(p.monthly)} → `}<span className="whitespace-nowrap">{`${p.years} 年`}</span>{` · ${p.final}`}</>
                    : <>{`本金 ${moneyZh(p.amount)} → `}<span className="whitespace-nowrap">{`${p.years} 年后`}</span></>
                  : p.monthly
                    ? <>{`${t.presetPrincipal} ${moneyEn(p.amount)} + ${moneyEn(p.monthly!)}/mo → `}<span className="whitespace-nowrap">{`${p.years} ${t.yearsLater(0)}`}</span>{` · ${p.final}`}</>
                    : <>{`${t.presetPrincipal} ${moneyEn(p.amount)} → `}<span className="whitespace-nowrap">{`${p.years} ${t.yearsLater(0)}`}</span>{` · ${p.final}`}</>}
              </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 全部标的入口(SEO 内链 + 长尾) */}
      <section className="mt-20">
        <h2 className="wi-eyebrow mb-5">{t.allAssets}</h2>
        <div className="flex flex-wrap gap-2">
          {allAssets.map((s) => (
            <Link
              key={s.key}
              href={lp(locale, `/p/${s.key}`)}
              prefetch={false}
              className="text-sm text-ink-950/60 underline decoration-ink-950/15 underline-offset-4 transition hover:text-ink-950 hover:decoration-ink-950/40"
            >
              {locale === 'zh' ? s.zh : s.en}{' '}
              <span className="font-mono text-xs text-ink-950/40">{s.symbol}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 怎么算的: 三步说明 */}
      <section className="mt-20">
        <h2 className="wi-eyebrow mb-5">{t.howItWorks}</h2>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
          {[
            { n: '01', title: t.how1Title, body: t.how1Body },
            { n: '02', title: t.how2Title, body: t.how2Body },
            { n: '03', title: t.how3Title, body: t.how3Body },
          ].map((f) => (
            <div key={f.n} className="border-t border-ink-950/15 pt-4">
              <div className="font-mono text-xs tracking-widest text-gain/80">{f.n}</div>
              <div className="mt-2 text-sm font-semibold text-ink-950/90">{f.title}</div>
              <p className="mt-1.5 text-[13px] leading-6 text-ink-950/45">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-ink-950/8 pt-6 text-[11px] leading-5 text-ink-950/50">
        <p>{t.disclaimer}</p>
        <p className="mt-2 font-mono">
          {t.footerNote}
          {latestData && <span className="ml-4 opacity-80">· {t.dataAsOf(latestData)}</span>}
        </p>
      </footer>
    </main>
  );
}
