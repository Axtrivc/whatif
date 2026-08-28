import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { computeStats } from '@/lib/engine';
import { moneyEn, moneyZh, multiple, pct } from '@/lib/format';
import { dict, lp, MARKET_LABEL_I18N, type Locale } from '@/lib/i18n';
import { loadSeries, STOCKS, STOCK_MAP, type Series, type StockMeta } from '@/lib/stocks';
import { ccyPrefix } from '@/lib/tokens';

interface Props {
  locale: Locale;
  meta: StockMeta;
  series: Series;
}

export default async function StockLandingContent({ locale, meta, series }: Props) {
  const t = dict(locale);
  const name = locale === 'zh' ? meta.zh : meta.en;
  const firstYear = Number(series.first.slice(0, 4));
  const lastYear = new Date().getFullYear() - 1;

  // 标的计价货币: en 金额需带 HK$/¥ 前缀; zh 万/亿单位本身币种中性
  const prefix = ccyPrefix(meta.ccy);
  const moneyC = (v: number) => (locale === 'en' ? moneyEn(v, meta.ccy) : moneyZh(v));
  const principalLabel =
    locale === 'zh'
      ? meta.ccy === 'CNY'
        ? '10 万人民币'
        : meta.ccy === 'HKD'
          ? '10 万港元'
          : '10 万美元'
      : `${prefix}100K`;

  // 面包屑结构化数据(中英各自指向对应语言 URL)
  const homeUrl = `https://whatif.axtrivc.com${locale === 'en' ? '/en/' : '/'}`;
  const pageUrl = `https://whatif.axtrivc.com${locale === 'en' ? `/en/p/${meta.key}/` : `/p/${meta.key}/`}`;
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.siteName, item: homeUrl },
      {
        '@type': 'ListItem',
        position: 2,
        name: t.landingTitle(String(firstYear), name, meta.symbol),
        item: pageUrl,
      },
    ],
  }).replace(/</g, '\\u003c');

  // 年份锚点: 起始年 + 每 5 年 + 近三年
  const anchors = new Set<number>([firstYear, lastYear]);
  for (let y = firstYear; y <= lastYear; y += 5) anchors.add(y);
  for (let y = lastYear - 2; y <= lastYear; y++) if (y > firstYear) anchors.add(y);
  const years = [...anchors].sort((a, b) => b - a);

  // 每个锚点年份投入 10万 的真实结果
  const rows = years.map((y) => {
    const start = series.dates.findIndex((d) => d.slice(0, 4) === String(y));
    if (start < 0) return null;
    const stats = computeStats({
      dates: series.dates,
      closes: series.closes,
      start,
      end: series.points - 1,
      amount: 100_000,
    });
    return { year: y, stats };
  });
  const table = rows.filter(Boolean) as { year: number; stats: ReturnType<typeof computeStats> }[];
  const best = table.reduce((a, b) => (b.stats.multiple > a.stats.multiple ? b : a), table[0]);
  const hl = table.find((r) => r.year === firstYear);

  const replayHref = (y: number) => `${lp(locale, '/replay')}?s=${meta.key}&y=${y}&a=100000`;
  const others = STOCKS.filter((s) => s.key !== meta.key && s.hot).slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
      />
      <SiteHeader locale={locale} ctaHref={replayHref(firstYear)} ctaLabel={t.watchAnimation} />

      <h1 className="mt-6 text-3xl font-black leading-snug sm:text-4xl">
        {t.landingTitle(String(firstYear), name, meta.symbol)}
      </h1>

      {hl && (
        <p className="mt-4 font-mono text-lg font-semibold text-gain">
          {t.landingHl(
            moneyC(100_000),
            moneyC(hl.stats.finalValue),
            multiple(hl.stats.multiple),
            pct(hl.stats.returnPct, 0)
          )}
        </p>
      )}

      <p className="mt-4 text-sm leading-7 text-ink-950/60">
        {t.landingIntro(
          name,
          meta.en,
          MARKET_LABEL_I18N[locale][meta.market],
          String(firstYear),
          String(series.last.slice(0, 4)),
          moneyC(hl?.stats.finalValue ?? 0),
          Number(((hl?.stats.cagr ?? 0) * 100).toFixed(1)),
          principalLabel
        )}
      </p>

      {/* 年份快捷入口 */}
      <section className="mt-8 flex flex-wrap gap-2">
        {table.map((r) => (
          <Link
            key={r.year}
            href={replayHref(r.year)}
            prefetch={false}
            className={`rounded-md border px-4 py-2 font-mono text-sm transition active:scale-95 ${
              r.year === best.year
                ? 'border-gain bg-gain font-semibold text-white'
                : 'border-ink-950/10 bg-white text-ink-950/70 hover:border-gain/50 hover:bg-gain/[0.06] hover:text-gain'
            }`}
          >
            {r.year}
          </Link>
        ))}
      </section>

      {/* 回测表 */}
      <section className="mt-10 overflow-hidden rounded-lg border border-ink-950/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-950/5 text-left text-xs uppercase tracking-wider text-ink-950/40">
              <th className="px-3 py-3 font-semibold sm:px-4">{t.colYear}</th>
              <th className="px-3 py-3 text-right sm:px-4 font-semibold">{t.colResult(prefix)}</th>
              <th className="px-3 py-3 text-right sm:px-4 font-semibold">{t.colMultiple}</th>
              <th className="hidden px-3 py-3 text-right sm:px-4 font-semibold sm:table-cell">{t.colCagr}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.year} className="border-t border-ink-950/5 transition hover:bg-ink-950/5">
                <td className="px-3 py-3 sm:px-4">
                  <Link href={replayHref(r.year)} prefetch={false} className="font-mono font-bold hover:text-ink-950">
                    {r.year}
                  </Link>
                </td>
                <td className="px-3 py-3 text-right sm:px-4 font-mono">
                  <Link href={replayHref(r.year)} prefetch={false} className="hover:text-ink-950">
                    {moneyC(r.stats.finalValue)}
                  </Link>
                </td>
                <td
                  className={`px-3 py-3 text-right sm:px-4 font-mono font-bold ${
                    r.stats.returnPct >= 0 ? 'text-profit' : 'text-loss'
                  }`}
                >
                  {multiple(r.stats.multiple)}
                </td>
                <td className="hidden px-3 py-3 text-right sm:px-4 font-mono text-ink-950/60 sm:table-cell">
                  {(r.stats.cagr * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-6 text-xs leading-6 text-ink-950/50">{t.caliberNote}</p>

      {/* 定投 vs 一次性买入对比(真实数据构建期计算): 总投入 10 万的两种买法 */}
      <section className="mt-12">
        <h2 className="text-sm font-bold uppercase tracking-widest text-ink-950/40">
          {t.dcaCompare}
        </h2>
        <p className="mt-1 text-xs text-ink-950/50">{t.dcaCompareIntro}</p>
        {(() => {
          // 口径: 总投入都是 10 万。lump-sum = 期初一次买; DCA = 首笔 1 万 + 每月 2000
          const TOTAL = 100_000;
          const monthlyAmt = 2_000;
          const lumpStats = computeStats({
            dates: series.dates,
            closes: series.closes,
            start: series.dates.findIndex((d) => d.slice(0, 4) === String(firstYear)),
            end: series.points - 1,
            amount: TOTAL,
          });
          const dcaStats = computeStats({
            dates: series.dates,
            closes: series.closes,
            start: series.dates.findIndex((d) => d.slice(0, 4) === String(firstYear)),
            end: series.points - 1,
            amount: 10_000,
            monthly: monthlyAmt,
          });
          const rows = [
            { mode: t.dcaModeLump, s: lumpStats, invested: TOTAL, dca: false },
            { mode: t.dcaModeDca, s: dcaStats, invested: dcaStats.invested ?? TOTAL, dca: true },
          ];
          return (
            <>
          <div className="mt-4 overflow-hidden rounded-lg border border-ink-950/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-950/[0.04] text-left font-mono text-[11px] uppercase tracking-[0.14em] text-ink-950/40">
                      <th className="px-3 py-3 font-semibold sm:px-4">{t.dcaColMode}</th>
                      <th className="hidden px-3 py-3 text-right sm:px-4 font-semibold sm:table-cell">{t.dcaColInvested}</th>
                      <th className="px-3 py-3 text-right sm:px-4 font-semibold">{t.dcaColFinal}</th>
                      <th className="px-3 py-3 text-right sm:px-4 font-semibold">{t.dcaColReturn}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.mode} className="border-t border-ink-950/5 transition hover:bg-ink-950/5">
                        <td className="px-3 py-3 font-semibold sm:px-4">
                          {r.dca ? (
                            <span className="text-dca">{r.mode}</span>
                          ) : (
                            <span className="text-gain">{r.mode}</span>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 text-right sm:px-4 font-mono text-ink-950/60 sm:table-cell">
                          {moneyC(r.invested)}
                        </td>
                        <td className="px-3 py-3 text-right sm:px-4 font-mono">
                          {moneyC(r.s.finalValue)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right sm:px-4 font-mono font-bold ${
                            r.s.returnPct >= 0 ? 'text-profit' : 'text-loss'
                          }`}
                        >
                          {pct(r.s.returnPct, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`${lp(locale, '/replay')}?s=${meta.key}&y=${firstYear}&a=10000&m=dca&monthly=${monthlyAmt}`}
                  className="inline-flex rounded-md border border-dca/40 bg-white px-5 py-2 text-sm font-semibold text-dca transition hover:border-dca hover:bg-dca/[0.08] active:scale-95"
                >
                  {t.dcaTryIt}
                </Link>
                <Link
                  href={`${lp(locale, '/replay')}?s=${meta.key}&y=${firstYear}&a=10000&m=dca&monthly=${monthlyAmt}&compare=1`}
                  className="inline-flex rounded-md border border-gain/40 bg-white px-5 py-2 text-sm font-semibold text-gain transition hover:border-gain hover:bg-gain/[0.06] active:scale-95"
                >
                  {locale === 'zh' ? '▶ 同屏对比回放' : '▶ Side-by-side Replay'}
                </Link>
              </div>
            </>
          );
        })()}
      </section>

      {/* 其他热门 */}
      <section className="mt-12">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-ink-950/40">
          {t.anotherIf}
        </h2>
        <div className="flex flex-wrap gap-2">
          {others.map((s) => (
            <Link
              key={s.key}
              href={lp(locale, `/p/${s.key}`)}
              prefetch={false}
              className="rounded-md bg-ink-950/[0.05] px-4 py-2 text-sm text-ink-950/70 transition hover:bg-ink-950/10"
            >
              {(locale === 'zh' ? s.zh : s.en) || s.en} {s.symbol}
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-ink-950/8 pt-6 font-mono text-[11px] text-ink-950/45">
        {t.footerNote}{' '}
        <a href="https://toolhub.axtrivc.com" className="hover:text-ink-950/60">
          toolhub.axtrivc.com
        </a>
      </footer>
    </main>
  );
}
