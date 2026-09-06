/**
 * 格式化层单元测试 — 锁定金额/盈亏/日期展示口径
 * (进位边界: 9999.5万→1亿、999.5K→1.00M, 避免出现 10000万 / 1000K)
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
  assert.equal(moneyEn(950, 'HKD'), 'HK$950');
  assert.equal(moneyEn(950, ''), '950'); // 指数类无符号
});

test('profitZh/profitEn: 显式正负号', () => {
  assert.equal(profitZh(9_390_000), '+939万');
  assert.equal(profitZh(-918_300), '-91.83万');
  assert.equal(profitZh(500), '+500');
  assert.equal(profitZh(1.23e8), '+1.23亿');
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
