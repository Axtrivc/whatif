import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { computeStats } from '@/lib/engine';
import { money, multiple, pct } from '@/lib/format';
import { loadSeries, MARKET_LABEL, STOCKS, STOCK_MAP } from '@/lib/stocks';

interface Props {
  params: Promise<{ stock: string }>;
}

export function generateStaticParams() {
  return STOCKS.map((s) => ({ stock: s.key }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stock: key } = await params;
  const meta = STOCK_MAP[key];
  if (!meta) return {};
  const series = await loadSeries(key);
  const firstYear = series ? series.first.slice(0, 4) : '';
  const title = `假如${firstYear}年买入${meta.zh}，今天值多少钱？`;
  const description = `${meta.zh}(${meta.symbol}) ${firstYear} 年至今的历史回测：动画回放${meta.zh}的长期回报，支持任意年份与本金。后复权口径，历史模拟仅供参考。`;
  return {
    title,
    description,
    alternates: { canonical: `/p/${key}/` },
    openGraph: {
      title,
      description,
      url: `/p/${key}/`,
      type: 'website',
    },
  };
}

export default async function StockLanding({ params }: Props) {
  const { stock: key } = await params;
  const meta = STOCK_MAP[key];
  const series = meta ? await loadSeries(key) : null;
  if (!meta || !series) notFound();

  const firstYear = Number(series.first.slice(0, 4));
  const lastYear = new Date().getFullYear() - 1;

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
  const hl = table.find((r) => r.year === firstYear)!;

  const replayHref = (y: number) => `/replay/?s=${key}&y=${y}&a=100000`;
  const others = STOCKS.filter((s) => s.key !== key && s.hot).slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: '假如当时买了', item: 'https://whatif.axtrivc.com/' },
              {
                '@type': 'ListItem',
                position: 2,
                name: `假如${firstYear}年买入${meta.zh}`,
                item: `https://whatif.axtrivc.com/p/${key}/`,
              },
            ],
          }),
        }}
      />
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-up text-lg font-black text-white">
            ?
          </span>
          <span className="text-base font-extrabold">假如当时买了</span>
        </Link>
        <Link
          href={replayHref(firstYear)}
          className="rounded-full bg-up px-5 py-2 text-sm font-bold text-white transition hover:brightness-110"
        >
          ▶ 看动画
        </Link>
      </header>

      <h1 className="mt-6 text-3xl font-black leading-snug sm:text-4xl">
        假如 {firstYear} 年买入{meta.zh}
        <span className="text-white/40">（{meta.symbol}）</span>，今天值多少钱？
      </h1>

      {hl && (
        <p className="mt-4 font-mono text-lg text-up">
          10万 → {money(hl.stats.finalValue, 'zh')}（{multiple(hl.stats.multiple)} ·{' '}
          {pct(hl.stats.returnPct, 0)}）
        </p>
      )}

      <p className="mt-4 text-sm leading-7 text-white/60">
        {meta.zh}（{meta.en}，{MARKET_LABEL[meta.market]}）的数据可以追溯到 {firstYear} 年。如果从上市初期投入
        10 万美元、一直持有并让分红再投资（后复权口径），到 {series.last.slice(0, 4)} 年
        将变成 {money(hl?.stats.finalValue ?? 0, 'zh')}，年化收益{' '}
        {((hl?.stats.cagr ?? 0) * 100).toFixed(1)}%。
        点击任意年份，用动画回放这趟复利之旅。
      </p>

      {/* 年份快捷入口 */}
      <section className="mt-8 flex flex-wrap gap-2">
        {table.map((r) => (
          <Link
            key={r.year}
            href={replayHref(r.year)}
            className={`rounded-full px-4 py-2 font-mono text-sm font-bold transition active:scale-95 ${
              r.year === best.year
                ? 'bg-up text-white shadow-[0_0_24px_-6px_rgba(255,59,48,0.7)]'
                : 'bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {r.year}
          </Link>
        ))}
      </section>

      {/* 回测表 */}
      <section className="mt-10 overflow-hidden rounded-2xl border border-white/8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-semibold">买入年份</th>
              <th className="px-4 py-3 text-right font-semibold">10万 →</th>
              <th className="px-4 py-3 text-right font-semibold">倍数</th>
              <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">年化</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.year} className="border-t border-white/5 transition hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link href={replayHref(r.year)} className="font-mono font-bold hover:text-up">
                    {r.year}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  <Link href={replayHref(r.year)} className="hover:text-up">
                    {money(r.stats.finalValue, 'zh')}
                  </Link>
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono font-bold ${
                    r.stats.returnPct >= 0 ? 'text-up' : 'text-down'
                  }`}
                >
                  {multiple(r.stats.multiple)}
                </td>
                <td className="hidden px-4 py-3 text-right font-mono text-white/60 sm:table-cell">
                  {(r.stats.cagr * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-6 text-xs leading-6 text-white/40">
        口径说明：采用后复权价格（分红按除息日再投资近似），不含交易税费；加密货币与商品以美元计价。
        历史数据来自公开市场，可能存在误差。历史表现不代表未来，本页面不构成投资建议。
      </p>

      {/* 其他热门 */}
      <section className="mt-12">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/40">
          换一个「假如」
        </h2>
        <div className="flex flex-wrap gap-2">
          {others.map((s) => (
            <Link
              key={s.key}
              href={`/p/${s.key}/`}
              className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10"
            >
              {s.zh} {s.symbol}
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-white/8 pt-6 font-mono text-[11px] text-white/30">
        © 2026 whatif.axtrivc.com · 姊妹站{' '}
        <a href="https://toolhub.axtrivc.com" className="hover:text-white/60">
          toolhub.axtrivc.com
        </a>
      </footer>
    </main>
  );
}
