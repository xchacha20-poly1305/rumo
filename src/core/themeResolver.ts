import {
  COLOR_BLACK,
  COLOR_DARK_TEXT,
  COLOR_TRANSPARENT,
  COLOR_WHITE,
  clampUnit,
  compositeOver,
  darken,
  isSafeCssUri,
  lighten,
  mixColor,
  parseColor,
  pickReadableForeground,
  sanitizeFontFamily,
  withAlpha,
} from './themeColor.js';
import { THEME_PRESETS, isPresetId } from './themePresets.js';
import type {
  BackgroundSizeMode,
  ResolveThemeInput,
  ResolveThemeResult,
  ResolvedThemeColors,
  RgbaColor,
  ThemeColorKey,
  ThemeLayerInput,
  ThemeMode,
  ThemePresetId,
} from './themeTypes.js';

const KEY_RADIUS_MIN = 0;
const KEY_RADIUS_MAX = 24;
const FONT_SCALE_MIN = 0.75;
const FONT_SCALE_MAX = 1.4;
const BG_DIM_MIN = 0;
const BG_DIM_MAX = 0.95;

const KNOWN_TOP_KEYS = new Set([
  '$schema',
  'extends',
  'geometry',
  'typography',
  'background',
  'colors',
]);

const KNOWN_GEOMETRY_KEYS = new Set(['keyRadius', 'keyBorder']);
const KNOWN_TYPOGRAPHY_KEYS = new Set(['fontFamily', 'fontScale']);
const KNOWN_BACKGROUND_KEYS = new Set(['image', 'size', 'dim']);
const KNOWN_COLOR_KEYS = new Set<string>([
  'accent',
  'accentForeground',
  'keyboardBackground',
  'keyBackground',
  'keyForeground',
  'specialKeyBackground',
  'specialKeyForeground',
  'candidateForeground',
  'divider',
  'keyboardBorder',
  'backgroundScrim',
  'candidateBarBackground',
  'preeditForeground',
  'candidatePrimaryBackground',
  'candidatePrimaryForeground',
  'candidateHoverBackground',
  'statusForeground',
  'separator',
  'barActionBackground',
  'barActionForeground',
  'barActionActiveBackground',
  'keyHoverBackground',
  'keyPressedBackground',
  'keyPressedForeground',
  'keyBorderColor',
  'activeKeyBackground',
  'activeKeyBorder',
  'altKeyBackground',
  'altKeyForeground',
  'spaceForeground',
  'secondaryLabelForeground',
  'secondaryLabelActiveForeground',
  'drawerRowBorder',
  'drawerSidebarBorder',
  'drawerSideButtonBackground',
  'paginationTrack',
  'paginationThumb',
]);

interface ParsedLayerData {
  sourceLabel: string;
  extendsPreset?: ThemePresetId;
  keyRadius?: number;
  keyBorder?: boolean;
  fontFamily?: string | null;
  fontScale?: number;
  backgroundImage?: string | null;
  backgroundSize?: BackgroundSizeMode;
  backgroundDim?: number;
  accentMode?: 'system' | RgbaColor;
  accentForegroundMode?: 'auto' | RgbaColor;
  colors: Partial<Record<ThemeColorKey, RgbaColor>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampFiniteNumber(
  raw: unknown,
  min: number,
  max: number,
  fieldLabel: string,
  sourceLabel: string,
  warnings: string[],
): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    warnings.push(`${sourceLabel}: "${fieldLabel}" must be a finite number; ignoring`);
    return undefined;
  }
  if (raw < min || raw > max) {
    const clamped = Math.max(min, Math.min(max, raw));
    warnings.push(
      `${sourceLabel}: "${fieldLabel}" (${raw}) out of range [${min}, ${max}]; clamped to ${clamped}`,
    );
    return clamped;
  }
  return raw;
}

function warnUnknownKeys(
  obj: Record<string, unknown>,
  known: Set<string>,
  prefix: string,
  sourceLabel: string,
  warnings: string[],
): void {
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      warnings.push(`${sourceLabel}: unknown field "${prefix}${key}" ignored`);
    }
  }
}

function parseLayer(
  layer: ThemeLayerInput | null | undefined,
  resolveBackgroundPath: ResolveThemeInput['resolveBackgroundPath'],
  warnings: string[],
): ParsedLayerData | null {
  if (!layer) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(layer.rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`${layer.sourceLabel}: invalid JSON (${msg}); skipping file`);
    return null;
  }

  if (!isPlainObject(parsedJson)) {
    warnings.push(`${layer.sourceLabel}: root must be a JSON object; skipping file`);
    return null;
  }

  warnUnknownKeys(parsedJson, KNOWN_TOP_KEYS, '', layer.sourceLabel, warnings);

  const out: ParsedLayerData = {
    sourceLabel: layer.sourceLabel,
    colors: {},
  };

  if (parsedJson.extends !== undefined) {
    if (typeof parsedJson.extends === 'string' && isPresetId(parsedJson.extends)) {
      out.extendsPreset = parsedJson.extends;
    } else {
      warnings.push(
        `${layer.sourceLabel}: invalid "extends" preset "${String(parsedJson.extends)}"; ignoring`,
      );
    }
  }

  if (parsedJson.geometry !== undefined) {
    if (!isPlainObject(parsedJson.geometry)) {
      warnings.push(`${layer.sourceLabel}: "geometry" must be an object; ignoring`);
    } else {
      warnUnknownKeys(
        parsedJson.geometry,
        KNOWN_GEOMETRY_KEYS,
        'geometry.',
        layer.sourceLabel,
        warnings,
      );
      if (parsedJson.geometry.keyRadius !== undefined) {
        out.keyRadius = clampFiniteNumber(
          parsedJson.geometry.keyRadius,
          KEY_RADIUS_MIN,
          KEY_RADIUS_MAX,
          'geometry.keyRadius',
          layer.sourceLabel,
          warnings,
        );
      }
      if (parsedJson.geometry.keyBorder !== undefined) {
        if (typeof parsedJson.geometry.keyBorder === 'boolean') {
          out.keyBorder = parsedJson.geometry.keyBorder;
        } else {
          warnings.push(
            `${layer.sourceLabel}: "geometry.keyBorder" must be a boolean; ignoring`,
          );
        }
      }
    }
  }

  if (parsedJson.typography !== undefined) {
    if (!isPlainObject(parsedJson.typography)) {
      warnings.push(`${layer.sourceLabel}: "typography" must be an object; ignoring`);
    } else {
      warnUnknownKeys(
        parsedJson.typography,
        KNOWN_TYPOGRAPHY_KEYS,
        'typography.',
        layer.sourceLabel,
        warnings,
      );
      if (parsedJson.typography.fontFamily !== undefined) {
        if (parsedJson.typography.fontFamily === null) {
          out.fontFamily = null;
        } else if (typeof parsedJson.typography.fontFamily === 'string') {
          const sanitized = sanitizeFontFamily(parsedJson.typography.fontFamily);
          if (sanitized !== null) {
            out.fontFamily = sanitized;
          } else {
            warnings.push(
              `${layer.sourceLabel}: invalid "typography.fontFamily"; ignoring`,
            );
          }
        } else {
          warnings.push(
            `${layer.sourceLabel}: "typography.fontFamily" must be a string or null; ignoring`,
          );
        }
      }
      if (parsedJson.typography.fontScale !== undefined) {
        out.fontScale = clampFiniteNumber(
          parsedJson.typography.fontScale,
          FONT_SCALE_MIN,
          FONT_SCALE_MAX,
          'typography.fontScale',
          layer.sourceLabel,
          warnings,
        );
      }
    }
  }

  if (parsedJson.background !== undefined) {
    if (!isPlainObject(parsedJson.background)) {
      warnings.push(`${layer.sourceLabel}: "background" must be an object; ignoring`);
    } else {
      warnUnknownKeys(
        parsedJson.background,
        KNOWN_BACKGROUND_KEYS,
        'background.',
        layer.sourceLabel,
        warnings,
      );
      if (parsedJson.background.image !== undefined) {
        if (parsedJson.background.image === null || parsedJson.background.image === '') {
          out.backgroundImage = null;
        } else if (typeof parsedJson.background.image === 'string') {
          const rawPath = parsedJson.background.image.trim();
          if (rawPath.length === 0) {
            out.backgroundImage = null;
          } else if (resolveBackgroundPath) {
            const resolved = resolveBackgroundPath(rawPath);
            if ('uri' in resolved) {
              if (isSafeCssUri(resolved.uri)) {
                out.backgroundImage = resolved.uri;
              } else {
                warnings.push(
                  `${layer.sourceLabel}: unsafe "background.image" URI rejected`,
                );
              }
            } else {
              warnings.push(
                `${layer.sourceLabel}: "background.image" (${resolved.error}); disabling image`,
              );
              out.backgroundImage = null;
            }
          } else if (isSafeCssUri(rawPath)) {
            out.backgroundImage = rawPath;
          } else {
            warnings.push(
              `${layer.sourceLabel}: "background.image" cannot be resolved; disabling image`,
            );
            out.backgroundImage = null;
          }
        } else {
          warnings.push(
            `${layer.sourceLabel}: "background.image" must be a string or null; ignoring`,
          );
        }
      }

      if (parsedJson.background.size !== undefined) {
        if (
          parsedJson.background.size === 'cover' ||
          parsedJson.background.size === 'contain'
        ) {
          out.backgroundSize = parsedJson.background.size;
        } else {
          warnings.push(
            `${layer.sourceLabel}: "background.size" must be "cover" or "contain"; ignoring`,
          );
        }
      }

      if (parsedJson.background.dim !== undefined) {
        out.backgroundDim = clampFiniteNumber(
          parsedJson.background.dim,
          BG_DIM_MIN,
          BG_DIM_MAX,
          'background.dim',
          layer.sourceLabel,
          warnings,
        );
      }
    }
  }

  if (parsedJson.colors !== undefined) {
    if (!isPlainObject(parsedJson.colors)) {
      warnings.push(`${layer.sourceLabel}: "colors" must be an object; ignoring`);
    } else {
      warnUnknownKeys(
        parsedJson.colors,
        KNOWN_COLOR_KEYS,
        'colors.',
        layer.sourceLabel,
        warnings,
      );
      for (const [key, rawVal] of Object.entries(parsedJson.colors)) {
        if (!KNOWN_COLOR_KEYS.has(key)) continue;
        if (typeof rawVal !== 'string') {
          warnings.push(
            `${layer.sourceLabel}: "colors.${key}" must be a color string; ignoring`,
          );
          continue;
        }

        const lowered = rawVal.trim().toLowerCase();
        if (key === 'accent' && lowered === 'system') {
          out.accentMode = 'system';
          continue;
        }
        if (key === 'accentForeground' && lowered === 'auto') {
          out.accentForegroundMode = 'auto';
          continue;
        }

        const parsedColor = parseColor(rawVal);
        if (!parsedColor) {
          warnings.push(
            `${layer.sourceLabel}: invalid color "${rawVal}" for "colors.${key}"; ignoring`,
          );
          continue;
        }

        if (key === 'accent') {
          out.accentMode = parsedColor;
        } else if (key === 'accentForeground') {
          out.accentForegroundMode = parsedColor;
        } else {
          out.colors[key as ThemeColorKey] = parsedColor;
        }
      }
    }
  }

  return out;
}

function buildResolvedColors(
  mode: ThemeMode,
  keyBorder: boolean,
  bgDim: number,
  systemAccent: ResolveThemeInput['systemAccent'],
  presetColors: Partial<Record<ThemeColorKey, RgbaColor>>,
  userColors: Partial<Record<ThemeColorKey, RgbaColor>>,
  accentMode: 'system' | RgbaColor,
  accentForegroundMode: 'auto' | RgbaColor,
): ResolvedThemeColors {
  const isDark = mode === 'dark';
  const pick = (key: ThemeColorKey): RgbaColor | undefined =>
    userColors[key] ?? presetColors[key];

  const accent = accentMode === 'system' ? systemAccent.bg : accentMode;
  const accentForeground =
    accentForegroundMode === 'auto'
      ? accentMode === 'system'
        ? systemAccent.fg
        : pickReadableForeground(accent)
      : accentForegroundMode;

  const keyboardBackground = pick('keyboardBackground')!;
  const keyForeground = pick('keyForeground')!;
  const specialKeyBackground = pick('specialKeyBackground')!;
  const specialKeyForeground = pick('specialKeyForeground')!;
  const candidateForeground = pick('candidateForeground')!;
  const divider = pick('divider')!;

  const keyBackground =
    userColors.keyBackground ??
    (!keyBorder ? { ...COLOR_TRANSPARENT } : presetColors.keyBackground!);

  const accentHoverBackground = isDark ? lighten(accent, 0.14) : darken(accent, 0.12);

  const keyboardBorder =
    pick('keyboardBorder') ?? divider;
  const backgroundScrim =
    pick('backgroundScrim') ??
    withAlpha(isDark ? COLOR_BLACK : COLOR_WHITE, clampUnit(bgDim));
  const candidateBarBackground =
    pick('candidateBarBackground') ?? { ...COLOR_TRANSPARENT };

  const preeditForeground =
    pick('preeditForeground') ??
    (isDark ? lighten(accent, 0.45) : darken(accent, 0.18));

  const candidatePrimaryBackground =
    pick('candidatePrimaryBackground') ?? withAlpha(accent, isDark ? 0.24 : 0.16);
  const candidatePrimaryForeground =
    pick('candidatePrimaryForeground') ??
    (isDark ? { ...COLOR_WHITE } : darken(accent, 0.25));
  const candidateHoverBackground =
    pick('candidateHoverBackground') ?? withAlpha(accent, isDark ? 0.28 : 0.18);

  const statusForeground =
    pick('statusForeground') ?? withAlpha(candidateForeground, 0.6);
  const separator =
    pick('separator') ??
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.14);

  const barActionBackground =
    pick('barActionBackground') ??
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.08);
  const barActionForeground =
    pick('barActionForeground') ?? mixColor(candidateForeground, keyForeground, 0.5);
  const barActionHoverBackground =
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, isDark ? 0.2 : 0.14);
  const barActionActiveBackground =
    pick('barActionActiveBackground') ?? withAlpha(accent, isDark ? 0.42 : 0.24);
  const barActionActiveForeground =
    isDark
      ? { ...COLOR_WHITE }
      : pickReadableForeground(compositeOver(barActionActiveBackground, keyboardBackground));
  const barActionDisabledForeground =
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, isDark ? 0.22 : 0.28);
  const barActionDisabledBackground =
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, isDark ? 0.03 : 0.03);

  const keyHoverBackground =
    pick('keyHoverBackground') ??
    (keyBackground.a <= 0.01
      ? withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.1)
      : isDark
        ? lighten(keyBackground, 0.09)
        : darken(keyBackground, 0.06));

  const specialKeyHoverBackground =
    specialKeyBackground.a <= 0.01
      ? withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.12)
      : isDark
        ? lighten(specialKeyBackground, 0.09)
        : darken(specialKeyBackground, 0.06);

  const keyPressedBackground =
    pick('keyPressedBackground') ?? withAlpha(accent, isDark ? 0.72 : 0.34);
  const keyPressedForeground =
    pick('keyPressedForeground') ??
    pickReadableForeground(compositeOver(keyPressedBackground, keyboardBackground));

  const keyBorderColor =
    pick('keyBorderColor') ??
    withAlpha(COLOR_BLACK, isDark ? 0.38 : 0.16);

  const activeKeyBackground =
    pick('activeKeyBackground') ?? withAlpha(accent, isDark ? 0.42 : 0.24);
  const activeKeyBorder =
    pick('activeKeyBorder') ?? withAlpha(isDark ? lighten(accent, 0.3) : accent, 0.65);
  const activeKeyForeground = isDark
    ? { ...COLOR_WHITE }
    : pickReadableForeground(compositeOver(activeKeyBackground, keyboardBackground));

  const altKeyBackground = pick('altKeyBackground') ?? keyBackground;
  const altKeyForeground =
    pick('altKeyForeground') ??
    (isDark ? mixColor(keyForeground, COLOR_DARK_TEXT, 0.28) : withAlpha(keyForeground, 0.76));

  const spaceForeground =
    pick('spaceForeground') ?? withAlpha(keyForeground, isDark ? 0.78 : 0.72);
  const secondaryLabelForeground =
    pick('secondaryLabelForeground') ?? withAlpha(specialKeyForeground, 0.54);
  const secondaryLabelActiveForeground =
    pick('secondaryLabelActiveForeground') ??
    (isDark ? lighten(accent, 0.45) : darken(accent, 0.15));

  const drawerRowBorder =
    pick('drawerRowBorder') ??
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, isDark ? 0.05 : 0.07);
  const drawerSidebarBorder =
    pick('drawerSidebarBorder') ?? divider;
  const drawerSideButtonBackground =
    pick('drawerSideButtonBackground') ??
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.07);
  const drawerSideButtonForeground = barActionForeground;
  const drawerSideButtonHoverBackground =
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, isDark ? 0.18 : 0.14);

  const drawerMoreBackground =
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.06);
  const drawerMoreForeground =
    withAlpha(candidateForeground, 0.75);
  const drawerMoreHoverBackground =
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.14);

  const symbolTabForeground = withAlpha(barActionForeground, 0.58);
  const symbolTabHoverBackground =
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.1);
  const symbolTabActiveBackground = withAlpha(accent, isDark ? 0.34 : 0.2);
  const symbolEmptyForeground = withAlpha(candidateForeground, 0.45);

  const paginationTrack =
    pick('paginationTrack') ??
    withAlpha(isDark ? COLOR_WHITE : COLOR_BLACK, 0.12);
  const paginationThumb =
    pick('paginationThumb') ??
    (isDark ? lighten(accent, 0.22) : accent);

  return {
    accent,
    accentForeground,
    accentHoverBackground,
    keyboardBackground,
    keyboardBorder,
    backgroundScrim,
    candidateBarBackground,
    candidateForeground,
    divider,
    preeditForeground,
    candidatePrimaryBackground,
    candidatePrimaryForeground,
    candidateHoverBackground,
    statusForeground,
    separator,
    barActionBackground,
    barActionForeground,
    barActionHoverBackground,
    barActionActiveBackground,
    barActionActiveForeground,
    barActionDisabledForeground,
    barActionDisabledBackground,
    keyBackground,
    keyForeground,
    keyHoverBackground,
    keyPressedBackground,
    keyPressedForeground,
    keyBorderColor,
    specialKeyBackground,
    specialKeyForeground,
    specialKeyHoverBackground,
    activeKeyBackground,
    activeKeyBorder,
    activeKeyForeground,
    altKeyBackground,
    altKeyForeground,
    spaceForeground,
    secondaryLabelForeground,
    secondaryLabelActiveForeground,
    drawerRowBorder,
    drawerSidebarBorder,
    drawerSideButtonBackground,
    drawerSideButtonForeground,
    drawerSideButtonHoverBackground,
    drawerMoreBackground,
    drawerMoreForeground,
    drawerMoreHoverBackground,
    symbolTabForeground,
    symbolTabHoverBackground,
    symbolTabActiveBackground,
    symbolEmptyForeground,
    paginationTrack,
    paginationThumb,
  };
}

export function resolveTheme(input: ResolveThemeInput): ResolveThemeResult {
  const warnings: string[] = [];

  const baseParsed = parseLayer(input.baseLayer, input.resolveBackgroundPath, warnings);
  const modeParsed = parseLayer(input.modeLayer, input.resolveBackgroundPath, warnings);

  let presetId: ThemePresetId = input.systemMode;
  if (baseParsed?.extendsPreset) {
    presetId = baseParsed.extendsPreset;
  }
  if (modeParsed?.extendsPreset) {
    presetId = modeParsed.extendsPreset;
  }

  const preset = THEME_PRESETS[presetId];
  let keyRadius = preset.keyRadius;
  let keyBorder = preset.keyBorder;
  let fontFamily: string | null = null;
  let fontScale = 1.0;
  let imageUri: string | null = null;
  let size: BackgroundSizeMode = 'cover';
  let dim = preset.mode === 'dark' ? 0.45 : 0.55;
  let accentMode: 'system' | RgbaColor = 'system';
  let accentForegroundMode: 'auto' | RgbaColor = 'auto';
  const userColors: Partial<Record<ThemeColorKey, RgbaColor>> = {};

  for (const layer of [baseParsed, modeParsed]) {
    if (!layer) continue;
    if (layer.keyRadius !== undefined) keyRadius = layer.keyRadius;
    if (layer.keyBorder !== undefined) keyBorder = layer.keyBorder;
    if (layer.fontFamily !== undefined) fontFamily = layer.fontFamily;
    if (layer.fontScale !== undefined) fontScale = layer.fontScale;
    if (layer.backgroundImage !== undefined) imageUri = layer.backgroundImage;
    if (layer.backgroundSize !== undefined) size = layer.backgroundSize;
    if (layer.backgroundDim !== undefined) dim = layer.backgroundDim;
    if (layer.accentMode !== undefined) accentMode = layer.accentMode;
    if (layer.accentForegroundMode !== undefined) {
      accentForegroundMode = layer.accentForegroundMode;
    }
    for (const [k, v] of Object.entries(layer.colors)) {
      if (v) {
        userColors[k as ThemeColorKey] = v;
      }
    }
  }

  const colors = buildResolvedColors(
    preset.mode,
    keyBorder,
    dim,
    input.systemAccent,
    preset.colors,
    userColors,
    accentMode,
    accentForegroundMode,
  );

  return {
    theme: {
      preset: presetId,
      mode: preset.mode,
      geometry: { keyRadius, keyBorder },
      typography: { fontFamily, fontScale },
      background: { imageUri, size, dim },
      colors,
    },
    warnings,
  };
}
