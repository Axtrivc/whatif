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

test('DCA 回撤逐日分母: 峰值后腰斩 → 50% 回撤(期末投入口径会误报 25%)', () => {
  // series=[1000,2000,1500,1500], 逐日累计投入=[1000,1000,1500,1500]
  // 逐日比值 [1,2,1,1]: 峰 2.0 → 谷 1.0 → maxDrawdown = 0.5
  const input = mk(
    ['20200101', '20200102', '20200203', '20200204'],
    [10, 20, 10, 10],
    { amount: 1000, monthly: 500 }
  );
  const stats = computeStats(input);
  assert.ok(Math.abs(stats.maxDrawdown - 0.5) < 1e-12);
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

/* ────────────────────────────────────────────────────────────────
 * 定投份额法边界矩阵: 单期投入 / 零价·缺价 / 首日买入 / 区间端点 /
 * 累计投入口径 / 极小极大金额 / 浮点进位
 * ──────────────────────────────────────────────────────────────── */

test('单期区间(start===end, dca): 首笔即全部投入, years 保底 1/365', () => {
  // 唯一一天既是首日也是末日: 只注入 amount, 份额 = amount/price
  const input = mk(['20200615'], [8], { amount: 1000, monthly: 500 });
  assert.deepEqual([...dcaSeries(input)], [1000]); // 1000/8=125 份 ×8 精确回 1000
  assert.deepEqual([...investedSeries(input)], [1000]);
  assert.equal(dcaInvested(input), 1000);
  const stats = computeStats(input);
  assert.equal(stats.invested, 1000); // monthly 真值 → dca 口径暴露 invested
  assert.equal(stats.finalValue, 1000);
  assert.equal(stats.profit, 0);
  assert.equal(stats.returnPct, 0); // 1000/1000 - 1 精确为 0
  assert.equal(stats.multiple, 1);
  assert.equal(stats.maxDrawdown, 0);
  assert.equal(stats.years, 1 / 365); // days=0 → 保底
  assert.equal(stats.cagr, 0); // 1^(1/years) - 1
});

test('区间端点(start>0, end<尾): 基准取 closes[start], 窗口外月份不注入', () => {
  // 窗口 [1..4]: Jan20 / Mar05 / Mar06 / Apr01(恰为注入日=末日)
  const dates = ['20200110', '20200120', '20200305', '20200306', '20200401', '20200407'];
  const closes = [50, 10, 20, 40, 10, 80];
  const window = { start: 1, end: 4 };
  // lump-sum: base = closes[1]=10 (而非 closes[0]=50)
  const lump = mk(dates, closes, { ...window });
  assert.deepEqual([...dcaSeries(lump)], [1000, 2000, 4000, 1000]);
  // dca: j0 注 1000/10=100 份; Mar 首日注 300/20=15 → 115 份; Apr(=end) 注 300/10=30 → 145 份
  const input = mk(dates, closes, { ...window, amount: 1000, monthly: 300 });
  assert.deepEqual([...dcaSeries(input)], [1000, 2300, 4600, 1450]);
  assert.deepEqual([...investedSeries(input)], [1000, 1300, 1300, 1600]);
  assert.equal(dcaInvested(input), 1600);
  const stats = computeStats(input);
  assert.equal(stats.invested, 1600); // 与 investedSeries 末元素/dcaInvested 三者一致
  assert.equal(stats.finalValue, 1450);
  assert.equal(stats.profit, -150);
  assert.equal(stats.multiple, 0.90625); // 1450/1600 = 29/32, 二进制精确
  assert.equal(stats.returnPct, -0.09375); // 0.90625 - 1 同样精确
  // 回撤逐日分母: 峰 = 4600/1300(46/13), 谷 = 1450/1600(29/32) → 1 - (29·13)/(32·46) = 1095/1472
  assert.ok(Math.abs(stats.maxDrawdown - 1095 / 1472) < 1e-12);
  assert.ok(Math.abs((1 + stats.cagr) ** stats.years - stats.multiple) < 1e-9);
});

test('缺价月(整月无交易日): 跳过的 2 月不补投', () => {
  // 1 月两天后直接跳到 3 月: monthSeq 跨 2 仍只注入一次
  const input = mk(['20200102', '20200103', '20200302'], [10, 10, 10], {
    amount: 1000,
    monthly: 500,
  });
  assert.deepEqual([...dcaSeries(input)], [1000, 1000, 1500]);
  assert.deepEqual([...investedSeries(input)], [1000, 1000, 1500]); // 非 [1000,1000,2000]
  assert.equal(dcaInvested(input), 1500);
});

test('跨年边界(12月→1月): 月序线性, 1月首日正常注入', () => {
  const input = mk(['20201231', '20210101', '20210104'], [10, 10, 10], {
    amount: 1000,
    monthly: 500,
  });
  assert.deepEqual([...dcaSeries(input)], [1000, 1500, 1500]);
  assert.deepEqual([...investedSeries(input)], [1000, 1500, 1500]);
});

test('首日买入用的是 amount 而非 monthly(两者不等时)', () => {
  const input = mk(['20200101', '20200102', '20200103'], [7, 7, 7], {
    amount: 700,
    monthly: 500,
  });
  assert.deepEqual([...dcaSeries(input)], [700, 700, 700]); // 700/7=100 份
  assert.deepEqual([...investedSeries(input)], [700, 700, 700]); // 全程同月不追加
  assert.equal(dcaInvested(input), 700);
});

test('monthly=0 视作 falsy 走一次性路径: invested 字段为 undefined', () => {
  const input = mk(['20200101', '20200203'], [10, 20], { amount: 1000, monthly: 0 });
  assert.deepEqual([...dcaSeries(input)], [1000, 2000]); // lump 形状
  assert.deepEqual([...investedSeries(input)], [1000, 1000]);
  assert.equal(computeStats(input).invested, undefined); // engine.ts:139 三元对 0 同样取 undefined
});

test('零价·基准日(lump-sum): 除以 0 → 首日 NaN, 之后 Infinity', () => {
  const input = mk(['20200101', '20200102'], [0, 10]);
  const s = [...dcaSeries(input)];
  assert.ok(Number.isNaN(s[0])); // (1000×0)/0 = 0/0
  assert.equal(s[1], Infinity); // (1000×10)/0
});

test('零价·非注入日(dca): 当日资产精确为 0, 回撤 100%, 投入口径与价格无关', () => {
  const input = mk(['20200101', '20200102', '20200103'], [10, 0, 10], {
    amount: 1000,
    monthly: 500,
  });
  assert.deepEqual([...dcaSeries(input)], [1000, 0, 1000]); // 100 份 × 0
  assert.deepEqual([...investedSeries(input)], [1000, 1000, 1000]);
  const stats = computeStats(input);
  assert.equal(stats.maxDrawdown, 1); // (1-0)/1 精确
  assert.equal(stats.finalValue, 1000);
  assert.equal(stats.returnPct, 0);
});

test('零价·注入日(dca): 份额发散 → 当日 NaN, 次日 Infinity; invested 仍精确', () => {
  const input = mk(['20200101', '20200203', '20200204'], [10, 0, 8], {
    amount: 1000,
    monthly: 500,
  });
  const s = [...dcaSeries(input)];
  assert.equal(s[0], 1000);
  assert.ok(Number.isNaN(s[1])); // 500/0 = +∞ 份, ∞×0 = NaN
  assert.equal(s[2], Infinity); // ∞×8
  assert.deepEqual([...investedSeries(input)], [1000, 1500, 1500]); // 投入不受价格影响
});

test('极小金额(Number.MIN_VALUE): lump 先乘后除保精确, dca 先除份额下溢为 0', () => {
  const mv = Number.MIN_VALUE; // 4.94e-324
  const lump = mk(['20200101', '20200102'], [3, 3], { amount: mv });
  assert.equal(dcaSeries(lump)[0], mv); // (mv×3)/3: 3×mv 仍是可表示的次正规数, 商精确
  const dca = mk(['20200101', '20200102'], [3, 3], { amount: mv, monthly: mv });
  assert.deepEqual([...dcaSeries(dca)], [0, 0]); // mv/3 舍入到 0(次正规颗粒度)
  assert.deepEqual([...investedSeries(dca)], [mv, mv]); // 钱计入, 份额为 0
});

test('极大金额: lump 先乘后除中间上溢 → Infinity; dca 先除后乘不上溢', () => {
  const lump = mk(['20200101', '20200102'], [8, 8], { amount: 1e308 });
  assert.equal(dcaSeries(lump)[0], Infinity); // 1e308×8 上溢, 再 /8 救不回
  const dca = mk(['20200101', '20200102'], [8, 8], { amount: 1e308, monthly: 500 });
  assert.equal(dcaSeries(dca)[0], 1e308); // 1e308/8 = 1.25e308 精确(2 的幂), ×8 还原
  assert.equal(investedSeries(dca)[0], 1e308);
});

test('浮点进位: 单笔份额往返精确回本金; 多笔累加估值偏差止于 ulp 级且无校正', () => {
  // 单笔: (a/p)×p 平局舍偶恰好落回本金 — 100/3 与 1000/3 量级均验证精确
  // (先除后乘的份额法在常见量级不损失本金)
  const single100 = mk(['20200101', '20200102'], [3, 3], { amount: 100, monthly: 100 });
  assert.equal(dcaSeries(single100)[0], 100);
  const single1000 = mk(['20200101', '20200102'], [3, 3], { amount: 1000, monthly: 1000 });
  assert.equal(dcaSeries(single1000)[0], 1000);
  // 多笔: 1月 100@3 + 2月 100@7, 在 7 价日估值 = (100/3 + 100/7)×7
  // 实测 = 333.33333333333337, 理想 1000/3 = 333.33333333333331 → 偏差 ~5.6e-14
  // 引擎不做 epsilon 校正, 忠实保留份额累加的舍入
  const two = mk(['20200101', '20200203'], [3, 7], { amount: 100, monthly: 100 });
  const v = dcaSeries(two)[1];
  assert.notEqual(v, 1000 / 3);
  assert.ok(Math.abs(v - 1000 / 3) < 1e-12);
});

test('跨年注入: monthSeq 年份项保证 12月→1月 单调, 1 月首日照常注入不漏注', () => {
  // 2020-11 两日 + 2020-12 两日 + 2021-01 两日; 若年份项被去掉,
  // monthSeq(20210104)=0 < monthSeq(20201231)=11, 1 月注入被静默跳过 → 全部断言失败
  const input = mk(
    ['20201130', '20201201', '20201231', '20210104', '20210105'],
    [10, 20, 10, 5, 10],
    { amount: 1000, monthly: 500 }
  );
  // j0 注入 1000@10=100份; j1 12月首日 +500/20=25份→125份×20;
  // j3 2021-01 首日 +500/5=100份→225份×5; j4 225×10
  assert.deepEqual([...dcaSeries(input)], [1000, 2500, 1250, 1125, 2250]);
  assert.deepEqual([...investedSeries(input)], [1000, 1500, 1500, 2000, 2000]);
  assert.equal(dcaInvested(input), 2000); // 3 个月: 1000 + 500×2
  const stats = computeStats(input);
  assert.equal(stats.finalValue, 2250);
  assert.ok(Math.abs(stats.returnPct - 2250 / 2000 + 1) < 1e-12);
});
