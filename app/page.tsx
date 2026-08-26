import HomeContent from '@/components/HomeContent';
import type { Metadata } from 'next';

export const revalidate = false;

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    languages: { en: '/en/', 'zh-CN': '/', 'x-default': '/' },
  },
};

const JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '假如当时买了 · WhatIf',
  alternateName: 'WhatIf',
  url: 'https://whatif.axtrivc.com/',
  inLanguage: 'zh-CN',
  description:
    '选一只股票、一个年份、一笔本金，用动画逐日回放长期持有的复利之旅。历史数据模拟，仅供参考。',
}).replace(/</g, '\\u003c');

/** 中文主页(默认语言, 根路径) — 正文在 HomeContent 中英共用 */
export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSONLD }} />
      <HomeContent locale="zh" />
    </>
  );
}
