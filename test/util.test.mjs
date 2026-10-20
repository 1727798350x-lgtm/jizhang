import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAmountToCents,
  parseSignedAmountToCents,
  fmtCents,
  fmtMoney,
  centsToInput,
  addMonths,
  monthOf,
  isValidDate,
  dayLabel,
} from '../js/util.js';

test('parseAmountToCents 把输入字符串转换成整数分', () => {
  assert.equal(parseAmountToCents('12'), 1200);
  assert.equal(parseAmountToCents('12.3'), 1230);
  assert.equal(parseAmountToCents('12.34'), 1234);
  assert.equal(parseAmountToCents('0.5'), 50);
  assert.equal(parseAmountToCents('.5'), 50);
  assert.equal(parseAmountToCents('12.'), 1200);
  assert.equal(parseAmountToCents(' 8 '), 800);
});

test('parseAmountToCents 拒绝非法输入', () => {
  assert.equal(parseAmountToCents(''), null);
  assert.equal(parseAmountToCents('.'), null);
  assert.equal(parseAmountToCents('12.345'), null);
  assert.equal(parseAmountToCents('abc'), null);
  assert.equal(parseAmountToCents('-5'), null);
  assert.equal(parseAmountToCents('1,000'), null);
});

test('fmtCents / fmtMoney 格式化金额', () => {
  assert.equal(fmtCents(0), '0.00');
  assert.equal(fmtCents(5), '0.05');
  assert.equal(fmtCents(123456), '1,234.56');
  assert.equal(fmtCents(-123456), '-1,234.56');
  assert.equal(fmtMoney(123456), '¥1,234.56');
  assert.equal(fmtMoney(-50), '-¥0.50');
});

test('centsToInput 用于编辑框回填', () => {
  assert.equal(centsToInput(1230), '12.30');
  assert.equal(centsToInput(0), '0.00');
});

test('addMonths 跨年计算', () => {
  assert.equal(addMonths('2026-10', 1), '2026-11');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-03', -14), '2025-01');
});

test('monthOf / isValidDate', () => {
  assert.equal(monthOf('2026-10-19'), '2026-10');
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-1'), false);
});

test('dayLabel 今天/昨天/历史日期', () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.equal(dayLabel(today), '今天');
  assert.equal(dayLabel('2020-01-01'), '2020年1月1日 周三');
});

test('parseSignedAmountToCents 支持负数余额与空值', () => {
  assert.equal(parseSignedAmountToCents('1234.56'), 123456);
  assert.equal(parseSignedAmountToCents('-50'), -5000);
  assert.equal(parseSignedAmountToCents('-0.5'), -50);
  assert.equal(parseSignedAmountToCents('0'), 0);
  assert.equal(parseSignedAmountToCents(''), null);
  assert.equal(parseSignedAmountToCents('-'), null);
  assert.equal(parseSignedAmountToCents('abc'), null);
  assert.equal(parseSignedAmountToCents('1.234'), null);
});
