const test = require('node:test');
const assert = require('node:assert/strict');
const { createImageQueue } = require('../scripts/progressive-images/queue');

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('image queue bounds concurrency, publishes independently and deduplicates requests', async () => {
  const queue = createImageQueue(2);
  const first = deferred(), second = deferred();
  const started = [], finished = [];
  const a = queue.add('a', () => { started.push('a'); return first.promise; });
  const b = queue.add('b', () => { started.push('b'); return second.promise; });
  const c = queue.add('c', () => { started.push('c'); return 'C'; });
  assert.equal(queue.add('a', () => assert.fail('duplicate executed')), a);
  b.then(() => finished.push('b'));
  c.then(() => finished.push('c'));
  await tick();
  assert.deepEqual(started, ['a', 'b']);
  second.resolve('B');
  await tick();
  assert.deepEqual(started, ['a', 'b', 'c']);
  assert.deepEqual(finished, ['b', 'c']);
  first.resolve('A');
  assert.deepEqual(await a, { status: 'loaded', value: 'A' });
});

test('failed image does not hold the next image and cancelled pending work never starts', async () => {
  const queue = createImageQueue(1);
  const first = deferred();
  const a = queue.add('a', () => first.promise);
  const b = queue.add('b', () => assert.fail('cancelled image started'));
  const c = queue.add('c', () => { throw new Error('image unavailable'); });
  const d = queue.add('d', () => 'D');
  queue.cancelPending(key => key === 'b');
  first.resolve('A');
  assert.equal((await a).status, 'loaded');
  assert.deepEqual(await b, { status: 'cancelled' });
  assert.equal((await c).status, 'failed');
  assert.equal((await d).value, 'D');
});

test('higher priority pending images start before background images', async () => {
  const queue = createImageQueue(1);
  const hold = deferred();
  const started = [];
  const a = queue.add('hold', () => hold.promise);
  const b = queue.add('background', () => { started.push('background'); }, 0);
  const c = queue.add('visible', () => { started.push('visible'); }, 10);
  hold.resolve();
  await Promise.all([a,b,c]);
  assert.deepEqual(started, ['visible','background']);
});

test('invalid queue size is rejected rather than hanging requests', () => {
  for (const limit of [0, -1, NaN, 1.5, 50]) assert.throws(() => createImageQueue(limit));
});
