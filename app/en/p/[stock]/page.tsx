import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StockLandingContent from '@/components/StockLandingContent';
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
  const title = `If you bought ${meta.en} (${meta.symbol}) in ${firstYear}, what would it be worth today?`;
  const description = `Historical backtest of ${meta.en} (${meta.symbol}) since ${firstYear}: an animated replay of its long-term return, with any year and amount. Total-return basis, simulation for reference only.`;
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
    },
  };
}

export default async function StockLandingEn({ params }: Props) {
  const { stock: key } = await params;
  const meta = STOCK_MAP[key];
  const series = meta ? await loadSeries(key) : null;
  if (!meta || !series) notFound();

  return <StockLandingContent locale="en" meta={meta} series={series} />;
}
