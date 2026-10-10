/**
 * 格式化层单元测试 — 锁定金额/盈亏/日期展示口径
 * (进位边界: 9999.5万→1亿、999.5K→1.00M、999.995M→1.00B、999.995B→1.00T,
 *  避免出现 10000万 / 1000K / $1000.00M / $1000.00B)
 *
 * 运行: npm test  (node --test 直跑 TS, Node ≥22.6 类型剥离)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateISO,
  dateYM,
  fmtPrice,
  money,
  moneyEn,
  moneyZh,
  multiple,
  pct,
  profit,
  profitEn,
  profitZh,
} from '../lib/format.ts';
import { ccyPrefix, hexToRgb, GAIN, LOSS } from '../lib/tokens.ts';

test('moneyZh: 万/亿/万亿分档与进位边界', () => {
  assert.equal(moneyZh(NaN), '-');
  assert.equal(moneyZh(9494), '9494'); // 不足 1 万原样
  assert.equal(moneyZh(82_000), '8.2万');
  assert.equal(moneyZh(2_090_000), '209万'); // 百万级去小数
  assert.equal(moneyZh(99_994_999), '9999万'); // 边界下不越级
  assert.equal(moneyZh(99_995_000), '1亿'); // 9999.5万 → 1亿, 不出现 10000万
  assert.equal(moneyZh(1.23e8), '1.23亿');
  assert.equal(moneyZh(999_950_000_000), '1万亿');
  assert.equal(moneyZh(-82_000), '-8.2万'); // 负值保号
});

test('moneyEn: K/M/B/T 分档、币种前缀与进位边界', () => {
  assert.equal(moneyEn(950), '$950'); // 整数不带小数
  assert.equal(moneyEn(950.5), '$950.50'); // 非整数带两位小数
  assert.equal(moneyEn(1000), '$1.0K');
  assert.equal(moneyEn(82_000), '$82.0K');
  assert.equal(moneyEn(123_456), '$123K'); // ≥100K 去小数
  assert.equal(moneyEn(999_499), '$999K'); // 边界下不越级
  assert.equal(moneyEn(999_500), '$1.00M'); // 999.5K → 1.00M, 不出现 1000K
  assert.equal(moneyEn(1.23e6), '$1.23M');
  assert.equal(moneyEn(4.87e9), '$4.87B');
  assert.equal(moneyEn(1.5e12), '$1.50T');
  assert.equal(moneyEn(NaN), '-'); // 非有限值守卫
  assert.equal(moneyEn(Infinity), '-');
  assert.equal(moneyEn(-Infinity), '-');
  assert.equal(moneyEn(950, 'HKD'), 'HK$950');
  assert.equal(moneyEn(950, ''), '950'); // 指数类无符号
});

test('profitZh/profitEn: 显式正负号', () => {
  assert.equal(profitZh(9_390_000), '+939万');
  assert.equal(profitZh(-918_300), '-91.83万');
  assert.equal(profitZh(500), '+500');
  assert.equal(profitZh(1.23e8), '+1.23亿');
  assert.equal(profitZh(1e12), '+1万亿');
  assert.equal(profitZh(-1e12), '-1万亿'); // 负值保号
  assert.equal(profitZh(999_949_999_999), '+9999.5亿'); // 边界下不越级
  assert.equal(profitZh(999_950_000_000), '+1万亿'); // 9999.5亿 → 1万亿, 不出现 10000亿
  assert.equal(profitEn(1.23e6), '+$1.23M');
  assert.equal(profitEn(-918_300, 'HKD'), '-HK$918K'); // ≥100K 去小数
});

test('pct/multiple: 百分比与倍数', () => {
  assert.equal(pct(2.4402), '+244.02%');
  assert.equal(pct(-0.9183), '-91.83%');
  assert.equal(pct(0), '+0.00%'); // 零视为正
  assert.equal(pct(0.12345, 1), '+12.3%');
  assert.equal(multiple(24.44), '×24.4');
  assert.equal(multiple(150.2), '×150'); // ≥100 去小数
});

test('日期与真实价格格式', () => {
  assert.equal(dateISO('19960802'), '1996-08-02');
  assert.equal(dateYM('19960802'), '1996-08');
  assert.equal(fmtPrice(null), '-');
  assert.equal(fmtPrice(undefined), '-');
  assert.equal(fmtPrice(26.71), '$26.71');
  assert.equal(fmtPrice(312.4, 'HKD'), 'HK$312.40');
  assert.equal(fmtPrice(1420, 'CNY'), '¥1420.00');
  assert.equal(fmtPrice(4721.31, ''), '4721.31'); // 指数无符号
});

test('money/profit 按语言分发', () => {
  assert.equal(money(82_000, 'zh'), '8.2万');
  assert.equal(money(82_000, 'en'), '$82.0K');
  assert.equal(money(82_000, 'en', 'CNY'), '¥82.0K');
  assert.equal(profit(-91_830, 'zh'), '-9.18万');
  assert.equal(profit(-91_830, 'en'), '-$91.8K');
});

test('tokens: 币种前缀与色彩解析', () => {
  assert.equal(ccyPrefix('USD'), '$');
  assert.equal(ccyPrefix('HKD'), 'HK$');
  assert.equal(ccyPrefix('CNY'), '¥');
  assert.equal(ccyPrefix(''), ''); // 指数类
  assert.equal(ccyPrefix(undefined), '$'); // 缺省 USD
  assert.equal(ccyPrefix('XYZ'), '$'); // 未知币种回退 $
  assert.deepEqual(hexToRgb(GAIN), [212, 43, 58]);
  assert.deepEqual(hexToRgb(LOSS), [14, 159, 118]);
});

// ── 追加: M→B→T 进位边界、万档小数分支接缝、显式正负号 × 币种前缀组合 ──

test('moneyZh: 万档 1/0 位小数接缝与 亿→万亿 边界补全', () => {
  assert.equal(moneyZh(10_000), '1万'); // 跨入万档
  assert.equal(moneyZh(999_999), '100万'); // 1位小数分支四舍五入直进 100万
  assert.equal(moneyZh(1_000_000), '100万'); // 0位小数分支起点, 与上同渲染(接缝无感)
  assert.equal(moneyZh(999_949_999_999), '9999.5亿'); // 万亿门槛下不越级
  assert.equal(moneyZh(-999_950_000_000), '-1万亿'); // 负值在最高档仍保号
  assert.equal(moneyZh(9.87e13), '98.7万亿'); // 万亿档常规值
});

test('moneyEn: M→B→T 进位边界(不出现 $1000.00M / $1000.00B)', () => {
  assert.equal(moneyEn(999_994_999), '$999.99M'); // B 门槛下不越级
  assert.equal(moneyEn(999_995_000), '$1.00B'); // 999.995M → 1.00B
  assert.equal(moneyEn(999_994_999_999), '$999.99B'); // T 门槛下不越级
  assert.equal(moneyEn(999_995_000_000), '$1.00T'); // 999.995B → 1.00T
  assert.equal(moneyEn(999_500, 'CNY'), '¥1.00M'); // 币种前缀在进位边界同样生效
});

test('profitZh: 万档两条小数分支与 亿 门槛接缝', () => {
  assert.equal(profitZh(9_999), '+9999'); // 不足 1 万原样(仍带显式正号)
  assert.equal(profitZh(10_000), '+1万'); // 跨入万档
  assert.equal(profitZh(12_345), '+1.23万'); // 1e4~1e6 走 2 位小数分支
  assert.equal(profitZh(999_999), '+100万'); // 2 位小数分支进位到 100万
  assert.equal(profitZh(1_000_000), '+100万'); // ≥1e6 改走 0 位小数分支, 与上同渲染
  assert.equal(profitZh(99_994_999), '+9999万'); // 亿门槛下不越级
  assert.equal(profitZh(99_995_000), '+1亿'); // 9999.5万 → 1亿
  assert.equal(profitZh(0), '+0'); // 零视为正
  assert.equal(profitZh(-500), '-500');
});

test('profitEn: K→M 边界、指数类无符号、负号先于币种前缀', () => {
  assert.equal(profitEn(999_499), '+$999K'); // M 门槛下不越级
  assert.equal(profitEn(999_500), '+$1.00M'); // 999.5K → 1.00M
  assert.equal(profitEn(1_500, ''), '+1.5K'); // 指数类: 无币种前缀但保留显式正号
  assert.equal(profitEn(-2_000_000, 'CNY'), '-¥2.00M'); // 负号在币种前缀之前
  assert.equal(profitEn(0), '+$0'); // 零视为正
});

test('pct/fmtPrice/ccyPrefix: 负零、零价与 null 币种守卫', () => {
  assert.equal(pct(-0), '+0.00%'); // 负零视为正, 不出现 -0.00%
  assert.equal(fmtPrice(NaN), '-'); // 非有限值守卫
  assert.equal(fmtPrice(0), '$0.00'); // 零价仍带两位小数
  assert.equal(ccyPrefix(null), '$'); // null 视同缺省 USD(签名允许 null)
});

// ── 追加: moneyEn 负号在币种前缀之前(对齐 profitEn 口径) + moneyZh 底档 9999.5 进位守卫 ──

test('moneyEn: 负值负号在币种前缀之前(不出现 $-82.0K)', () => {
  assert.equal(moneyEn(-82_000), '-$82.0K');
  assert.equal(moneyEn(-950), '-$950'); // 整数不带小数
  assert.equal(moneyEn(-1.23e6), '-$1.23M');
  assert.equal(moneyEn(-123_456), '-$123K'); // ≥100K 去小数
  assert.equal(moneyEn(-999_500), '-$1.00M'); // 999.5K → 1.00M, 不出现 1000K
});

test('moneyZh: 底档 9999.5 进位守卫(不出现无单位 10000)', () => {
  assert.equal(moneyZh(9_999.5), '1万');
  assert.equal(moneyZh(9_999.4), '9999'); // 门槛下原样
  assert.equal(moneyZh(-9_999.5), '-1万'); // 负值保号
});
