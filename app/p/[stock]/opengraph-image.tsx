import { ImageResponse } from 'next/og';
import { multiple } from '@/lib/format';
import { SITE_HOST } from '@/lib/site';
import { loadSeries, STOCK_MAP } from '@/lib/stocks';
import {
  OG_COLOR,
  OG_DOT_BG,
  OG_FONT_FAMILY,
  OG_STYLE,
  ogFontData,
  ogMultiple,
} from '@/lib/og';

export const dynamic = 'force-static';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = '假如当时买了 · WhatIf 回测模拟报告';

/** 与同目录 page.tsx 的静态参数一致(动态段的图片路由须自带, 页面的不传导) */
export function generateStaticParams() {
  return Object.keys(STOCK_MAP).map((stock) => ({ stock }));
}

interface Props {
  params: Promise<{ stock: string }>;
}

/** 标的级 OG 分享图(zh) — 静态导出按页面 generateStaticParams 为每个标的各生成一张,
 *  布局复用 lib/og.ts 的 OG_STYLE 与 og-zh 子集字体(与站点级 OG 同源):
 *  标的名大字 + 「假如 {首年} 年买入 → ×N」数据行(构建期按 public/data 实算)
 *  + 底部站名; 分享图文与落地页一一对应, 取代旧的全站共用静态分享图。
 *  注意: alt 是模块级静态导出无法随 params 变化, 取站点级标题兜底。 */
export default async function OgImage({ params }: Props) {
  const { stock: key } = await params;
  const meta = STOCK_MAP[key];
  const series = await loadSeries(key);
  const firstYear = series ? series.first.slice(0, 4) : '';
  const name = meta?.zh ?? key;
  const x = firstYear ? ogMultiple(key, firstYear) : null;

  // 角括号公共样式(与站点级 OG 一致)
  const bracket = {
    position: 'absolute',
    width: `${OG_STYLE.bracket.size}px`,
    height: `${OG_STYLE.bracket.size}px`,
  } as const;
  // 标的级数据行字号: 单行即主数据, 介于 rowSize(33) 与 titleSize(78) 之间一档
  const rowBig = 44;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `${OG_STYLE.pad}px`,
          background: OG_COLOR.bg,
          backgroundImage: OG_DOT_BG,
          backgroundSize: `${OG_STYLE.dot.grid}px ${OG_STYLE.dot.grid}px`,
          color: OG_COLOR.ink,
          fontFamily: OG_FONT_FAMILY,
        }}
      >
        {/* 对角 HUD 角括号 */}
        <div
          style={{
            ...bracket,
            top: '26px',
            left: '26px',
            borderTop: `${OG_STYLE.bracket.width}px solid rgba(17,17,20,0.45)`,
            borderLeft: `${OG_STYLE.bracket.width}px solid rgba(17,17,20,0.45)`,
          }}
        />
        <div
          style={{
            ...bracket,
            bottom: '26px',
            right: '26px',
            borderBottom: `${OG_STYLE.bracket.width}px solid rgba(17,17,20,0.45)`,
            borderRight: `${OG_STYLE.bracket.width}px solid rgba(17,17,20,0.45)`,
          }}
        />

        {/* eyebrow: 红方块 + 引擎标签 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
          <div style={{ width: '15px', height: '15px', background: OG_COLOR.gain, marginRight: '16px' }} />
          <div style={{ fontSize: '25px', letterSpacing: '8px', opacity: 0.48 }}>WHATIF // 回测模拟报告</div>
        </div>

        {/* 标的名大字 + 代码 */}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <div style={{ fontSize: `${OG_STYLE.titleSize}px`, fontWeight: OG_STYLE.titleWeight, lineHeight: 1.14 }}>
            {name}
          </div>
          {meta && (
            <div style={{ fontSize: `${OG_STYLE.rowSize}px`, opacity: 0.45, letterSpacing: '3px', marginLeft: '24px' }}>
              {meta.symbol}
            </div>
          )}
        </div>

        {/* 数据行: 构建期实算, 倍数 GAIN 红(强调色仅 GAIN) */}
        {firstYear && (
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: '38px' }}>
            {/* 模板字符串合并为单文本子节点: satori 要求多子节点元素显式 display */}
            <div style={{ display: 'flex', fontSize: `${rowBig}px`, opacity: 0.68 }}>{`假如 ${firstYear} 年买入`}</div>
            {x != null && (
              <div
                style={{
                  display: 'flex',
                  fontSize: `${rowBig}px`,
                  fontWeight: 700,
                  color: OG_COLOR.gain,
                  marginLeft: '22px',
                }}
              >{`→ ${multiple(x)}`}</div>
            )}
          </div>
        )}

        {/* 底部细线 + 站名 */}
        <div
          style={{
            position: 'absolute',
            left: `${OG_STYLE.pad}px`,
            right: `${OG_STYLE.pad}px`,
            bottom: '96px',
            height: '2px',
            background: 'rgba(17,17,20,0.14)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${OG_STYLE.pad}px`,
            bottom: '44px',
            display: 'flex',
            fontSize: `${OG_STYLE.brandSize}px`,
            opacity: 0.5,
          }}
        >
          {SITE_HOST}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: OG_FONT_FAMILY, data: ogFontData(), weight: 400, style: 'normal' }],
    }
  );
}
