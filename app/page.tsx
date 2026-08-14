import HomePicker from '@/components/HomePicker';
import { computeStats } from '@/lib/engine';
import { loadSeries, STOCKS } from '@/lib/stocks';
import Link from 'next/link';

export const revalidate = false;

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

export default async function Home() {
  // 构建期读取数据, 算出预设案例的真实结果 + 每个标的可选年份范围
  const ranges: Record<string, { first: number; last: number }> = {};
  const presets = [];
  for (const s of STOCKS) {
    const series = await loadSeries(s.key);
    if (!series) continue;
    ranges[s.key] = {
      first: Number(series.first.slice(0, 4)),
      last: new Date().getFullYear() - 1,
    };
  }
  for (const p of PRESETS) {
    const meta = STOCKS.find((s) => s.key === p.key)!;
    const series = await loadSeries(p.key);
    if (!series) continue;
    if (Number(series.first.slice(0, 4)) > p.year) continue;
    const start = series.dates.findIndex((d) => d.slice(0, 4) === String(p.year));
    if (start < 0) continue;
    const stats = computeStats({
      dates: series.dates,
      closes: series.closes,
      start,
      end: series.points - 1,
      amount: p.amount,
    });
    presets.push({ ...p, meta, stats });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-up text-lg font-black text-white">
            ?
          </span>
          <div>
            <div className="text-base font-extrabold leading-tight">假如当时买了</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              whatif
            </div>
          </div>
        </div>
        <Link
          href="/replay/"
          className="rounded-full border border-white/10 px-4 py-1.5 text-xs font-semibold text-white/60 transition hover:border-white/25 hover:text-white"
        >
          直接开玩 →
        </Link>
      </header>

      <section className="pt-8 text-center">
        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          假如
          <span className="bg-gradient-to-r from-[#ff3b30] to-[#ff8a65] bg-clip-text text-transparent">
            当时
          </span>
          买了…
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/55">
          选一只股票、一个年份、一笔本金。
          <br />
          看复利如何把时间变成奇迹 —— 动画逐日回放。
        </p>
      </section>

      <HomePicker stocks={STOCKS} ranges={ranges} />

      {/* 预设案例: 数字全部来自真实历史数据 */}
      <section className="mt-14">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/40">
          热门穿越 · 真实数据
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {presets.map((p) => (
            <Link
              key={`${p.key}-${p.year}`}
              href={`/replay/?s=${p.key}&y=${p.year}&a=${p.amount}`}
              className="group rounded-2xl border border-white/8 bg-ink-800 p-4 transition hover:border-up/50 hover:bg-ink-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {p.year} · {p.meta.zh}
                </span>
                <span className="font-mono text-[10px] text-white/35">{p.meta.symbol}</span>
              </div>
              <div
                className={`mt-2 font-mono text-xl font-extrabold ${
                  p.stats.returnPct >= 0 ? 'text-up' : 'text-down'
                }`}
              >
                ×{p.stats.multiple >= 100 ? p.stats.multiple.toFixed(0) : p.stats.multiple.toFixed(1)}
              </div>
              <div className="mt-0.5 text-[11px] text-white/45">
                本金 {p.amount >= 10000 ? `${p.amount / 10000}万` : p.amount} → {p.stats.years.toFixed(0)} 年后
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-white/8 pt-6 text-[11px] leading-5 text-white/35">
        <p>
          本站为历史数据模拟娱乐工具：价格为后复权口径（含分红再投资的近似），不包含税费与汇率影响。
          历史表现不代表未来，本站不构成任何投资建议。理财有风险，投资需谨慎。
        </p>
        <p className="mt-2 font-mono">© 2026 whatif.axtrivc.com · 姊妹站 toolhub.axtrivc.com</p>
      </footer>
    </main>
  );
}
