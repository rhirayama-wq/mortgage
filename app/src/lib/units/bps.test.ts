import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bpsToPercent,
  percentToBps,
  formatPercentFromBps,
  assertIntegerBps,
} from "./bps";

test("UNIT-BPS-01: bpsToPercent converts integer bps to percent", () => {
  assert.equal(bpsToPercent(100), 1.0);
  assert.equal(bpsToPercent(72), 0.72);
  assert.equal(bpsToPercent(0), 0);
  assert.equal(bpsToPercent(12345), 123.45);
});

test("UNIT-BPS-02: bpsToPercent rejects non-integer bps", () => {
  assert.throws(() => bpsToPercent(72.5), RangeError);
  assert.throws(() => bpsToPercent(NaN), RangeError);
  assert.throws(() => bpsToPercent(Infinity), RangeError);
});

test("UNIT-BPS-03: percentToBps produces integers with rounding", () => {
  assert.equal(percentToBps(1.0), 100);
  assert.equal(percentToBps(0.72), 72);
  assert.equal(percentToBps(0.725), 73); // 四捨五入
  assert.equal(percentToBps(0), 0);
});

test("UNIT-BPS-04: percentToBps rejects non-finite input", () => {
  assert.throws(() => percentToBps(NaN), RangeError);
  assert.throws(() => percentToBps(Infinity), RangeError);
});

test("UNIT-BPS-05: formatPercentFromBps formats display string", () => {
  assert.equal(formatPercentFromBps(72), "0.72%");
  assert.equal(formatPercentFromBps(100), "1.00%");
  assert.equal(formatPercentFromBps(72, 3), "0.720%");
  assert.equal(formatPercentFromBps(0), "0.00%");
});

test("UNIT-BPS-06: round-trip percent -> bps -> percent is stable for 2dp inputs", () => {
  for (let bps = 0; bps <= 500; bps++) {
    assert.equal(percentToBps(bpsToPercent(bps)), bps);
  }
});

test("UNIT-BPS-07: assertIntegerBps guards unsafe integers", () => {
  assert.throws(() => assertIntegerBps(2 ** 53), RangeError);
  assert.doesNotThrow(() => assertIntegerBps(2 ** 53 - 1));
});
