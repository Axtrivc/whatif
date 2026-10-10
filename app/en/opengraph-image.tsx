import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { multiple } from '@/lib/format';
import { SITE_HOST } from '@/lib/site';

export const dynamic = 'force-static';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'What if you had bought Microsoft in 1996?';

/** 构建期读 public/data/{key}.json, 实算指定年份首日持有至今的倍数;
 *  文件缺失/找不到年份/非正价返回 null(数据行该项不渲染) */
function ogMultiple(key: string, yearPrefix: string): number | null {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'public', 'data', `${key}.json`), 'utf8')
    ) as { dates: string[]; closes: number[] };
    const i = data.dates.findIndex((d) => d.slice(0, 4) === yearPrefix);
    if (i < 0 || !(data.closes[i] > 0)) return null;
    return data.closes[data.closes.length - 1] / data.closes[i];
  } catch {
    return null;
  }
}

/** 英文主页 OG 分享图(构建期生成) — 与站点一致的 Terminal Minimal 视觉:
 *  纯白 + 蓝图点阵底纹 + 对角 HUD 角括号 + 数据行
 *  数据行构建期从 public/data 实算, 随数据更新自动刷新 */
export default function OgImage() {
  // 数据行倍数(构建期实算)
  const msftX = ogMultiple('msft', '1996');
  const btcX = ogMultiple('btc', '2013');
  const nvdaX = ogMultiple('nvda', '2015');

  // 角括号公共样式
  const bracket = {
    position: 'absolute',
    width: '44px',
    height: '44px',
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
          padding: '84px',
          background: '#ffffff',
          backgroundImage: 'radial-gradient(rgba(17,17,20,0.055) 1.4px, transparent 1.4px)',
          backgroundSize: '24px 24px',
          color: '#111114',
        }}
      >
        {/* 对角 HUD 角括号 */}
        <div
          style={{
            ...bracket,
            top: '26px',
            left: '26px',
            borderTop: '4px solid rgba(17,17,20,0.45)',
            borderLeft: '4px solid rgba(17,17,20,0.45)',
          }}
        />
        <div
          style={{
            ...bracket,
            bottom: '26px',
            right: '26px',
            borderBottom: '4px solid rgba(17,17,20,0.45)',
            borderRight: '4px solid rgba(17,17,20,0.45)',
          }}
        />

        {/* eyebrow: 红方块 + 引擎标签 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
          <div style={{ width: '15px', height: '15px', background: '#d42b3a', marginRight: '16px' }} />
          <div
            style={{
              fontSize: '25px',
              letterSpacing: '8px',
              opacity: 0.48,
              textTransform: 'uppercase',
            }}
          >
            WhatIf // Replay Engine
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '78px', fontWeight: 700, lineHeight: 1.14 }}>
            What if you had bought
          </div>
          <div style={{ fontSize: '78px', fontWeight: 700, lineHeight: 1.14, color: '#d42b3a' }}>
            back then?
          </div>
        </div>

        {/* 数据行 */}
        <div style={{ display: 'flex', marginTop: '36px', opacity: 0.62 }}>
          {/* 模板字符串合并为单文本子节点: satori 要求多子节点元素显式 display */}
          {msftX != null && <div style={{ fontSize: '33px', marginRight: '44px' }}>{`Microsoft 1996 ${multiple(msftX)}`}</div>}
          {btcX != null && <div style={{ fontSize: '33px', marginRight: '44px' }}>{`Bitcoin 2013 ${multiple(btcX)}`}</div>}
          {nvdaX != null && <div style={{ fontSize: '33px' }}>{`NVIDIA 2015 ${multiple(nvdaX)}`}</div>}
        </div>

        {/* 底部细线 + 站名 */}
        <div
          style={{
            position: 'absolute',
            left: '84px',
            right: '84px',
            bottom: '96px',
            height: '2px',
            background: 'rgba(17,17,20,0.14)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '84px',
            bottom: '44px',
            display: 'flex',
            fontSize: '27px',
            opacity: 0.5,
          }}
        >
          {SITE_HOST}
        </div>
      </div>
    ),
    size
  );
}
