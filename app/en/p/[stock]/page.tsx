import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StockLandingContent from '@/components/StockLandingContent';
import { dict } from '@/lib/i18n';
import { loadSeries, STOCK_MAP } from '@/lib/stocks';

interface Props {
  params: Promise<{ stock: string }>;
}

export function generateStaticParams() {
  return Object.keys(STOCK_MAP).map((stock) => ({ stock }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stock: key } = await params;
  const meta = STOCK_MAP[key];
  if (!meta) return {};
  const series = await loadSeries(key);
  const firstYear = series ? series.first.slice(0, 4) : '';
  // metadata 与页面 H1 同源(landingTitle), 避免双源漂移; 描述走 landingMetaDesc
  const t = dict('en');
  const title = t.landingTitle(firstYear, meta.en, meta.symbol);
  const description = t.landingMetaDesc(meta.en, meta.symbol, firstYear);
  return {
    title,
    description,
    alternates: {
      canonical: `/en/p/${key}/`,
      languages: { en: `/en/p/${key}/`, 'zh-CN': `/p/${key}/`, 'x-default': `/p/${key}/` },
    },
    openGraph: {
      title,
      description,
      url: `/en/p/${key}/`,
      type: 'website',
      // 页面级 openGraph 会整体替换根 layout 的(浅合并), siteName/locale 必须显式带回
      siteName: 'WhatIf',
      locale: 'en_US',
      images: [{ url: `/en/p/${key}/opengraph-image`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', images: [`/en/p/${key}/opengraph-image`] },
  };
}

export default async function StockLandingEn({ params }: Props) {
  const { stock: key } = await params;
  const meta = STOCK_MAP[key];
  const series = meta ? await loadSeries(key) : null;
  if (!meta || !series) notFound();

  return <StockLandingContent locale="en" meta={meta} series={series} />;
}
