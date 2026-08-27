/**
 * 回放引擎单元测试 — 锁定核心数学行为(DCA 份额法 / 回撤 / CAGR / 边界)
 *
 * 运行: npm test  (node --test 直跑 TS, Node ≥22.6 类型剥离)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats,
  dcaInvested,
  dcaSeries,
  durationFor,
  indexAtT,
  investedSeries,
  type ReplayInput,
} from '../lib/engine.ts';

/** 造一个最小输入 */
function mk(dates: string[], closes: number[], extra: Partial<ReplayInput> = {}): ReplayInput {
  return { dates, closes, start: 0, end: closes.length - 1, amount: 1000, ...extra };
}

test('一次性买入: 资产 = 本金 × 价格比值', () => {
  const input = mk(['20200101', '20200102', '20200103'], [100, 110, 120]);
  const s = dcaSeries(input);
  assert.deepEqual([...s], [1000, 1100, 1200]);
});

test('一次性买入: 单调上涨最大回撤为 0', () => {
  const input = mk(['20200101', '20200102', '20200103'], [100, 110, 120]);
  const stats = computeStats(input);
  assert.equal(stats.maxDrawdown, 0);
  assert.equal(stats.finalValue, 1200);
  assert.ok(Math.abs(stats.returnPct - 0.2) < 1e-12); // 浮点: 1200/1000-1
  assert.ok(Math.abs(stats.multiple - 1.2) < 1e-12);
  assert.equal(stats.profit, 200);
  assert.equal(stats.invested, undefined); // lump-sum 无 invested 字段
});

test('腰斩再收复: 最大回撤 50%', () => {
  const input = mk(['20200101', '20200102', '20200103'], [100, 50, 100]);
  const stats = computeStats(input);
  assert.ok(Math.abs(stats.maxDrawdown - 0.5) < 1e-12);
  assert.equal(stats.finalValue, 1000); // 收复前高
});

test('DCA 份额法: 每月首个交易日注入, 份额累计', () => {
  // 1 月两天 + 2 月两天; closes 中途腰斩再翻倍
  const input = mk(
    ['20200101', '20200102', '20200203', '20200204'],
    [10, 20, 10, 20],
    { amount: 1000, monthly: 500 }
  );
  const s = [...dcaSeries(input)];
  // j0: 1000/10=100 份 ×10 = 1000
  assert.equal(s[0], 1000);
  // j1: 100 份 ×20 = 2000
  assert.equal(s[1], 2000);
  // j2: 2 月首个交易日追加 500/10=50 份 → 150 份 ×10 = 1500
  assert.equal(s[2], 1500);
  // j3: 150 ×20 = 3000
  assert.equal(s[3], 3000);
});

test('DCA 累计投入序列与总量一致(首笔月不计月投)', () => {
  const input = mk(
    ['20200101', '20200102', '20200203', '20200204'],
    [10, 20, 10, 20],
    { amount: 1000, monthly: 500 }
  );
  assert.deepEqual([...investedSeries(input)], [1000, 1000, 1500, 1500]);
  assert.equal(dcaInvested(input), 1500);
});

test('computeStats: finalValue/invested 与 returnPct/multiple 自洽', () => {
  const input = mk(
    ['20200101', '20200102', '20200203', '20200204'],
    [10, 20, 10, 20],
    { amount: 1000, monthly: 500 }
  );
  const stats = computeStats(input);
  assert.equal(stats.invested, 1500);
  assert.equal(stats.finalValue, 3000);
  assert.ok(Math.abs(stats.returnPct - (1)) < 1e-12); // 3000/1500 - 1 = 1.0
  assert.equal(stats.multiple, 2);
  assert.ok(Math.abs((1 + stats.cagr) ** stats.years - stats.multiple) < 1e-6);
});

test('DCA 同日不会重复注入(start 日为月中亦然)', () => {
  const input = mk(
    ['20200315', '20200316', '20200401'],
    [10, 10, 10],
    { amount: 1000, monthly: 500 }
  );
  const s = [...dcaSeries(input)];
  // j0 注入首笔 1000; j1/j2 同属 3 月不注, j2 为 4 月首日注 500
  assert.deepEqual(s, [1000, 1000, 1500]);
});

test('价格恒为零风险正数序列: 回撤 0 且 CAGR 可计算', () => {
  const input = mk(['20200101', '20200201'], [7, 7]);
  const stats = computeStats(input);
  assert.equal(stats.maxDrawdown, 0);
  assert.ok(Number.isFinite(stats.cagr));
});

test('indexAtT: t=0 取起始日, t=1 取结束日, 中间单调', () => {
  const input = mk(['20200101', '20200102', '20200103', '20200106'], [1, 2, 3, 4]);
  assert.equal(indexAtT(input, 0), 0);
  assert.equal(indexAtT(input, 1), 3);
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const idx = indexAtT(input, i / 20);
    assert.ok(idx >= prev);
    prev = idx;
  }
});

test('durationFor: 短回放保底 45s, 长回放封顶 240s', () => {
  assert.equal(durationFor(0), 45);
  assert.equal(durationFor(420), 20 > 45 ? 45 : 45); // 420/21=20 → 保底 45
  assert.equal(durationFor(10_000), 240);
});
