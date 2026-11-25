export type DisplayMode = 'overlay' | 'push';

export const DEFAULT_DISPLAY_MODE: DisplayMode = 'overlay';
export const DEFAULT_HEIGHT_RATIO = 0.42;
export const MIN_HEIGHT_RATIO = 0.25;
export const MAX_HEIGHT_RATIO = 0.65;

export function normalizeDisplayMode(value: unknown): DisplayMode {
  return value === 'push' ? 'push' : 'overlay';
}

export function clampHeightRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_HEIGHT_RATIO;
  }
  return Math.min(MAX_HEIGHT_RATIO, Math.max(MIN_HEIGHT_RATIO, ratio));
}

export function ratioToPercent(ratio: number): number {
  return Math.round(clampHeightRatio(ratio) * 100);
}

export function percentToRatio(percent: number): number {
  if (!Number.isFinite(percent)) {
    return DEFAULT_HEIGHT_RATIO;
  }
  const clamped = Math.round(
    Math.min(MAX_HEIGHT_RATIO * 100, Math.max(MIN_HEIGHT_RATIO * 100, percent)),
  );
  return Math.round((clamped / 100) * 100) / 100;
}
