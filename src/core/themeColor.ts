import type { RgbaColor } from './themeTypes.js';

export const COLOR_WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };
export const COLOR_DARK_TEXT: RgbaColor = { r: 26, g: 28, b: 32, a: 1 };
export const COLOR_BLACK: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };
export const COLOR_TRANSPARENT: RgbaColor = { r: 0, g: 0, b: 0, a: 0 };

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function clampUnit(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function parseHexDigit(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 102) return code - 87; // a-f
  if (code >= 65 && code <= 70) return code - 55; // A-F
  return -1;
}

function parseHexByte(s: string, offset: number): number {
  const hi = parseHexDigit(s.charCodeAt(offset));
  const lo = parseHexDigit(s.charCodeAt(offset + 1));
  if (hi < 0 || lo < 0) return -1;
  return hi * 16 + lo;
}

function parseStrictFiniteNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let idx = 0;
  if (trimmed[0] === '+' || trimmed[0] === '-') {
    idx = 1;
    if (idx >= trimmed.length) return null;
  }

  let seenDigit = false;
  let seenDot = false;
  for (; idx < trimmed.length; idx++) {
    const code = trimmed.charCodeAt(idx);
    if (code >= 48 && code <= 57) {
      seenDigit = true;
    } else if (code === 46 && !seenDot) {
      seenDot = true;
    } else {
      return null;
    }
  }

  if (!seenDigit) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAlphaComponent(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.endsWith('%')) {
    const pct = parseStrictFiniteNumber(trimmed.slice(0, -1));
    if (pct === null || pct < 0 || pct > 100) return null;
    return pct / 100;
  }
  const num = parseStrictFiniteNumber(trimmed);
  if (num === null || num < 0 || num > 1) return null;
  return num;
}

function parseRgbChannel(raw: string): number | null {
  const num = parseStrictFiniteNumber(raw);
  if (num === null || num < 0 || num > 255) return null;
  return clampByte(num);
}

/**
 * Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(...)`, `rgba(...)`, or `transparent`.
 * Uses explicit character validation rather than regex.
 */
export function parseColor(input: string): RgbaColor | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s.length === 0) return null;
  if (s === 'transparent') {
    return { ...COLOR_TRANSPARENT };
  }

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const rNib = parseHexDigit(hex.charCodeAt(0));
      const gNib = parseHexDigit(hex.charCodeAt(1));
      const bNib = parseHexDigit(hex.charCodeAt(2));
      const aNib = hex.length === 4 ? parseHexDigit(hex.charCodeAt(3)) : 15;
      if (rNib < 0 || gNib < 0 || bNib < 0 || aNib < 0) return null;
      return {
        r: rNib * 17,
        g: gNib * 17,
        b: bNib * 17,
        a: (aNib * 17) / 255,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseHexByte(hex, 0);
      const g = parseHexByte(hex, 2);
      const b = parseHexByte(hex, 4);
      const a = hex.length === 8 ? parseHexByte(hex, 6) : 255;
      if (r < 0 || g < 0 || b < 0 || a < 0) return null;
      return { r, g, b, a: a / 255 };
    }
    return null;
  }

  const isRgba = s.startsWith('rgba(');
  const isRgb = !isRgba && s.startsWith('rgb(');
  if ((isRgb || isRgba) && s.endsWith(')')) {
    const inner = s.slice(isRgba ? 5 : 4, -1);
    const parts = inner.split(',');
    const expectedLen = isRgba ? 4 : 3;
    if (parts.length !== expectedLen) return null;

    const r = parseRgbChannel(parts[0]);
    const g = parseRgbChannel(parts[1]);
    const b = parseRgbChannel(parts[2]);
    if (r === null || g === null || b === null) return null;

    let a = 1;
    if (isRgba) {
      const parsedAlpha = parseAlphaComponent(parts[3]);
      if (parsedAlpha === null) return null;
      a = parsedAlpha;
    }

    return { r, g, b, a };
  }

  return null;
}

export function formatRgba(color: RgbaColor): string {
  const r = clampByte(color.r);
  const g = clampByte(color.g);
  const b = clampByte(color.b);
  const aRounded = Math.round(clampUnit(color.a) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${aRounded})`;
}

export function withAlpha(color: RgbaColor, alpha: number): RgbaColor {
  return {
    r: clampByte(color.r),
    g: clampByte(color.g),
    b: clampByte(color.b),
    a: clampUnit(alpha),
  };
}

export function compositeOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const aFg = clampUnit(fg.a);
  const aBg = clampUnit(bg.a);
  const outA = aFg + aBg * (1 - aFg);
  if (outA <= 0) return { ...COLOR_TRANSPARENT };

  return {
    r: clampByte((fg.r * aFg + bg.r * aBg * (1 - aFg)) / outA),
    g: clampByte((fg.g * aFg + bg.g * aBg * (1 - aFg)) / outA),
    b: clampByte((fg.b * aFg + bg.b * aBg * (1 - aFg)) / outA),
    a: outA,
  };
}

export function mixColor(a: RgbaColor, b: RgbaColor, weightB: number): RgbaColor {
  const t = clampUnit(weightB);
  const inv = 1 - t;
  return {
    r: clampByte(a.r * inv + b.r * t),
    g: clampByte(a.g * inv + b.g * t),
    b: clampByte(a.b * inv + b.b * t),
    a: clampUnit(a.a),
  };
}

export function lighten(color: RgbaColor, amount: number): RgbaColor {
  return mixColor(color, COLOR_WHITE, amount);
}

export function darken(color: RgbaColor, amount: number): RgbaColor {
  return mixColor(color, COLOR_BLACK, amount);
}

function linearizeChannel(channel255: number): number {
  const c = clampByte(channel255) / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: RgbaColor): number {
  const r = linearizeChannel(color.r);
  const g = linearizeChannel(color.g);
  const b = linearizeChannel(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: RgbaColor, b: RgbaColor): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickReadableForeground(bg: RgbaColor): RgbaColor {
  const opaqueBg = bg.a < 1 ? compositeOver(bg, COLOR_DARK_TEXT) : bg;
  const whiteContrast = contrastRatio(COLOR_WHITE, opaqueBg);
  const darkContrast = contrastRatio(COLOR_DARK_TEXT, opaqueBg);
  return whiteContrast >= darkContrast ? { ...COLOR_WHITE } : { ...COLOR_DARK_TEXT };
}

function isSafeFontChar(code: number): boolean {
  if (code < 0x20 || code === 0x7f) return false;
  // Disallow CSS / string delimiters inside family names
  return (
    code !== 59 && // ;
    code !== 123 && // {
    code !== 125 && // }
    code !== 92 && // \
    code !== 34 && // "
    code !== 39 && // '
    code !== 40 && // (
    code !== 41 // )
  );
}

/**
 * Validates and normalizes a CSS font-family list without regex.
 */
export function sanitizeFontFamily(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;

  const rawParts = trimmed.split(',');
  const cleaned: string[] = [];

  for (const part of rawParts) {
    let entry = part.trim();
    if (entry.length === 0) return null;

    if (
      entry.length >= 2 &&
      ((entry.startsWith('"') && entry.endsWith('"')) ||
        (entry.startsWith("'") && entry.endsWith("'")))
    ) {
      entry = entry.slice(1, -1).trim();
    }

    if (entry.length === 0) return null;
    for (let i = 0; i < entry.length; i++) {
      if (!isSafeFontChar(entry.charCodeAt(i))) {
        return null;
      }
    }

    cleaned.push(entry.includes(' ') ? `"${entry}"` : entry);
  }

  return cleaned.length > 0 ? cleaned.join(', ') : null;
}

export function isSafeCssUri(uri: string): boolean {
  if (typeof uri !== 'string' || !uri.startsWith('file://') || uri.length <= 7) {
    return false;
  }
  for (let i = 0; i < uri.length; i++) {
    const code = uri.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
    if (
      code === 34 || // "
      code === 39 || // '
      code === 40 || // (
      code === 41 || // )
      code === 92 || // \
      code === 59 || // ;
      code === 123 || // {
      code === 125 // }
    ) {
      return false;
    }
  }
  return true;
}
