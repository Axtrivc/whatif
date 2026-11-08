'use client';

/**
 * 行情走马灯 — 交易所行情屏风格的无限横向滚动条
 * 数据: /data/ticker.json({ asOf, items }, 抓取时生成, 各标的最新真实价+日涨跌)
 * 渲染两遍内容 + translateX(-50%) 实现无缝循环
 * 陈旧降级: asOf 距今 >14 天时左端 Live 信号灯转静态墨点、标签改「数据截至」—
 * 不冒充实时(全部东财标的曾陈旧 58-72 天仍亮着 Live)
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { STOCK_MAP } from '@/lib/stocks';
import { dict } from '@/lib/i18n';

interface TickerItem {
  key: string;
  zh: string;
  sym: string;
  ccy?: string; // 计价货币; '' = 指数无符号, 缺省 USD(旧数据文件兼容)
  price: number;
  chg: number;
}

interface TickerPayload {
  asOf: string; // 数据截至日 YYYYMMDD(全部数据文件 last 最大值)
  items: TickerItem[];
}

/** 币种前缀统一取自设计令牌 */
import { ccyPrefix, toneClsText } from '@/lib/tokens';

/** 模块级缓存: 首页↔回放往返等重复挂载不再重新请求; 失败不缓存以便重试 */
let tickerCache: Promise<TickerPayload> | null = null;

function loadTicker(): Promise<TickerPayload> {
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
  const [asOf, setAsOf] = useState('');
  const [paused, setPaused] = useState(false); // 键盘暂停态(WCAG 2.2.2: 移动不止可暂停可聚焦可关闭)
  const pathname = usePathname();
  // 英文页显示英文名(数据文件只有 zh 字段, 名称从 STOCK_MAP 反查)
  const enNames = pathname?.startsWith('/en') ?? false;
  const t = dict(enNames ? 'en' : 'zh');

  useEffect(() => {
    let alive = true;
    loadTicker().then((d) => {
      if (!alive || !d || !Array.isArray(d.items)) return;
      setItems(d.items);
      setAsOf(typeof d.asOf === 'string' ? d.asOf : '');
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // asOf 距今 >14 天 → 陈旧降级: 信号灯停呼吸、标签如实标注数据截至日
  const asOfAgeDays = /^\d{8}$/.test(asOf)
    ? Math.floor((Date.now() - Date.UTC(+asOf.slice(0, 4), +asOf.slice(4, 6) - 1, +asOf.slice(6, 8))) / 86_400_000)
    : 0;
  const stale = asOfAgeDays > 14;

  const row = (dup: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={dup === 1}>
      {items.map((it) => {
        const up = it.chg >= 0;
        // 12px 小字绿一律文本安全档 text-loss-strong(白底 AA): en 绿涨, zh 绿跌;
        // 红用 gain/profit 同色 #d42b3a(4.8:1 已达标, zh 涨位视觉不变)
        const tone = toneClsText(enNames ? 'en' : 'zh');
        return (
          <span key={`${dup}-${it.key}`} className="group mx-5 inline-flex items-baseline gap-1.5 font-mono text-xs">
            <span className="text-ink-950/60">
              {enNames ? STOCK_MAP[it.key]?.en ?? it.zh : it.zh}
            </span>
            <span className="text-ink-950/60">{it.sym}</span>
            <span className="tabular-nums text-ink-950/80 transition-colors group-hover:text-gain">
              {ccyPrefix(it.ccy) + it.price.toFixed(2)}
            </span>
            <span className={`tabular-nums ${up ? tone.up : tone.down}`}>
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
      {/* 左端实时信号灯(行情屏语言); 陈旧态降级: 呼吸点转静态墨点, Live 改数据截至 */}
      <div className="z-10 flex shrink-0 items-center gap-1.5 border-r border-ink-950/10 bg-white px-3" aria-hidden>
        <span className="wi-live-dot" style={stale ? { animation: 'none' } : undefined} />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-950/60">
          {stale ? t.dataAsOf(asOf) : 'Live'}
        </span>
      </div>
      {/* 两侧渐隐用 mask 而非色块渐变, 与全页点阵底纹不打架;
          容器可聚焦可键盘暂停(WCAG 2.2.2), :hover 暂停保留在 globals.css */}
      <div
        className="min-w-0 flex-1 overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]"
        tabIndex={0}
        role="button"
        aria-label={t.tapeToggle}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          setPaused((p) => !p);
        }}
      >
        {items.length ? (
          <div
            className="wi-marquee flex w-max"
            style={paused ? { animationPlayState: 'paused' } : undefined}
          >
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
