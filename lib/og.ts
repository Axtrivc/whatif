/**
 * OG 分享图共用层 — zh/en 两份 opengraph-image.tsx 的唯一来源
 *
 * 内容: 构建期倍数实算(ogMultiple) + 排版常量(OG_STYLE, 不许各写一套)
 *      + CJK 子集字体加载(satori 默认字体不含中文, 缺字形会渲染成空白方框)
 *
 * 字体: app/og-assets/og-zh.woff 由 scripts/build-og-font.mjs 产出并入库
 *      (仅文案变化时手工跑 npm run og-font)。是 .woff 而非 .woff2 —
 *      next/og 内置的 opentype 解析器不认 woff2 签名(无 brotli 解码)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { GAIN } from './tokens';

/** OG 排版常量 — Terminal Minimal(白底 + 点阵 + 角括号, 强调色仅 GAIN) */
export const OG_STYLE = {
  pad: 84, // 四周留白(标题区 padding 与底部细线/站名的对齐基准)
  dot: { grid: 24, r: 1.4, alpha: 0.055 }, // 蓝图点阵: 网格 24px, 半径 1.4px, 透明度
  titleSize: 78, // 标题字号
  titleWeight: 700,
  rowSize: 33, // 数据行字号
  brandSize: 27, // 底部站名字号
  bracket: { size: 44, width: 4 }, // 对角 HUD 角括号: 边长与描边宽
} as const;

/** 点阵止点百分比: satori 把 px 单位的 radial-gradient 止点按元素整体尺寸归一化,
 *  1.4px 会被缩成亚像素 → 点阵消失(线上 /en/opengraph-image 即此问题, 字节级实测纯白)。
 *  改用相对 farthest-corner 半径(网格对角/2)的百分比: r=1.4px / (24/2·√2) ≈ 8%,
 *  渲染出的点径与 CSS 原设计一致(已用 PNG 解码采样验证 minGray=242) */
const dotStopPct = Math.round((OG_STYLE.dot.r / ((OG_STYLE.dot.grid / 2) * Math.SQRT2)) * 100);

/** 点阵底纹 backgroundImage 值(由 OG_STYLE.dot 派生, 两站同源) */
export const OG_DOT_BG = `radial-gradient(rgba(17,17,20,${OG_STYLE.dot.alpha}) ${dotStopPct}%, transparent ${dotStopPct}%)`;

/** OG 用色 — 引用设计令牌, 禁手写色值(DOM/canvas/海报同源) */
export const OG_COLOR = { bg: '#ffffff', ink: '#111114', gain: GAIN } as const;

/** 构建期读 public/data/{key}.json, 实算指定年份首日持有至今的倍数;
 *  文件缺失/找不到年份/非正价返回 null(数据行该项不渲染) */
export function ogMultiple(key: string, yearPrefix: string): number | null {
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

export const OG_FONT_FAMILY = 'Noto Sans SC';

/** 构建期读子集字体(读失败给出可操作的提示, 而非裸 ENOENT) */
export function ogFontData(): Buffer {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'app', 'og-assets', 'og-zh.woff'));
  } catch {
    throw new Error('缺 app/og-assets/og-zh.woff — 先跑 npm run og-font 生成子集字体');
  }
}
