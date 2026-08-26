'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** 静态导出下 <html> 只有一个, 按路径前缀同步 document lang(辅助屏幕阅读器/翻译工具) */
export default function HtmlLang() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = pathname?.startsWith('/en') ? 'en' : 'zh-CN';
  }, [pathname]);
  return null;
}
