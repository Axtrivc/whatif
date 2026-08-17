import fs from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';
import { STOCKS } from '@/lib/stocks';

export const dynamic = 'force-static';

interface ManifestEntry {
  first: string; // YYYYMMDD
  last: string;
  points: number;
}

/** 构建期读 public/data/index.json, 让 lastModified 用真实数据日期而非构建时刻 */
function dataManifest(): Record<string, ManifestEntry> {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'index.json'), 'utf8')
    );
  } catch {
    return {};
  }
}

const ymdToDate = (ymd: string): Date => {
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8) || '01'}T00:00:00Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://whatif.axtrivc.com';
  const manifest = dataManifest();
  const entryDates: Date[] = STOCKS.map((s) => {
    const last = manifest[s.key]?.last;
    return last ? ymdToDate(last) : new Date();
  });
  const homeLast = entryDates.reduce((acc, d) => (d > acc ? d : acc), new Date(0));
  return [
    {
      url: `${base}/`,
      lastModified: homeLast,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...STOCKS.map((s, i) => ({
      url: `${base}/p/${s.key}/`,
      lastModified: entryDates[i],
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
