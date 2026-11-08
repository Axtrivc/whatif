/**
 * 设计令牌单元测试 — 币种符号穷举化 + 涨跌色 locale 令牌对(图形档/文本档)
 *
 * 运行: npm test  (node --test 直跑 TS, Node ≥22.6 类型剥离)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CCY_ZH,
  ccyPrefix,
  GAIN,
  LOSS,
  LOSS_TEXT,
  toneCls,
  toneClsText,
  toneFor,
  toneTextFor,
} from '../lib/tokens.ts';

test('ccyPrefix: 已知币种穷举(四值)', () => {
  assert.equal(ccyPrefix('USD'), '$');
  assert.equal(ccyPrefix('HKD'), 'HK$');
  assert.equal(ccyPrefix('CNY'), '¥');
  assert.equal(ccyPrefix(''), ''); // 指数类无符号
});

test('ccyPrefix: 缺省入参回退 USD, 未知非空字符串抛错', () => {
  assert.equal(ccyPrefix(undefined), '$'); // 缺省 USD 语义
  assert.equal(ccyPrefix(null), '$'); // null 视同缺省
  assert.throws(() => ccyPrefix('XYZ'), /未知币种: XYZ/); // 不再静默回退 '$'
});

test('toneFor/toneCls: 涨跌色 locale 令牌对(图形档, canvas/海报/大字同源)', () => {
  assert.equal(toneFor('zh').up, GAIN);
  assert.equal(toneFor('zh').down, LOSS);
  assert.equal(toneFor('en').up, LOSS); // en 绿涨红跌
  assert.equal(toneFor('en').down, GAIN);
  assert.deepEqual(toneCls('zh'), { up: 'text-gain', down: 'text-loss' });
  assert.deepEqual(toneCls('en'), { up: 'text-loss', down: 'text-gain' });
});

test('toneTextFor/toneClsText: 文本安全档(文本槽位 #0E9F76 → LOSS_TEXT, 不分槽位/语言)', () => {
  assert.equal(toneTextFor('zh').up, GAIN);
  assert.equal(toneTextFor('zh').down, LOSS_TEXT);
  assert.equal(toneTextFor('en').up, LOSS_TEXT); // en 的 up 也是 LOSS_TEXT(文本档口径写死)
  assert.equal(toneTextFor('en').down, GAIN);
  assert.deepEqual(toneClsText('zh'), { up: 'text-gain', down: 'text-loss-strong' });
  assert.deepEqual(toneClsText('en'), { up: 'text-loss-strong', down: 'text-gain' });
});

test('CCY_ZH: 币种中文名穷举', () => {
  assert.equal(CCY_ZH.USD, '美元');
  assert.equal(CCY_ZH.HKD, '港元');
  assert.equal(CCY_ZH.CNY, '人民币');
});
