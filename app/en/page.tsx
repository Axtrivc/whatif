import HomeContent from '@/components/HomeContent';
import type { Metadata } from 'next';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'What If You Had Bought — Investment Replay',
  description:
    'If you had bought Microsoft in 1996 or Bitcoin in 2010, what would it be worth today? Pick a stock, a year, an amount, and watch an animated replay of compound interest. Historical simulation, for reference only.',
  alternates: {
    canonical: '/en/',
    languages: { en: '/en/', 'zh-CN': '/', 'x-default': '/' },
  },
  openGraph: {
    title: 'What If You Had Bought · WhatIf',
    description: 'Pick a stock, a year, an amount. Watch compound interest turn time into a miracle.',
    locale: 'en_US',
    url: '/en/',
    images: [{ url: '/en/opengraph-image', width: 1200, height: 630, alt: 'What if you had bought Microsoft in 1996?' }],
  },
  twitter: { card: 'summary_large_image', images: ['/en/opengraph-image'] },
};

const JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'What If You Had Bought · WhatIf',
  alternateName: 'WhatIf',
  url: 'https://whatif.axtrivc.com/en/',
  inLanguage: 'en',
  description:
    'Pick a stock, a year, and an amount, then replay the compounding journey of long-term holding day by day. Historical simulation, for reference only.',
}).replace(/</g, '\\u003c');

/** 英文主页(/en/) — 与中文主页共用 HomeContent 正文 */
export default function HomeEn() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSONLD }} />
      <HomeContent locale="en" />
    </>
  );
}
