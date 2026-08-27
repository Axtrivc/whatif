import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'What if you had bought Microsoft in 1996?';

/** 英文主页 OG 分享图(构建期生成, 替代根目录的中文 og.png) */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f4f4f6 100%)',
          color: '#111114',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 44, opacity: 0.55, marginBottom: 24 }}>
          WhatIf · whatif.axtrivc.com
        </div>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, lineHeight: 1.2 }}>
          What if you had bought
        </div>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 900, lineHeight: 1.2, color: '#d42b3a' }}>
          back then?
        </div>
        <div style={{ display: 'flex', fontSize: 40, opacity: 0.6, marginTop: 36 }}>
          Microsoft in 1996 → ×94.9 · Bitcoin in 2013 → ×373
        </div>
      </div>
    ),
    size
  );
}
