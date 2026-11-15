import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window, TimeWindowAggregator } from '../src/index.js';

test('Window.aggregate sums event values', () => {
  const w = new Window(0, 100);
  w.add({ timestamp: 10, value: 1 });
  w.add({ timestamp: 20, value: 2 });
  assert.equal(w.aggregate(), 3);
});

test('Window.aggregate returns 0 for an empty window', () => {
  const w = new Window(0, 100);
  assert.equal(w.aggregate(), 0);
});

test('TimeWindowAggregator rejects non-positive windowSize', () => {
  assert.throws(() => new TimeWindowAggregator(0, () => {}), RangeError);
  assert.throws(() => new TimeWindowAggregator(-5, () => {}), RangeError);
  assert.throws(() => new TimeWindowAggregator(NaN, () => {}), RangeError);
  assert.throws(() => new TimeWindowAggregator(Infinity, () => {}), RangeError);
});

test('TimeWindowAggregator rejects non-function onWindowClose', () => {
  assert.throws(() => new TimeWindowAggregator(100, null), TypeError);
  assert.throws(() => new TimeWindowAggregator(100, 42), TypeError);
});

test('TimeWindowAggregator emits a window when the next event crosses the boundary', () => {
  const closed = [];
  const agg = new TimeWindowAggregator(100, (w) => closed.push(w));

  agg.add({ timestamp: 10, value: 1 });
  agg.add({ timestamp: 50, value: 2 });
  assert.equal(closed.length, 0);

  agg.add({ timestamp: 150, value: 4 });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].start, 0);
  assert.equal(closed[0].end, 100);
  assert.equal(closed[0].aggregate(), 3);

  agg.flush();
  assert.equal(closed.length, 2);
  assert.equal(closed[1].start, 100);
  assert.equal(closed[1].end, 200);
  assert.equal(closed[1].aggregate(), 4);
});

test('TimeWindowAggregator skips empty windows for gaps in time', () => {
  const closed = [];
  const agg = new TimeWindowAggregator(100, (w) => closed.push(w));

  agg.add({ timestamp: 10, value: 1 });
  agg.add({ timestamp: 350, value: 2 });
  // Only the window containing 10 should have been closed; the windows
  // between 100 and 300 contained no events and are not emitted.
  assert.equal(closed.length, 1);
  assert.equal(closed[0].start, 0);
  assert.equal(closed[0].aggregate(), 1);

  agg.flush();
  assert.equal(closed.length, 2);
  assert.equal(closed[1].start, 300);
  assert.equal(closed[1].aggregate(), 2);
});

test('TimeWindowAggregator accepts events exactly on the boundary', () => {
  const closed = [];
  const agg = new TimeWindowAggregator(100, (w) => closed.push(w));

  agg.add({ timestamp: 0, value: 1 });
  agg.add({ timestamp: 100, value: 2 });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].start, 0);
  assert.equal(closed[0].aggregate(), 1);

  agg.flush();
  assert.equal(closed.length, 2);
  assert.equal(closed[1].start, 100);
  assert.equal(closed[1].aggregate(), 2);
});

test('TimeWindowAggregator rejects events with timestamps going backwards', () => {
  const agg = new TimeWindowAggregator(100, () => {});
  agg.add({ timestamp: 50, value: 1 });
  assert.throws(() => agg.add({ timestamp: 49, value: 2 }), /older than/);
});

test('TimeWindowAggregator rejects invalid event shapes', () => {
  const agg = new TimeWindowAggregator(100, () => {});
  assert.throws(() => agg.add(null), TypeError);
  assert.throws(() => agg.add({ timestamp: NaN, value: 1 }), RangeError);
  assert.throws(() => agg.add({ timestamp: 1, value: Infinity }), RangeError);
});

test('TimeWindowAggregator flush on an empty aggregator does nothing', () => {
  const closed = [];
  const agg = new TimeWindowAggregator(100, (w) => closed.push(w));
  agg.flush();
  assert.equal(closed.length, 0);
});

test('TimeWindowAggregator can be reused after flush', () => {
  const closed = [];
  const agg = new TimeWindowAggregator(100, (w) => closed.push(w));

  agg.add({ timestamp: 10, value: 1 });
  agg.flush();
  assert.equal(closed.length, 1);

  // After flush, timestamps may start over from an earlier point because the
  // aggregator no longer remembers the previous stream's last timestamp.
  agg.add({ timestamp: 5, value: 2 });
  agg.flush();
  assert.equal(closed.length, 2);
  assert.equal(closed[1].start, 0);
  assert.equal(closed[1].aggregate(), 2);
});

test('TimeWindowAggregator aligns windows to multiples of windowSize', () => {
  const closed = [];
  const agg = new TimeWindowAggregator(50, (w) => closed.push(w));

  agg.add({ timestamp: 10, value: 1 });
  agg.add({ timestamp: 60, value: 2 });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].start, 0);
  assert.equal(closed[0].end, 50);

  agg.flush();
  assert.equal(closed.length, 2);
  assert.equal(closed[1].start, 50);
  assert.equal(closed[1].end, 100);
});
