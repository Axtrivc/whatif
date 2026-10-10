/**
 * 回放渲染器单元测试 — 前沿插值越界守卫 + 折线逐像素列折叠
 * (A: n=0 单点序列时 fwdVal 不再越界读 val[1] 产生 NaN;
 *  B: 全长折线按像素列折叠保留列内 y 极值下标, 深谷/尖峰不被首末弦线削平,
 *     段数与播放进度 k 解耦, 短序列恒等保留)
 *
 * 运行: npm test  (node --test 直跑 TS, Node ≥22.6 类型剥离)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseIndices, fwdVal } from '../components/replay-render.ts';

test('fwdVal: n=0 单点序列(start==end)返回 val[0], 不产生 NaN', () => {
  const val = new Float64Array([1234.5]); // n=0 → 序列仅 1 个点
  const v = fwdVal(val, 0, 0, 0); // x=start
  assert.equal(v, 1234.5);
  assert.ok(Number.isFinite(v), 'n=0 时必须返回有限值而非 NaN');
  // 小数进度任意滑动也稳在唯一数据点上
  assert.equal(fwdVal(val, 0, 0.7, 0), 1234.5);
  assert.equal(fwdVal(val, 0, 5, 0), 1234.5);
});

test('fwdVal: n≥1 相邻两日线性插值 + 越界钳制', () => {
  const val = new Float64Array([10, 20]);
  assert.equal(fwdVal(val, 1, 0, 0), 10); // j=0, f=0
  assert.equal(fwdVal(val, 1, 0.5, 0), 15); // j=0, f=0.5
  assert.equal(fwdVal(val, 1, 1, 0), 20); // j=1 → j1 钳到 1, f=0
  assert.equal(fwdVal(val, 1, 1.5, 0), 20); // 越过末端: j=0, f=1
  // start 偏移(x 为全序列坐标, 减 start 落到前缀数组下标)
  const val3 = new Float64Array([10, 20, 30]);
  assert.equal(fwdVal(val3, 2, 5, 5), 10);
  assert.equal(fwdVal(val3, 2, 5.5, 5), 15);
  assert.equal(fwdVal(val3, 2, 6.25, 5), 22.5); // j=1, f=0.25
  assert.equal(fwdVal(val3, 2, 99, 5), 30); // 远超末端 → 钳到 val[n]
});

test('collapseIndices: 稠密序列(多点/列)y 单调时每列收束为首末, 首尾下标恒保留', () => {
  // xAt=j=>j*0.25: 每 4 个点落入同一像素列(0..3→列0, 4..7→列1, …)
  // yAt 恒等(y 单调递增)时列内极值与首末点重合, 去重后等同旧首末口径
  const k = 100;
  const got = collapseIndices(k, (j) => j * 0.25, (j) => j);
  const expected: number[] = [];
  for (let c = 0; c <= 24; c++) expected.push(4 * c, 4 * c + 3); // 各列首末
  expected.push(k); // j=k 恒保留
  assert.deepEqual(got, expected); // [0,3,4,7,…,96,99,100]
  assert.equal(got[0], 0);
  assert.equal(got[got.length - 1], k);
  for (let i = 1; i < got.length; i++) assert.ok(got[i] > got[i - 1], '输出严格递增');
  // 被折叠跳过的同列非极值中段点(如 1,2,5,6…)横向偏差 <1px(包络保持)
  assert.ok(!got.includes(1) && !got.includes(2) && !got.includes(98));
});

test('collapseIndices: 列内 y 极值下标必须保留(深谷不被首末弦线削平)', () => {
  // xAt=j=>j*0.25: 每 4 点一列; yAt 让每列第 2 点(4c+1)俯冲至 -1000 深谷 →
  // 各列收束为 [4c, 4c+1, 4c+3](first/iMin/iMax+last 去重), 4c+2 仍被折叠
  const k = 100;
  const got = collapseIndices(k, (j) => j * 0.25, (j) => (j % 4 === 1 ? -1000 : j));
  const expected: number[] = [];
  for (let c = 0; c <= 24; c++) expected.push(4 * c, 4 * c + 1, 4 * c + 3);
  expected.push(k); // j=100 独占末列
  assert.deepEqual(got, expected);
  for (let c = 0; c <= 24; c++) {
    assert.ok(
      got.includes(4 * c) && got.includes(4 * c + 1) && got.includes(4 * c + 3),
      `列 ${c} 的首点/列内极值/末点 ${4 * c}/${4 * c + 1}/${4 * c + 3} 必须保留`,
    );
    assert.ok(!got.includes(4 * c + 2), `非极值中段点 ${4 * c + 2} 仍应折叠`);
  }
  assert.equal(got[0], 0); // j=0 恒保留
  assert.equal(got[got.length - 1], k); // j=k 恒保留
  for (let i = 1; i < got.length; i++) assert.ok(got[i] > got[i - 1], '输出严格递增');
});

test('collapseIndices: 稀疏序列(互不同列)与 0..k 恒等(无操作)', () => {
  const k = 37;
  const got = collapseIndices(k, (j) => j * 10, (j) => j); // 每点独占一列
  assert.deepEqual(got, Array.from({ length: k + 1 }, (_, i) => i));
});

test('collapseIndices: 整段同列保留列内极值([0,iMin,iMax,k]); k=0 单点; 缓冲复用', () => {
  // 全序列挤在同一列: 恒等 yAt 下极值与端点重合, 去重后 [0, k]
  assert.deepEqual(collapseIndices(5, () => 42, (j) => j), [0, 5]);
  // 列内极值落在中部 → [0, iMin, iMax, k](j=2 深谷, j=3 尖峰)
  const ySame = (j: number) => (j === 2 ? -100 : j === 3 ? 100 : 0);
  assert.deepEqual(collapseIndices(5, () => 42, ySame), [0, 2, 3, 5]);
  assert.deepEqual(collapseIndices(0, (j) => j, (j) => j), [0]); // 单点帧
  const buf: number[] = [];
  const ret = collapseIndices(10, (j) => j * 3, (j) => j, buf);
  assert.equal(ret, buf); // 复用调用方缓冲(帧间零分配)
  assert.deepEqual(ret, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const ret2 = collapseIndices(4, (j) => j, (j) => j, buf); // 同一缓冲二次使用先清空
  assert.equal(ret2, buf);
  assert.deepEqual(ret2, [0, 1, 2, 3, 4]);
});
