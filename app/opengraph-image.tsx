import { ImageResponse } from 'next/og';
import { multiple } from '@/lib/format';
import { SITE_HOST } from '@/lib/site';
import { STOCK_MAP } from '@/lib/stocks';
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
export const alt = '假如当时买了… — WhatIf 回测模拟报告';

/** 中文站根分享图(构建期生成, 取代手写数字已严重过期的旧静态分享图) —
 *  排版常量与 CJK 字体均取自 lib/og.ts(与英文站 OG 同源),
 *  标题两行镜像首页 hero「假如当时 / 买了…」(副行 GAIN 红),
 *  数据行三组构建期实算(微软 1996 / 比特币 2013 / 英伟达 2015),
 *  数字随 public/data 刷新自动正确 */
export default function OgImage() {
  // 数据行倍数(构建期实算)
  const msftX = ogMultiple('msft', '1996');
  const btcX = ogMultiple('btc', '2013');
  const nvdaX = ogMultiple('nvda', '2015');
  const nameOf = (key: string): string => STOCK_MAP[key]?.zh ?? key;

  // 角括号公共样式
  const bracket = {
    position: 'absolute',
    width: `${OG_STYLE.bracket.size}px`,
    height: `${OG_STYLE.bracket.size}px`,
  } as const;

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

        {/* 标题两行镜像首页 hero, 副行 GAIN 红 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: `${OG_STYLE.titleSize}px`, fontWeight: OG_STYLE.titleWeight, lineHeight: 1.14 }}>
            假如当时
          </div>
          <div style={{ fontSize: `${OG_STYLE.titleSize}px`, fontWeight: OG_STYLE.titleWeight, lineHeight: 1.14, color: OG_COLOR.gain }}>
            买了…
          </div>
        </div>

        {/* 数据行: 构建期实算, 随数据刷新自动正确 */}
        <div style={{ display: 'flex', marginTop: '36px', opacity: 0.62 }}>
          {/* 模板字符串合并为单文本子节点: satori 要求多子节点元素显式 display */}
          {msftX != null && <div style={{ fontSize: `${OG_STYLE.rowSize}px`, marginRight: '44px' }}>{`${nameOf('msft')} 1996 ${multiple(msftX)}`}</div>}
          {btcX != null && <div style={{ fontSize: `${OG_STYLE.rowSize}px`, marginRight: '44px' }}>{`${nameOf('btc')} 2013 ${multiple(btcX)}`}</div>}
          {nvdaX != null && <div style={{ fontSize: `${OG_STYLE.rowSize}px` }}>{`${nameOf('nvda')} 2015 ${multiple(nvdaX)}`}</div>}
        </div>

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
