import Link from 'next/link';
import LangSwitch from '@/components/LangSwitch';
import { dict, lp, type Locale } from '@/lib/i18n';

interface Props {
  locale: Locale;
  /** 右侧主行动: 链接与文案由调用方决定(首页=直接开玩, 落地页=看该标的动画) */
  ctaHref: string;
  ctaLabel: string;
}

/** 全站统一站头 — 品牌标识(问号方块 + 站名/副行) + 语言切换 + 主行动按钮 */
export default function SiteHeader({ locale, ctaHref, ctaLabel }: Props) {
  const t = dict(locale);
  return (
    <header className="flex items-center justify-between py-6">
      <Link href={lp(locale, '/')} className="flex items-center gap-2.5" aria-label={t.siteName}>
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-950 text-lg font-black text-white"
        >
          ?
        </span>
        <span>
          <span className="block text-base font-extrabold leading-tight">{t.siteName}</span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-950/40">
            {t.brandSub}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <LangSwitch locale={locale} />
        <Link
          href={ctaHref}
          className="rounded-md border border-ink-950/10 bg-white px-4 py-1.5 text-xs font-semibold text-ink-950/60 transition hover:border-ink-950/30 hover:text-ink-950"
        >
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}
