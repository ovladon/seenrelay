import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hive = fs.readFileSync(new URL('../src/hive.ts', import.meta.url), 'utf8');
const reuse = fs.readFileSync(new URL('../src/reuse.ts', import.meta.url), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
}

test('CHECK finalization does not re-read Hive lease state', () => {
  const block = between(hive, 'export async function finishHiveCheck', 'export async function finishHiveObserve');
  assert.equal(block.includes('getHiveLeaseById('), false);
  assert.match(block, /useful_reuse_consumed:\s*admission\.state\.useful_reuse_consumed\s*\+\s*1/);
});

test('OBSERVE finalization does not re-read Hive lease state', () => {
  const block = between(hive, 'export async function finishHiveObserve', 'export async function verifyHiveLeaseTokenForTest');
  assert.equal(block.includes('getHiveLeaseById('), false);
  assert.match(block, /return admission\.state;/);
});

test('local CHECK state update matches guarded reuse consumer mutation', () => {
  // creditUsefulReuseGuarded increments the consumer counter once when any contributor award is
  // inserted, regardless of the number of contributors. The no-readback path must mirror exactly
  // that public-state mutation rather than adding the contributor award count.
  assert.match(
    reuse,
    /useful_reuse_consumed=useful_reuse_consumed\+CASE WHEN EXISTS\(SELECT 1 FROM ins\) THEN 1 ELSE 0 END/
  );
  const block = between(hive, 'export async function finishHiveCheck', 'export async function finishHiveObserve');
  assert.equal(block.includes('useful_reuse_consumed: admission.state.useful_reuse_consumed + awards'), false);
});
