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
  const title = `假如${firstYear}年买入${meta.zh}，今天值多少钱？`;
  const description = `${meta.zh}(${meta.symbol}) ${firstYear} 年至今的历史回测：动画回放${meta.zh}的长期回报，支持任意年份与本金。后复权口径，历史模拟仅供参考。`;
  return {
    title,
    description,
    alternates: {
      canonical: `/p/${key}/`,
      languages: { en: `/en/p/${key}/`, 'zh-CN': `/p/${key}/`, 'x-default': `/p/${key}/` },
    },
    openGraph: {
      title,
      description,
      url: `/p/${key}/`,
      type: 'website',
    },
  };
}

export default async function StockLanding({ params }: Props) {
  const { stock: key } = await params;
  const meta = STOCK_MAP[key];
  const series = meta ? await loadSeries(key) : null;
  if (!meta || !series) notFound();

  return <StockLandingContent locale="zh" meta={meta} series={series} />;
}
