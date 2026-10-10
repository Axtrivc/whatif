'use client';

/**
 * 行情走马灯 — 交易所行情屏风格的无限横向滚动条
 * 数据: /data/ticker.json(抓取时生成, 13 标的最新真实价+日涨跌)
 * 渲染两遍内容 + translateX(-50%) 实现无缝循环
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { STOCK_MAP } from '@/lib/stocks';

interface TickerItem {
  key: string;
  zh: string;
  sym: string;
  ccy?: string; // 计价货币; '' = 指数无符号, 缺省 USD(旧数据文件兼容)
  price: number;
  chg: number;
}

/** 币种前缀统一取自设计令牌 */
import { ccyPrefix } from '@/lib/tokens';

/** 模块级缓存: 首页↔回放往返等重复挂载不再重新请求; 失败不缓存以便重试 */
let tickerCache: Promise<TickerItem[]> | null = null;

function loadTicker(): Promise<TickerItem[]> {
  tickerCache ??= fetch('/data/ticker.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .catch((e) => {
      tickerCache = null;
      throw e;
    });
  return tickerCache;
}

// chunk 求值即发起请求(先于 React 挂载), 失败置空缓存供组件重试
loadTicker().catch(() => {});

export default function TickerTape() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const pathname = usePathname();
  // 英文页显示英文名(数据文件只有 zh 字段, 名称从 STOCK_MAP 反查)
  const enNames = pathname?.startsWith('/en') ?? false;

  useEffect(() => {
    let alive = true;
    loadTicker()
      .then((d) => alive && Array.isArray(d) && setItems(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const row = (dup: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={dup === 1}>
      {items.map((it) => {
        const up = it.chg >= 0;
        return (
          <span key={`${dup}-${it.key}`} className="group mx-5 inline-flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-ink-950/60">
              {enNames ? STOCK_MAP[it.key]?.en ?? it.zh : it.zh}
            </span>
            <span className="text-ink-950/40">{it.sym}</span>
            <span className="tabular-nums text-ink-950/80 transition-colors group-hover:text-gain">
              {ccyPrefix(it.ccy) + it.price.toFixed(2)}
            </span>
            <span className={`tabular-nums ${up ? 'text-profit' : 'text-loss'}`}>
              {up ? '▲' : '▼'} {Math.abs(it.chg).toFixed(2)}%
            </span>
          </span>
        );
      })}
    </div>
  );

  // 常驻外框(数据未到时占位同高): 避免 ~200-500ms 后走马灯撑开把下方控制条顶下去(CLS)
  return (
    <div className="relative mt-3 flex items-stretch overflow-hidden rounded-lg border border-ink-950/10 bg-white">
      {/* 左端实时信号灯(行情屏语言) */}
      <div className="z-10 flex shrink-0 items-center gap-1.5 border-r border-ink-950/10 bg-white px-3" aria-hidden>
        <span className="wi-live-dot" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-950/55">
          Live
        </span>
      </div>
      {/* 两侧渐隐用 mask 而非色块渐变, 与全页点阵底纹不打架 */}
      <div className="min-w-0 flex-1 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]">
        {items.length ? (
          <div className="wi-marquee flex w-max">
            {row(0)}
            {row(1)}
          </div>
        ) : (
          <div className="h-4" aria-hidden />
        )}
      </div>
    </div>
  );
}
