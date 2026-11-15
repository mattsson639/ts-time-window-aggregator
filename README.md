# ts-time-window-aggregator

Emits aggregate values for each fixed time interval by bucketing timestamped events as they arrive.

```js
import { TimeWindowAggregator } from 'ts-time-window-aggregator';

const closed = [];
const agg = new TimeWindowAggregator(1000, (window) => {
  closed.push({
    start: window.start,
    end: window.end,
    total: window.aggregate(),
  });
});

agg.add({ timestamp: 0, value: 5 });
agg.add({ timestamp: 500, value: 3 });
agg.add({ timestamp: 1200, value: 1 });
agg.flush();

console.log(closed);
// [
//   { start: 0, end: 1000, total: 8 },
//   { start: 1000, end: 2000, total: 1 }
// ]
```

## Why this library exists

Streaming event processors often need per-interval rollups without retaining the whole stream. A common approach is to buffer every event until a timer fires, but that couples the rollup to wall-clock time and makes tests flaky. This library takes a different trade-off: it only ever holds the current window, and it closes that window as soon as an event arrives that belongs to a later window. The cost is that events must arrive in non-decreasing timestamp order; out-of-order events are rejected with an error rather than buffered. In exchange, memory use is bounded by the number of events in a single window, and window emission is driven entirely by the data, not by a clock.

## Awkward edge

The aggregator does not emit windows that contain no events. If a stream jumps from timestamp 10 to timestamp 350 with a window size of 100, only the window containing 10 and the window containing 350 are emitted; the empty windows in between are skipped. This is deliberate: emitting empty windows would require either knowing the entire time range in advance or generating potentially unbounded output for sparse streams.

## API

### `new TimeWindowAggregator(windowSize, onWindowClose)`

- `windowSize` (number, required): the size of each window in milliseconds. Must be a positive finite number.
- `onWindowClose` (function, required): called with a `Window` instance each time a window closes.

### `aggregator.add(event)`

Adds an event to the aggregator. The event must be an object with a finite numeric `timestamp` and a finite numeric `value`. Events must be added in non-decreasing timestamp order.

### `aggregator.flush()`

Closes the current window, if any, and emits it. After flushing, the aggregator can accept events again starting from any timestamp.

### `Window`

A window has `start` (inclusive) and `end` (exclusive) timestamps in milliseconds, plus an `events` array. `window.aggregate()` returns the sum of the event values in that window, or `0` for an empty window.
