/**
 * i18n 层单元测试 — 锁定内链生成 lp 的全部分支与市场标签完备性
 * (lp 是全站内链唯一生成器; MARKET_LABEL_I18N 漏配某个 market 会渲染 undefined,
 *  此处与 lib/stocks.ts 的 Market union 交叉验证)
 * + zh/en 字典键集合齐平(多键/漏键均为回归) / en 漏译检测(空串·残留中文·类型漂移)
 * + 函数键的币种前缀语义与 amountLabel 分档边界
 *
 * 运行: npm test  (node --test 直跑 TS, Node ≥22.6 类型剥离)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dict, lp, LOCALES, MARKET_LABEL_I18N, TAGLINE_EN } from '../lib/i18n.ts';
import { STOCKS } from '../lib/stocks.ts';

test('lp: zh 根路径 / en 前缀 / 尾斜杠归一', () => {
  assert.equal(lp('zh', '/'), '/'); // 中文根路径原样
  assert.equal(lp('en', '/'), '/en/'); // 英文根路径加前缀
  assert.equal(lp('zh', '/replay'), '/replay/'); // zh 补尾斜杠
  assert.equal(lp('en', '/p/msft'), '/en/p/msft/'); // en 前缀 + 补尾斜杠
  assert.equal(lp('en', '/p/msft/'), '/en/p/msft/'); // 已有尾斜杠不产生双斜杠
  assert.equal(lp('zh', '/p/btc/'), '/p/btc/'); // zh 已有尾斜杠原样
});

test('MARKET_LABEL_I18N: STOCKS 全部 market 在两 locale 均有非空标签', () => {
  const markets = new Set(STOCKS.map((s) => s.market));
  for (const market of markets) {
    for (const locale of LOCALES) {
      const label = MARKET_LABEL_I18N[locale][market];
      assert.equal(typeof label, 'string', `${locale} 缺少 market=${market} 标签`);
      assert.ok(label.length > 0, `${locale} market=${market} 标签为空字符串`);
    }
  }
});

test('TAGLINE_EN: STOCKS 全部 key 均有非空英文 tagline', () => {
  for (const s of STOCKS) {
    const tag = TAGLINE_EN[s.key];
    assert.equal(typeof tag, 'string', `缺少 ${s.key}`);
    assert.ok(tag.length > 0, `${s.key} 为空`);
  }
});

// ── 追加: 字典键齐平 / 漏译回归 / 函数键的币种前缀与分档边界 ──

test('dict: zh 与 en 键集合完全齐平(多键/漏键均为回归)', () => {
  const zhKeys = Object.keys(dict('zh')).sort();
  assert.ok(zhKeys.length > 0); // 防呆: 字典非空才有齐平意义
  for (const locale of LOCALES) {
    assert.deepEqual(
      Object.keys(dict(locale)).sort(),
      zhKeys,
      `locale=${locale} 字典键集合与 zh 不一致`
    );
  }
});

test('dict(en): 漏译回归 — 值类型对齐、非空串、无残留中文', () => {
  const zh = dict('zh') as unknown as Record<string, unknown>;
  const en = dict('en') as unknown as Record<string, unknown>;
  for (const key of Object.keys(zh)) {
    assert.equal(typeof en[key], typeof zh[key], `en.${key} 值类型与 zh 不一致`);
    if (typeof en[key] === 'string') {
      assert.ok(en[key].length > 0, `en.${key} 为空串(疑似漏译)`);
      assert.doesNotMatch(en[key], /[\u3400-\u9fff]/, `en.${key} 残留中文(疑似漏译)`);
    }
  }
});

test('MARKET_LABEL_I18N: 两 locale 键集合一致(单侧增删即回归)', () => {
  assert.deepEqual(
    Object.keys(MARKET_LABEL_I18N.en).sort(),
    Object.keys(MARKET_LABEL_I18N.zh).sort()
  );
});

test('replaySummary: zh 万/亿中性忽略币种前缀 / en 必须嵌入 ccyPrefix', () => {
  assert.equal(
    dict('zh').replaySummary(2010, '1万', 'HK$', '500'),
    '2010 年投入 1万 + 每月 500 · 一直持有到今天'
  );
  assert.equal(
    dict('en').replaySummary(2010, '10K', 'HK$', '500'),
    'Invested HK$10K + 500/mo in 2010 · held until today'
  );
  assert.equal(dict('zh').replaySummary(2010, '1万', '$'), '2010 年投入 1万 · 一直持有到今天'); // 无定投
  assert.equal(dict('en').replaySummary(2010, '10K', '$'), 'Invested $10K in 2010 · held until today');
});

test('amountLabel: zh 万档 / en K·M 档进位边界', () => {
  assert.equal(dict('zh').amountLabel(9_999), '9999'); // 门槛下原样
  assert.equal(dict('zh').amountLabel(10_000), '1万'); // 门槛即进档
  assert.equal(dict('zh').amountLabel(150_000), '15万');
  assert.equal(dict('en').amountLabel(9_999), '9999');
  assert.equal(dict('en').amountLabel(10_000), '10K'); // 跨入 K 档
  assert.equal(dict('en').amountLabel(999_999), '999.999K'); // K 档顶格(不足 1M)
  assert.equal(dict('en').amountLabel(1_000_000), '1M'); // 跨入 M 档
});

test('dataAsOf: 两 locale 均按 YYYY-MM-DD 格式化', () => {
  assert.equal(dict('zh').dataAsOf('20260930'), '数据截至 2026-09-30');
  assert.equal(dict('en').dataAsOf('20260930'), 'Data as of 2026-09-30');
});
