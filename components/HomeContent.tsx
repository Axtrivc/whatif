import Link from 'next/link';
import HomePicker from '@/components/HomePicker';
import LangSwitch from '@/components/LangSwitch';
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
  finalEn: string;
  years: number;
}

/** 主页正文(中英共用): 构建期读取数据算出预设案例的真实结果 */
export default async function HomeContent({ locale }: { locale: Locale }) {
  const t = dict(locale);
  const nameOf = (k: string) => {
    const s = STOCKS.find((x) => x.key === k);
    return s ? (locale === 'zh' ? s.zh : s.en) : k;
  };

  // 每个标的可选年份范围
  const ranges: Record<string, { first: number; last: number }> = {};
  for (const s of STOCKS) {
    const series = await loadSeries(s.key);
    if (!series) continue;
    ranges[s.key] = {
      first: Number(series.first.slice(0, 4)),
      last: new Date().getFullYear() - 1,
    };
  }

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
        finalEn: moneyEn(stats.finalValue),
        years: Math.round(stats.years),
      });
    }
  }

  const allAssets = STOCKS.filter((s) => ranges[s.key]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <Link href={lp(locale, '/')} className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-950 text-lg font-black text-white">
            ?
          </span>
          <div>
            <div className="text-base font-extrabold leading-tight">{t.siteName}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-950/40">
              {t.brandSub}
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <LangSwitch locale={locale} />
          <Link
            href={lp(locale, '/replay')}
            className="rounded-full border border-ink-950/10 px-4 py-1.5 text-xs font-semibold text-ink-950/60 transition hover:border-ink-950/25 hover:text-ink-950"
          >
            {t.playNow}
          </Link>
        </div>
      </header>

      <section className="pt-14 sm:pt-20">
        <h1 className="max-w-xl text-4xl font-bold leading-[1.15] tracking-tight sm:text-6xl">
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
      </section>

      <HomePicker stocks={STOCKS} ranges={ranges} locale={locale} />

      {/* 预设案例: 数字全部来自真实历史数据 */}
      <section className="mt-20">
        <h2 className="mb-5 text-[13px] font-medium text-ink-950/35">
          {t.hotPicks}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((p) => {
            const up = statsUp(p.multText);
            return (
              <Link
                key={`${p.key}-${p.year}-${p.monthly ?? 'lump'}`}
                href={`${lp(locale, '/replay')}?s=${p.key}&y=${p.year}&a=${p.amount}${
                  p.monthly ? `&m=dca&monthly=${p.monthly}` : ''
                }`}
                className={`group rounded-xl p-4 transition ${
                  p.monthly
                    ? 'bg-dca/[0.04] ring-1 ring-inset ring-dca/20 hover:bg-dca/[0.09]'
                    : 'bg-gain/[0.04] ring-1 ring-inset ring-gain/20 hover:bg-gain/[0.09]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-bold">
                    {p.year} · {p.name}
                  </span>
                  {p.monthly ? (
                    <span className="shrink-0 rounded border border-dca/40 px-1.5 py-0.5 text-[10px] font-medium text-dca">
                      {t.presetDcaTag}
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono text-[10px] text-ink-950/35">{p.symbol}</span>
                  )}
                </div>
                <div
                  className={`mt-2 font-mono text-xl font-bold tracking-tight ${
                    up ? 'text-gain' : 'text-loss'
                  }`}
                >
                  {p.multText}
                </div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-950/45">
                {locale === 'zh'
                  ? p.monthly
                    ? `首笔 ${moneyZh(p.amount)} + 每月 ${moneyZh(p.monthly)} → ${p.years} 年 · ${p.finalEn}`
                    : `本金 ${moneyZh(p.amount)} → ${p.years} 年后`
                  : p.monthly
                    ? `${t.presetPrincipal} ${moneyEn(p.amount)} + ${moneyEn(p.monthly!)}/mo → ${p.years} ${t.yearsLater(0)} · ${p.finalEn}`
                    : `${t.presetPrincipal} ${moneyEn(p.amount)} → ${p.years} ${t.yearsLater(0)} · ${p.finalEn}`}
              </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 全部标的入口(SEO 内链 + 长尾) */}
      <section className="mt-20">
        <h2 className="mb-5 text-[13px] font-medium text-ink-950/35">
          {t.allAssets}
        </h2>
        <div className="flex flex-wrap gap-2">
          {allAssets.map((s) => (
            <Link
              key={s.key}
              href={lp(locale, `/p/${s.key}`)}
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
        <h2 className="mb-5 text-[13px] font-medium text-ink-950/35">
          {t.howItWorks}
        </h2>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
          {[
            { n: '01', title: t.how1Title, body: t.how1Body },
            { n: '02', title: t.how2Title, body: t.how2Body },
            { n: '03', title: t.how3Title, body: t.how3Body },
          ].map((f) => (
            <div key={f.n}>
              <div className="font-mono text-xs text-gain/70">{f.n}</div>
              <div className="mt-2 text-sm font-semibold text-ink-950/90">{f.title}</div>
              <p className="mt-1.5 text-[13px] leading-6 text-ink-950/45">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-ink-950/8 pt-6 text-[11px] leading-5 text-ink-950/35">
        <p>{t.disclaimer}</p>
        <p className="mt-2 font-mono">{t.footerNote}</p>
      </footer>
    </main>
  );
}

/** 涨红跌绿判定: 倍数 > 1 即涨(×1.0/×0.x 为绿) */
function statsUp(multText: string): boolean {
  const v = parseFloat(multText.slice(1));
  return Number.isFinite(v) ? v >= 1 : true;
}
