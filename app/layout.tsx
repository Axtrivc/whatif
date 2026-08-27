import type { Metadata, Viewport } from 'next';
import HtmlLang from '@/components/HtmlLang';
import './globals.css';

export const SITE = 'whatif.axtrivc.com';

export const metadata: Metadata = {
  metadataBase: new URL(`https://${SITE}`),
  title: {
    default: '假如当时买了 · WhatIf — 投资回放动画',
    template: '%s · WhatIf',
  },
  description:
    '假如 1996 年买入微软、2010 年买入比特币，今天值多少钱？选一只股票、一个年份、一笔本金，看动画回放复利的奇迹。历史模拟，仅供参考。',
  keywords: [
    '假如当时买了',
    '投资回测',
    '复利计算',
    '股票收益计算器',
    'what if I invested',
    'stock return calculator',
  ],
  openGraph: {
    type: 'website',
    siteName: 'WhatIf',
    title: '假如当时买了 · WhatIf',
    description: '选一只股票、一个年份、一笔本金，看动画回放复利的奇迹。',
    locale: 'zh_CN',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '假如1996年买入微软，今天值多少钱' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export const viewport: Viewport = {
  themeColor: '#fafafa',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="wi-blueprint min-h-dvh bg-[#fafafa] text-ink-950 antialiased">
        <HtmlLang />
        {children}
      </body>
    </html>
  );
}
