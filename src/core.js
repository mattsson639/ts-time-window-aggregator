// Core implementation of the time window aggregator.
// The aggregator buckets timestamped events into fixed-size time windows and
// emits aggregate values when a window closes.

/**
 * A single time window bucket.
 *
 * @property {number} start - inclusive start timestamp (ms)
 * @property {number} end - exclusive end timestamp (ms)
 * @property {Array<{timestamp: number, value: number}>} events - events in this window
 */
export class Window {
  /**
   * @param {number} start - inclusive start timestamp (ms)
   * @param {number} end - exclusive end timestamp (ms)
   */
  constructor(start, end) {
    this.start = start;
    this.end = end;
    this.events = [];
  }

  /**
   * Add an event to this window.
   * @param {{timestamp: number, value: number}} event
   */
  add(event) {
    this.events.push(event);
  }

  /**
   * The aggregate value for this window.
   *
   * The aggregator uses the sum of event values. This is a deliberate choice:
   * sum is associative and commutative, so the result does not depend on the
   * order in which events arrive within the same window. If a different
   * aggregate is needed (count, average, max), it should be computed by the
   * caller from the events array.
   *
   * @returns {number} sum of event values, or 0 if the window is empty
   */
  aggregate() {
    let total = 0;
    for (const event of this.events) {
      total += event.value;
    }
    return total;
  }
}

/**
 * Aggregates timestamped events into fixed time windows.
 *
 * Events must arrive in non-decreasing timestamp order. This is the core
 * trade-off of the library: it keeps memory bounded and emits results with
 * low latency by only ever holding the current window. Out-of-order events
 * are rejected rather than buffered, because buffering would require an
 * unbounded amount of memory or a complex retraction mechanism.
 */
export class TimeWindowAggregator {
  /**
   * @param {number} windowSize - size of each window in milliseconds; must be > 0
   * @param {(window: Window) => void} onWindowClose - called when a window closes
   */
  constructor(windowSize, onWindowClose) {
    if (!Number.isFinite(windowSize) || windowSize <= 0) {
      throw new RangeError('windowSize must be a positive finite number');
    }
    if (typeof onWindowClose !== 'function') {
      throw new TypeError('onWindowClose must be a function');
    }
    this.windowSize = windowSize;
    this.onWindowClose = onWindowClose;
    this.currentWindow = null;
    this.lastTimestamp = null;
  }

  /**
   * Add an event to the aggregator.
   *
   * @param {{timestamp: number, value: number}} event
   * @throws {TypeError} if the event is not a valid object
   * @throws {RangeError} if the timestamp is not a finite number
   * @throws {Error} if the event is older than the last seen timestamp
   */
  add(event) {
    if (event === null || typeof event !== 'object') {
      throw new TypeError('event must be an object');
    }
    const { timestamp, value } = event;
    if (!Number.isFinite(timestamp)) {
      throw new RangeError('event.timestamp must be a finite number');
    }
    if (!Number.isFinite(value)) {
      throw new RangeError('event.value must be a finite number');
    }
    if (this.lastTimestamp !== null && timestamp < this.lastTimestamp) {
      throw new Error('event timestamp is older than the last seen timestamp');
    }

    this.lastTimestamp = timestamp;

    if (this.currentWindow === null) {
      this.currentWindow = this._makeWindow(timestamp);
    } else if (timestamp >= this.currentWindow.end) {
      // The event belongs to a later window. Close the current window and
      // create a new one. We do not emit empty windows for gaps: if there is
      // a large jump in time, the intermediate windows are skipped. This
      // keeps the callback count proportional to the number of windows that
      // actually contain events.
      this.onWindowClose(this.currentWindow);
      this.currentWindow = this._makeWindow(timestamp);
    }

    this.currentWindow.add({ timestamp, value });
  }

  /**
   * Close the current window, if any, and emit it.
   *
   * After calling flush, the aggregator is ready to accept events again.
   * This is useful when the stream ends and the final partial window should
   * still be reported.
   */
  flush() {
    if (this.currentWindow !== null) {
      this.onWindowClose(this.currentWindow);
      this.currentWindow = null;
      this.lastTimestamp = null;
    }
  }

  /**
   * Create a new window that contains the given timestamp.
   *
   * Windows are aligned to multiples of windowSize from the Unix epoch.
   * This makes window boundaries deterministic and independent of when the
   * aggregator was created.
   *
   * @param {number} timestamp
   * @returns {Window}
   * @private
   */
  _makeWindow(timestamp) {
    const start = Math.floor(timestamp / this.windowSize) * this.windowSize;
    return new Window(start, start + this.windowSize);
  }
}
