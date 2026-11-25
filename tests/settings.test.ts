import { describe, expect, it } from 'bun:test';
import {
  KEY_ROW_SPACING_PX,
  computeKeyboardLayoutMetrics,
} from '../src/core/layoutMetrics.js';
import {
  DEFAULT_DISPLAY_MODE,
  DEFAULT_HEIGHT_RATIO,
  MAX_HEIGHT_RATIO,
  MIN_HEIGHT_RATIO,
  clampHeightRatio,
  normalizeDisplayMode,
  percentToRatio,
  ratioToPercent,
} from '../src/core/settings.js';

describe('settings helpers', () => {
  it('normalizes display mode safely with overlay fallback', () => {
    expect(DEFAULT_DISPLAY_MODE).toBe('overlay');
    expect(normalizeDisplayMode('overlay')).toBe('overlay');
    expect(normalizeDisplayMode('push')).toBe('push');
    expect(normalizeDisplayMode('')).toBe('overlay');
    expect(normalizeDisplayMode('invalid')).toBe('overlay');
    expect(normalizeDisplayMode(null)).toBe('overlay');
    expect(normalizeDisplayMode(undefined)).toBe('overlay');
  });

  it('clamps keyboard height ratio and converts between ratio and percent', () => {
    expect(DEFAULT_HEIGHT_RATIO).toBe(0.42);
    expect(MIN_HEIGHT_RATIO).toBe(0.25);
    expect(MAX_HEIGHT_RATIO).toBe(0.65);

    expect(clampHeightRatio(NaN)).toBe(0.42);
    expect(clampHeightRatio(Infinity)).toBe(0.42);
    expect(clampHeightRatio(0.1)).toBe(0.25);
    expect(clampHeightRatio(0.25)).toBe(0.25);
    expect(clampHeightRatio(0.42)).toBe(0.42);
    expect(clampHeightRatio(0.65)).toBe(0.65);
    expect(clampHeightRatio(0.9)).toBe(0.65);

    expect(ratioToPercent(0.25)).toBe(25);
    expect(ratioToPercent(0.42)).toBe(42);
    expect(ratioToPercent(0.65)).toBe(65);
    expect(ratioToPercent(0.1)).toBe(25);
    expect(ratioToPercent(0.9)).toBe(65);

    expect(percentToRatio(25)).toBe(0.25);
    expect(percentToRatio(42)).toBe(0.42);
    expect(percentToRatio(65)).toBe(0.65);
    expect(percentToRatio(10)).toBe(0.25);
    expect(percentToRatio(90)).toBe(0.65);
    expect(percentToRatio(NaN)).toBe(0.42);
  });
});

describe('computeKeyboardLayoutMetrics', () => {
  it('computes positive invariant row and bar metrics across heights and font scales', () => {
    for (const kbHeight of [280, 380, 454, 600]) {
      for (const fontScale of [0.85, 1, 1.25]) {
        const m = computeKeyboardLayoutMetrics(kbHeight, fontScale, 4);
        expect(m.candidateRowHeight).toBeGreaterThanOrEqual(40);
        expect(m.candidateButtonHeight).toBe(m.candidateRowHeight - 4);
        expect(m.candidateBarHeight).toBeGreaterThan(m.candidateRowHeight);
        expect(m.preeditHeight).toBeGreaterThanOrEqual(28);
        expect(m.rowHeight).toBeGreaterThanOrEqual(32);
        expect(4 * m.rowHeight + 3 * KEY_ROW_SPACING_PX).toBeLessThanOrEqual(
          m.gridHeight,
        );

        // Metrics remain identical regardless of candidate/preedit presence
        const mRepeated = computeKeyboardLayoutMetrics(kbHeight, fontScale, 4);
        expect(mRepeated).toEqual(m);
      }
    }
  });
});
