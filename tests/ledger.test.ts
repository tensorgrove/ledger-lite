import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendEntry, balanceOf, emptyLedger, formatCents, parseAmountToCents } from '../src/lib/ledger.ts';

const entry = (id: string, amount: number) => ({
  id,
  kind: amount > 0 ? ('deposit' as const) : ('transfer_out' as const),
  amount,
  note: 'test',
  createdAt: new Date(0).toISOString(),
});

test('replaying the same idempotency key does not double-apply', () => {
  let l = emptyLedger();
  const first = appendEntry(l, entry('k1', 5000));
  assert.equal(first.status, 'applied');
  l = first.ledger;
  const replay = appendEntry(l, entry('k1', 5000));
  assert.equal(replay.status, 'duplicate');
  assert.equal(balanceOf(replay.ledger), 5000);
});

test('rejects overdrafts', () => {
  const l = appendEntry(emptyLedger(), entry('a', 1000)).ledger;
  const r = appendEntry(l, entry('b', -1500));
  assert.equal(r.status, 'rejected');
  assert.equal(balanceOf(r.ledger), 1000);
});

test('parses and formats money without floating point drift', () => {
  assert.equal(parseAmountToCents('12.5'), 1250);
  assert.equal(parseAmountToCents('0.10'), 10);
  assert.equal(parseAmountToCents('abc'), null);
  assert.equal(parseAmountToCents('1.234'), null);
  assert.equal(formatCents(123456), '$1,234.56');
  assert.equal(formatCents(-500), '-$5.00');
});
