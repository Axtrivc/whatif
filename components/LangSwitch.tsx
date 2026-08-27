'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n';

/** 语言切换: 保持当前路径, 仅换 locale 前缀(中文无前缀 ↔ /en) */
export default function LangSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const target: Locale = locale === 'zh' ? 'en' : 'zh';

  let href = pathname ?? '/';
  if (target === 'en') href = `/en${href === '/' ? '' : href}`;
  else href = href.replace(/^\/en/, '') || '/';

  return (
    <Link
      href={href}
      lang={target === 'en' ? 'en' : 'zh-CN'}
      aria-label={target === 'en' ? 'Switch to English' : '切换到中文'}
      className="rounded-full border border-ink-950/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950/60 transition hover:border-ink-950/25 hover:text-ink-950"
    >
      {target === 'en' ? 'EN' : '中'}
    </Link>
  );
}
