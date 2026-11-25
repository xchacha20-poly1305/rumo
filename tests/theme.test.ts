import { describe, expect, it } from 'bun:test';
import {
  formatRgba,
  isSafeCssUri,
  parseColor,
  pickReadableForeground,
  sanitizeFontFamily,
} from '../src/core/themeColor.js';
import { compileThemeCss } from '../src/core/themeCssCompiler.js';
import { ADWAITA_ACCENT_PALETTE } from '../src/core/themePresets.js';
import { resolveTheme } from '../src/core/themeResolver.js';
import type { ThemePresetId } from '../src/core/themeTypes.js';

const SYSTEM_BLUE = ADWAITA_ACCENT_PALETTE.blue;
const SYSTEM_RED = ADWAITA_ACCENT_PALETTE.red;

describe('themeColor', () => {
  it('parses valid hex, rgb, rgba, and transparent colors accurately', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0f08')).toEqual({
      r: 0,
      g: 255,
      b: 0,
      a: (8 * 17) / 255,
    });
    expect(parseColor('#3584E4')).toEqual({ r: 53, g: 132, b: 228, a: 1 });
    expect(parseColor('#18191df5')).toEqual({
      r: 24,
      g: 25,
      b: 29,
      a: 245 / 255,
    });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(53, 132, 228, 0.24)')).toEqual({
      r: 53,
      g: 132,
      b: 228,
      a: 0.24,
    });
    expect(parseColor('rgba(255, 255, 255, 50%)')).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 0.5,
    });
    expect(parseColor('  transparent  ')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('rejects malformed or out-of-range color strings', () => {
    for (const bad of [
      '',
      '#',
      '#12',
      '#12345',
      '#zzzzzz',
      'rgb(256, 0, 0)',
      'rgb(-1, 0, 0)',
      'rgb(10, 20)',
      'rgba(10, 20, 30, 1.5)',
      'rgba(10, 20, 30, 0.5px)',
      'red; background: url(x)',
    ]) {
      expect(parseColor(bad)).toBeNull();
    }
  });

  it('formats rgba and selects high-contrast foregrounds automatically', () => {
    expect(formatRgba({ r: 53, g: 132, b: 228, a: 0.24 })).toBe(
      'rgba(53, 132, 228, 0.24)',
    );
    const onYellow = pickReadableForeground({ r: 245, g: 230, b: 66, a: 1 });
    expect(onYellow).toEqual({ r: 26, g: 28, b: 32, a: 1 });

    const onNavy = pickReadableForeground({ r: 18, g: 36, b: 84, a: 1 });
    expect(onNavy).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('sanitizes fontFamily and rejects CSS injection payloads', () => {
    expect(sanitizeFontFamily('Inter, "Noto Sans CJK SC"')).toBe(
      'Inter, "Noto Sans CJK SC"',
    );
    expect(sanitizeFontFamily("  'Fira Code', monospace ")).toBe(
      '"Fira Code", monospace',
    );
    expect(sanitizeFontFamily('Inter; color: red')).toBeNull();
    expect(sanitizeFontFamily('Inter } .evil {')).toBeNull();
    expect(sanitizeFontFamily('Inter\nfont-size: 99px')).toBeNull();
    expect(sanitizeFontFamily('')).toBeNull();

    expect(isSafeCssUri('file:///home/user/.config/rumo/bg.png')).toBe(true);
    expect(isSafeCssUri('file:///tmp/bad");color:red;/*')).toBe(false);
    expect(isSafeCssUri('https://example.com/bg.png')).toBe(false);
  });
});

describe('themeResolver', () => {
  it('resolves all 5 built-in presets with zero warnings', () => {
    const presets: ThemePresetId[] = [
      'dark',
      'light',
      'amoled',
      'flat-dark',
      'flat-light',
    ];
    for (const preset of presets) {
      const res = resolveTheme({
        systemMode: 'dark',
        systemAccent: SYSTEM_BLUE,
        baseLayer: {
          sourceLabel: 'theme.json',
          rawText: JSON.stringify({ extends: preset }),
        },
      });
      expect(res.warnings).toEqual([]);
      expect(res.theme.preset).toBe(preset);
    }
  });

  it('follows system color scheme and accent by default, and supports overriding accent', () => {
    const lightDefault = resolveTheme({
      systemMode: 'light',
      systemAccent: SYSTEM_RED,
    });
    expect(lightDefault.warnings).toEqual([]);
    expect(lightDefault.theme.mode).toBe('light');
    expect(lightDefault.theme.preset).toBe('light');
    expect(lightDefault.theme.colors.accent).toEqual(SYSTEM_RED.bg);

    const customAccent = resolveTheme({
      systemMode: 'light',
      systemAccent: SYSTEM_RED,
      baseLayer: {
        sourceLabel: 'theme.json',
        rawText: JSON.stringify({
          colors: { accent: '#f6d32d' },
        }),
      },
    });
    expect(customAccent.warnings).toEqual([]);
    expect(customAccent.theme.colors.accent).toEqual({
      r: 246,
      g: 211,
      b: 45,
      a: 1,
    });
    // Yellow accent automatically chooses dark foreground for readability
    expect(customAccent.theme.colors.accentForeground).toEqual({
      r: 26,
      g: 28,
      b: 32,
      a: 1,
    });
  });

  it('applies 4-layer merge precedence: preset -> theme.json -> theme-{mode}.json', () => {
    const res = resolveTheme({
      systemMode: 'dark',
      systemAccent: SYSTEM_BLUE,
      baseLayer: {
        sourceLabel: 'theme.json',
        rawText: JSON.stringify({
          extends: 'amoled',
          geometry: { keyRadius: 14 },
          colors: { accent: '#e06c75', keyForeground: '#fafafa' },
        }),
      },
      modeLayer: {
        sourceLabel: 'theme-dark.json',
        rawText: JSON.stringify({
          geometry: { keyRadius: 6 },
          colors: { accent: '#98c379' },
        }),
      },
    });

    expect(res.warnings).toEqual([]);
    expect(res.theme.preset).toBe('amoled');
    expect(res.theme.geometry.keyRadius).toBe(6);
    expect(res.theme.colors.accent).toEqual({ r: 152, g: 195, b: 121, a: 1 });
    expect(res.theme.colors.keyForeground).toEqual({ r: 250, g: 250, b: 250, a: 1 });
  });

  it('isolates broken JSON files and falls back per-field without discarding valid settings', () => {
    const brokenModeRes = resolveTheme({
      systemMode: 'dark',
      systemAccent: SYSTEM_BLUE,
      baseLayer: {
        sourceLabel: 'theme.json',
        rawText: JSON.stringify({
          geometry: { keyRadius: 16 },
          colors: { accent: '#62a0ea' },
        }),
      },
      modeLayer: {
        sourceLabel: 'theme-dark.json',
        rawText: '{ broken json',
      },
    });
    expect(brokenModeRes.warnings.length).toBe(1);
    expect(brokenModeRes.warnings[0]).toContain('theme-dark.json');
    expect(brokenModeRes.theme.geometry.keyRadius).toBe(16);
    expect(brokenModeRes.theme.colors.accent).toEqual({ r: 98, g: 160, b: 234, a: 1 });

    const brokenBaseRes = resolveTheme({
      systemMode: 'light',
      systemAccent: SYSTEM_BLUE,
      baseLayer: {
        sourceLabel: 'theme.json',
        rawText: '[1, 2, 3]',
      },
      modeLayer: {
        sourceLabel: 'theme-light.json',
        rawText: JSON.stringify({
          geometry: { keyRadius: 999 },
          typography: { fontFamily: 'Bad;Injection', fontScale: 1.2 },
          colors: { accent: 'not-a-color', keyForeground: '#111111' },
          background: { image: 'missing.png' },
          unknownField: 123,
        }),
      },
      resolveBackgroundPath: () => ({ error: 'file not found' }),
    });

    expect(brokenBaseRes.warnings.length).toBe(6);
    expect(brokenBaseRes.theme.mode).toBe('light');
    expect(brokenBaseRes.theme.geometry.keyRadius).toBe(24); // clamped
    expect(brokenBaseRes.theme.typography.fontFamily).toBeNull(); // rejected
    expect(brokenBaseRes.theme.typography.fontScale).toBe(1.2); // valid kept
    expect(brokenBaseRes.theme.colors.accent).toEqual(SYSTEM_BLUE.bg); // fell back
    expect(brokenBaseRes.theme.colors.keyForeground).toEqual({ r: 17, g: 17, b: 17, a: 1 });
    expect(brokenBaseRes.theme.background.imageUri).toBeNull();
  });
});

describe('compileThemeCss', () => {
  it('compiles scaled typography, borderless keys, and safe background image scrims', () => {
    const res = resolveTheme({
      systemMode: 'dark',
      systemAccent: SYSTEM_BLUE,
      baseLayer: {
        sourceLabel: 'theme.json',
        rawText: JSON.stringify({
          geometry: { keyRadius: 12, keyBorder: false },
          typography: { fontFamily: 'Inter, Noto Sans CJK SC', fontScale: 1.2 },
          background: { image: 'bg.png', size: 'contain', dim: 0.6 },
        }),
      },
      resolveBackgroundPath: () => ({
        uri: 'file:///home/user/.config/rumo/bg.png',
      }),
    });

    const css = compileThemeCss(res.theme);
    expect(css).toContain('font-family: Inter, "Noto Sans CJK SC";');
    expect(css).toContain('border-radius: 12px;');
    expect(css).toContain('border-bottom: none;');
    expect(css).toContain('background-color: rgba(0, 0, 0, 0);');
    expect(css).toContain('background-image: url("file:///home/user/.config/rumo/bg.png");');
    expect(css).toContain('background-size: contain;');
    expect(css).toContain('.rumo-keyboard.rumo-has-bg-image .rumo-keyboard-content');
    expect(css).toContain('background-color: rgba(0, 0, 0, 0.6);');
    expect(css).toContain('icon-size: 24px;'); // 20 * 1.2
    expect(css).toContain('font-size: 21.6px;'); // 18 * 1.2
    expect(css).toContain('.rumo-hide-icon');
    expect(css).toContain('border-radius: 8px 8px 0 0;');
    expect(css).toContain('height: 34px;'); // round(28 * 1.2)
    expect(css).toContain('height: 48px;'); // round(40 * 1.2)
    expect(css).toContain('min-height: 48px;');
    expect(css).toContain('max-height: 48px;');
    expect(css).toContain('.rumo-toolbar-btn');
    expect(css).toContain('.rumo-toolbar-toggle-btn');
    expect(css).toContain('.rumo-toolbar-icon');
  });
});
