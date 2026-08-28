'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReplayExperience from '@/components/ReplayExperience';
import { dict, type Locale } from '@/lib/i18n';
import { STOCK_MAP, startIndexForYear, type Series } from '@/lib/stocks';

export default function ReplayClient({ locale = 'zh' }: { locale?: Locale }) {
  const t = dict(locale);
  const sp = useSearchParams();
  const key = sp.get('s') ?? 'msft';
  const year = Number(sp.get('y')) || 1996;
  const amount = Math.min(1e9, Math.max(100, Number(sp.get('a')) || 100_000));
  // 梗文案参数改为 mtext, 避免与定投模式 m=dca 冲突; 旧 m= 参数仅当非 dca 值时生效
  const memeRaw = sp.get('mtext') ?? sp.get('m');
  const meme = memeRaw && memeRaw !== 'dca' ? memeRaw : undefined;
  // 定投模式: m=dca 时启用, monthly 为每月追加额(默认本金的 1/10)
  const dca = sp.get('m') === 'dca' || sp.get('mode') === 'dca';
  const monthly = dca
    ? Math.min(1e8, Math.max(10, Number(sp.get('monthly')) || Math.round(amount / 10)))
    : undefined;
  // 对比模式(仅定投页有效): 同屏叠加同参数的一次性买入曲线
  const compare = dca && sp.get('compare') === '1';

  const stock = STOCK_MAP[key];
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // 重试计数: 变更即重新拉取

  useEffect(() => {
    if (!stock) {
      setError('unknown');
      return;
    }
    let alive = true;
    setSeries(null);
    setError(null);
    // 首次加载与 HTML 早取脚本(wi-early.js)共享同一 promise(谁先执行谁创建),
    // 客户端导航/直开两种进入方式都只发一次请求; 失败 resolve null → 错误态
    const earlyMap = ((window as { __wiData?: Record<string, Promise<Series | null>> }).__wiData ??=
      {});
    if (attempt === 0) {
      earlyMap[key] ??= fetch(`/data/${key}.json`).then(
        (r) => (r.ok ? r.json() : null),
        () => null
      ) as Promise<Series | null>;
      const timer = window.setTimeout(() => {
        if (alive) setError('load');
      }, 15_000);
      earlyMap[key].then((data) => {
        window.clearTimeout(timer);
        if (!alive) return;
        if (data) setSeries(data);
        else setError('load');
      });
      return () => {
        alive = false;
        window.clearTimeout(timer);
      };
    }
    // 重试(attempt>0): 全新可中止请求, 不复用已失败的早取 promise
    // 15s 超时兜底: 连接僵死时转入可重试的失败态, 不无限挂在「载入历史数据…」
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 15_000);
    fetch(`/data/${key}.json`, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Series) => {
        if (alive) setSeries(data);
      })
      .catch(() => {
        // 失败(HTTP/网络/15s 超时)都转入可重试错误态; 组件已卸载时由 alive 拦截
        if (alive) setError('load');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [key, stock, attempt]);

  const homeHref = locale === 'en' ? '/en/' : '/';
  if (!stock || error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-ink-950/60">{error === 'load' ? t.loadFailed : t.unknownStock}</p>
        <div className="flex items-center gap-2">
          {error === 'load' && (
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="rounded-md bg-ink-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 active:scale-95"
            >
              {t.retry}
            </button>
          )}
          <Link
            href={homeHref}
            className="rounded-md border border-ink-950/15 bg-white px-5 py-2 text-sm text-ink-950/70 transition hover:border-ink-950/40 hover:text-ink-950"
          >
            {t.backHome}
          </Link>
        </div>
      </div>
    );
  }

  if (!series) {
    // 骨架屏与真实舞台同布局同尺寸, 数据到达时零跳动
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-5">
        <div className="wi-frame relative mt-1">
          <div className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-md border border-ink-950/12 bg-[#fbfbfc] sm:aspect-[2.2/1]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-950/10">
                <div className="wi-loading h-full w-1/3 rounded-full bg-ink-950/30" />
              </div>
              <div className="font-mono text-sm text-ink-950/40">{t.loadingData}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const firstYear = Number(series.first.slice(0, 4));
  let effYear = Math.max(firstYear, Math.min(new Date().getFullYear() - 1, year));
  // 数据陈旧时请求年份可能没有任何交易日 → 逐级回退到数据存在的年份
  if (startIndexForYear(series, effYear) < 0) {
    const lastDataYear = Number(series.last.slice(0, 4));
    effYear = startIndexForYear(series, lastDataYear) >= 0 ? lastDataYear : firstYear;
  }

  return (
    <ReplayExperience
      key={`${key}-${effYear}-${amount}-${monthly ?? 0}-${compare ? 'c' : ''}`}
      series={series}
      stock={stock}
      year={effYear}
      amount={amount}
      meme={meme}
      monthly={monthly}
      compare={compare}
      locale={locale}
      homeHref={homeHref}
    />
  );
}
