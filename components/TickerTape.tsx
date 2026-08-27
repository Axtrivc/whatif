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
  price: number;
  chg: number;
}

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

  if (!items.length) return null;

  const row = (dup: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={dup === 1}>
      {items.map((it) => {
        const up = it.chg >= 0;
        return (
          <span key={`${dup}-${it.key}`} className="mx-5 inline-flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-ink-950/60">
              {enNames ? STOCK_MAP[it.key]?.en ?? it.zh : it.zh}
            </span>
            <span className="text-ink-950/40">{it.sym}</span>
            <span className="tabular-nums text-ink-950/80 transition-colors group-hover:text-gain">
              {it.sym === 'SPX' ? it.price.toFixed(2) : `$${it.price.toFixed(2)}`}
            </span>
            <span className={`tabular-nums ${up ? 'text-profit' : 'text-loss'}`}>
              {up ? '▲' : '▼'} {Math.abs(it.chg).toFixed(2)}%
            </span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border border-ink-950/8 bg-black/[0.03] py-2">
      {/* 左右渐隐遮罩 */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#fafafa] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#fafafa] to-transparent" />
      <div className="wi-marquee flex w-max">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
