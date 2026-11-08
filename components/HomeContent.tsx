import Link from 'next/link';
import HomePicker from '@/components/HomePicker';
import SiteHeader from '@/components/SiteHeader';
import TickerTape from '@/components/TickerTape';
import { computeStats } from '@/lib/engine';
import { dict, lp, type Locale } from '@/lib/i18n';
import { dateISO, moneyEn, moneyZh, multiple } from '@/lib/format';
import { toneCls } from '@/lib/tokens';
import { loadSeries, startIndexForYear, STOCKS } from '@/lib/stocks';

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

interface PresetVariant {
  multText: string;
  up: boolean; // 盈亏语义(倍数≥1), 直接取自引擎而非解析展示文本
}

interface PresetCard {
  key: string;
  name: string;
  symbol: string;
  year: number;
  amount: number; // 一次性本金; 定投派生口径: 首笔 = amount/10, 每月 = amount/100
  monthly: number; // 定投每月追加额(amount/100), 次级链接直接取用
  lump: PresetVariant; // 行 A: 一次性买入
  dca: PresetVariant; // 行 B: 每月定投
  dcaFinal: string; // 定投说明行终值: zh 万/亿(币种中性无符号) / en 币种缩写 — 与同行「首笔/每月」格式口径一致
  years: number;
}

/** 主页正文(中英共用): 构建期读取数据算出预设案例的真实结果 */
export default async function HomeContent({ locale }: { locale: Locale }) {
  const t = dict(locale);
  // 预设卡倍数大字(text-xl bold ≥18.66px → 标准档)涨跌色: en 绿涨红跌, zh 红涨绿跌(不变)
  const multTone = toneCls(locale);
  const nameOf = (k: string) => {
    const s = STOCKS.find((x) => x.key === k);
    return s ? (locale === 'zh' ? s.zh : s.en) : k;
  };

  // 每个标的可选年份范围(26 个 JSON 并行读, 构建期省一轮串行 IO)
  // years = 该标的数据中实际存在的年份(升序去重): 供滑杆吸附, 消除数据空洞年(如 TSM 2005/2006)
  const ranges: Record<string, { first: number; last: number; years?: number[] }> = {};
  let latestData = ''; // 最新一条行情日期 → 页脚"数据截至"信任信号
  let earliestData = '99991231'; // 最早一条行情日期 → 英雄区数据条
  const loaded = await Promise.all(STOCKS.map(async (s) => [s, await loadSeries(s.key)] as const));
  for (const [s, series] of loaded) {
    if (!series) continue;
    ranges[s.key] = {
      first: Number(series.first.slice(0, 4)),
      last: new Date().getFullYear() - 1,
      years: [...new Set(series.dates.map((d) => d.slice(0, 4)))].map(Number),
    };
    if (series.last > latestData) latestData = series.last;
    if (series.first < earliestData) earliestData = series.first;
  }
  // 数据跨度年数(如 COST/MCD 自 1986 → 40 年)
  const spanYears =
    earliestData === '99991231'
      ? 0
      : Math.max(0, Number(latestData.slice(0, 4)) - Number(earliestData.slice(0, 4)));

  // 预设案例真实结果: 每标的一张卡、卡内「一次性 vs 定投」双行对比(26 卡 → 13 卡, 移动端滚动减半)
  const cards: PresetCard[] = [];
  for (const p of PRESETS) {
    const meta = STOCKS.find((s) => s.key === p.key);
    if (!meta) continue; // PRESETS 与 STOCKS 失配时跳过而非构建崩溃(check-data 预设门禁兜住)
    const series = await loadSeries(p.key);
    if (!series) continue;
    if (Number(series.first.slice(0, 4)) > p.year) continue;
    // 年份夹取: 预设年落在数据空洞(如 TSM 2005/2006)时对齐到首个 ≥ 该年的交易日,
    // 卡面宣称年 = 回放实际买入年(effYear), 不再静默丢卡; 预设年晚于数据末年 → 仍跳过防御
    let effYear = p.year;
    let start = series.dates.findIndex((d) => d.slice(0, 4) === String(p.year));
    if (start < 0) {
      start = startIndexForYear(series, p.year);
      if (start < 0) continue; // 数据末年也晚于预设年: 无从夹取, 交由 check-data 预设门禁暴露
      effYear = Number(series.dates[start].slice(0, 4));
    }
    const base = { dates: series.dates, closes: series.closes, start, end: series.points - 1 };
    const monthly = p.amount / DCA_MONTHLY_FACTOR;
    const lumpStats = computeStats({ ...base, amount: p.amount });
    const dcaStats = computeStats({ ...base, amount: p.amount / 10, monthly });
    cards.push({
      key: meta.key,
      name: locale === 'zh' ? meta.zh : meta.en,
      symbol: meta.symbol,
      year: effYear,
      amount: p.amount,
      monthly,
      lump: { multText: multiple(lumpStats.multiple), up: lumpStats.multiple >= 1 },
      dca: { multText: multiple(dcaStats.multiple), up: dcaStats.multiple >= 1 },
      dcaFinal:
        locale === 'zh' ? moneyZh(dcaStats.finalValue) : moneyEn(dcaStats.finalValue, meta.ccy),
      years: Math.round(lumpStats.years),
    });
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
        <p className="mt-5 max-w-md text-[15px] leading-7 text-ink-950/60">
          {t.heroSub}
          <br />
          {t.heroSub2}
        </p>

        {/* 信任数据条: 全部来自构建期真实数据, 零运维成本。
            「数据截至」从页脚 11px 行前移到首屏(数据新鲜度是核心信任点);
            gap-x-10→6 + flex-wrap: 四项在 ~330px 以下按词边界整项换行, 不再词内折断 */}
        <dl className="mt-10 flex max-w-md flex-wrap items-end gap-x-6 gap-y-3 border-y border-ink-950/10 py-4">
          {[
            { v: String(allAssets.length), l: t.trustAssets },
            { v: earliestData === '99991231' ? '—' : earliestData.slice(0, 4), l: t.trustSince },
            { v: `${spanYears}+`, l: t.trustSpan },
            { v: latestData ? dateISO(latestData) : '—', l: t.dataAsOfLabel },
          ].map((s) => (
            <div key={s.l}>
              <dt className="wi-eyebrow">{s.l}</dt>
              <dd className="mt-1 whitespace-nowrap font-mono text-xl font-bold tabular-nums leading-none">
                {s.v}
              </dd>
            </div>
          ))}
        </dl>

        {/* 行情走马灯: 与回放页同款(组件自带等高占位防 CLS / 两侧 mask 渐隐 / 键盘暂停可达性) */}
        <TickerTape />
      </section>

      <HomePicker stocks={STOCKS} ranges={ranges} locale={locale} />

      {/* 预设案例: 数字全部来自真实历史数据。单卡双行(lump vs DCA), xl 档 5 列吃掉 1440 视口的两侧留白 */}
      <section className="mt-20">
        <h2 className="wi-eyebrow mb-5">{t.hotPicks}</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 xl:grid-cols-5">
          {cards.map((p) => (
            // 卡体改为 div: 主链接(一次性回放)为铺满整卡的拉伸链接, 定投行 z-10 覆盖其上 —
            // 避免 a 嵌 a 的非法结构, 两跳转互不干扰
            <div
              key={p.key}
              className="group relative overflow-hidden rounded-lg border border-ink-950/10 bg-white p-4 transition duration-200 hover:border-ink-950/35 hover:shadow-[0_10px_28px_-18px_rgba(17,17,20,0.45)] xl:p-3"
            >
              {/* 左缘双细条(方角非渐变): 上段暖红=一次性 / 下段青绿=定投, 对应两行模式色 */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 flex w-[3px] flex-col opacity-60 transition group-hover:opacity-100"
              >
                <span className="flex-1 bg-gain" />
                <span className="flex-1 bg-dca" />
              </span>
              {/* 主链接·一次性回放: 铺满整卡(含名称/说明行整块可点) */}
              <Link
                href={`${lp(locale, '/replay')}?s=${p.key}&y=${p.year}&a=${p.amount}`}
                prefetch={false}
                className="absolute inset-0 z-0 rounded-lg"
                aria-label={
                  locale === 'zh'
                    ? `${p.name} ${p.year} 一次性买入回放`
                    : `${p.name} ${p.year} lump-sum replay`
                }
              />
              {/* 标题行: 年份 + 代码 */}
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-ink-950/60">
                <span className="tabular-nums">{p.year}</span>
                <span>{p.symbol}</span>
              </div>
              {/* 名称允许自然换行: 超长英文名(Berkshire Hathaway 18 字符)任何固定字号总有临界宽度,
                  换行 + grid 拉齐同行卡高, 全断点完整显示 */}
              <div className="mt-1.5 break-words text-sm font-bold leading-snug">{p.name}</div>

              {/* 行 A · 一次性: 倍数走涨跌语义色(与回放页大字同源), 标签=一次性(暖红, 对应左缘上段) */}
              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-0.5">
                <span
                  className={`font-mono text-xl font-bold tracking-tight tabular-nums ${
                    p.lump.up ? multTone.up : multTone.down
                  }`}
                >
                  {p.lump.multText}
                </span>
                <span className="ml-auto shrink-0 rounded border border-gain/40 px-0.5 py-0.5 font-sans text-[9px] font-medium tracking-normal text-gain">
                  {t.presetLumpTag}
                </span>
              </div>
              <div className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-ink-950/60">
                {locale === 'zh' ? (
                  <>
                    {`本金 ${moneyZh(p.amount)} → `}
                    <span className="whitespace-nowrap">{`${p.years} 年后`}</span>
                  </>
                ) : (
                  <>
                    {`${t.presetPrincipal} ${moneyEn(p.amount)} → `}
                    <span className="whitespace-nowrap">{`${p.years} ${t.yearsLater(0)}`}</span>
                  </>
                )}
              </div>

              {/* 行 B · 定投: 次级小链接(整行可点), 倍数走 dca 青绿系(text-xl bold 大字号达 AA-large) */}
              <Link
                href={`${lp(locale, '/replay')}?s=${p.key}&y=${p.year}&a=${p.amount / 10}&m=dca&monthly=${p.monthly}`}
                prefetch={false}
                className="relative z-10 -mx-1 mt-2.5 flex flex-wrap items-baseline gap-x-0.5 rounded-sm px-1 py-0.5 transition hover:bg-dca/10"
                aria-label={
                  locale === 'zh'
                    ? `${p.name} ${p.year} 定投回放`
                    : `${p.name} ${p.year} DCA replay`
                }
              >
                <span className="font-mono text-xl font-bold tracking-tight tabular-nums text-dca">
                  {p.dca.multText}
                </span>
                <span className="ml-auto shrink-0 rounded border border-dca/40 px-0.5 py-0.5 font-sans text-[9px] font-medium tracking-normal text-loss-strong">
                  {t.presetDcaTag}
                </span>
              </Link>
              <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-ink-950/60">
                {locale === 'zh' ? (
                  <>
                    {`首笔 ${moneyZh(p.amount / 10)} + 每月 ${moneyZh(p.monthly)} → `}
                    <span className="whitespace-nowrap">{`${p.years} 年`}</span>
                    {` · ${p.dcaFinal}`}
                  </>
                ) : (
                  <>
                    {`${moneyEn(p.amount / 10)} + ${moneyEn(p.monthly)}/mo → `}
                    <span className="whitespace-nowrap">{`${p.years} ${t.yearsLater(0)}`}</span>
                    {` · ${p.dcaFinal}`}
                  </>
                )}
              </div>
            </div>
          ))}
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
              <span className="font-mono text-xs text-ink-950/60">{s.symbol}</span>
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
              <p className="mt-1.5 text-[13px] leading-6 text-ink-950/60">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-ink-950/10 pt-6 text-[11px] leading-5 text-ink-950/60">
        <p>{t.disclaimer}</p>
        <p className="mt-2 font-mono">
          {t.footerNote}
          {latestData && <span className="ml-4 opacity-80">· {t.dataAsOf(latestData)}</span>}
        </p>
      </footer>
    </main>
  );
}
