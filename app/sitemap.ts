import type { MetadataRoute } from 'next';
import { STOCKS } from '@/lib/stocks';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://whatif.axtrivc.com';
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    ...STOCKS.map((s) => ({
      url: `${base}/p/${s.key}/`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
