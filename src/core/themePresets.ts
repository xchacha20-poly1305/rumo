import { COLOR_WHITE } from './themeColor.js';
import type {
  RgbaColor,
  SystemAccentPalette,
  ThemeColorKey,
  ThemeMode,
  ThemePresetId,
} from './themeTypes.js';

export interface ThemePresetDef {
  id: ThemePresetId;
  mode: ThemeMode;
  keyRadius: number;
  keyBorder: boolean;
  colors: Partial<Record<ThemeColorKey, RgbaColor>> & {
    keyboardBackground: RgbaColor;
    keyBackground: RgbaColor;
    keyForeground: RgbaColor;
    specialKeyBackground: RgbaColor;
    specialKeyForeground: RgbaColor;
    candidateForeground: RgbaColor;
    divider: RgbaColor;
  };
}

export const ADWAITA_ACCENT_PALETTE: Record<string, SystemAccentPalette> = {
  blue: { bg: { r: 53, g: 132, b: 228, a: 1 }, fg: { ...COLOR_WHITE } },
  teal: { bg: { r: 33, g: 144, b: 164, a: 1 }, fg: { ...COLOR_WHITE } },
  green: { bg: { r: 58, g: 148, b: 74, a: 1 }, fg: { ...COLOR_WHITE } },
  yellow: { bg: { r: 200, g: 136, b: 0, a: 1 }, fg: { ...COLOR_WHITE } },
  orange: { bg: { r: 237, g: 91, b: 0, a: 1 }, fg: { ...COLOR_WHITE } },
  red: { bg: { r: 230, g: 45, b: 66, a: 1 }, fg: { ...COLOR_WHITE } },
  pink: { bg: { r: 213, g: 97, b: 153, a: 1 }, fg: { ...COLOR_WHITE } },
  purple: { bg: { r: 145, g: 65, b: 172, a: 1 }, fg: { ...COLOR_WHITE } },
  slate: { bg: { r: 111, g: 131, b: 150, a: 1 }, fg: { ...COLOR_WHITE } },
};

export function getAdwaitaAccentPalette(name: string): SystemAccentPalette {
  const key = name.trim().toLowerCase();
  return ADWAITA_ACCENT_PALETTE[key] ?? ADWAITA_ACCENT_PALETTE.blue;
}

const DARK_COLORS: ThemePresetDef['colors'] = {
  keyboardBackground: { r: 24, g: 25, b: 29, a: 0.96 },
  keyBackground: { r: 58, g: 61, b: 70, a: 0.96 },
  keyForeground: { r: 255, g: 255, b: 255, a: 1 },
  specialKeyBackground: { r: 42, g: 44, b: 52, a: 0.96 },
  specialKeyForeground: { r: 215, g: 220, b: 230, a: 1 },
  candidateForeground: { r: 242, g: 244, b: 248, a: 1 },
  divider: { r: 255, g: 255, b: 255, a: 0.08 },
  keyBorderColor: { r: 0, g: 0, b: 0, a: 0.38 },
  altKeyForeground: { r: 184, g: 192, b: 208, a: 1 },
  spaceForeground: { r: 255, g: 255, b: 255, a: 0.78 },
  secondaryLabelForeground: { r: 215, g: 220, b: 230, a: 0.52 },
  statusForeground: { r: 255, g: 255, b: 255, a: 0.6 },
  separator: { r: 255, g: 255, b: 255, a: 0.14 },
  barActionBackground: { r: 255, g: 255, b: 255, a: 0.08 },
  barActionForeground: { r: 232, g: 235, b: 242, a: 1 },
};

const LIGHT_COLORS: ThemePresetDef['colors'] = {
  keyboardBackground: { r: 235, g: 237, b: 241, a: 0.97 },
  keyBackground: { r: 255, g: 255, b: 255, a: 0.98 },
  keyForeground: { r: 30, g: 32, b: 36, a: 1 },
  specialKeyBackground: { r: 213, g: 217, b: 225, a: 0.96 },
  specialKeyForeground: { r: 46, g: 52, b: 64, a: 1 },
  candidateForeground: { r: 30, g: 32, b: 36, a: 1 },
  divider: { r: 0, g: 0, b: 0, a: 0.1 },
  keyBorderColor: { r: 0, g: 0, b: 0, a: 0.16 },
  altKeyForeground: { r: 78, g: 86, b: 100, a: 1 },
  spaceForeground: { r: 30, g: 32, b: 36, a: 0.7 },
  secondaryLabelForeground: { r: 46, g: 52, b: 64, a: 0.54 },
  statusForeground: { r: 30, g: 32, b: 36, a: 0.58 },
  separator: { r: 0, g: 0, b: 0, a: 0.14 },
  barActionBackground: { r: 0, g: 0, b: 0, a: 0.07 },
  barActionForeground: { r: 36, g: 40, b: 48, a: 1 },
};

export const THEME_PRESETS: Record<ThemePresetId, ThemePresetDef> = {
  dark: {
    id: 'dark',
    mode: 'dark',
    keyRadius: 10,
    keyBorder: true,
    colors: DARK_COLORS,
  },
  light: {
    id: 'light',
    mode: 'light',
    keyRadius: 10,
    keyBorder: true,
    colors: LIGHT_COLORS,
  },
  amoled: {
    id: 'amoled',
    mode: 'dark',
    keyRadius: 10,
    keyBorder: true,
    colors: {
      ...DARK_COLORS,
      keyboardBackground: { r: 0, g: 0, b: 0, a: 0.98 },
      keyBackground: { r: 28, g: 30, b: 35, a: 0.98 },
      keyForeground: { r: 245, g: 247, b: 250, a: 1 },
      specialKeyBackground: { r: 16, g: 17, b: 20, a: 0.98 },
      specialKeyForeground: { r: 203, g: 210, b: 223, a: 1 },
      divider: { r: 255, g: 255, b: 255, a: 0.09 },
      keyBorderColor: { r: 0, g: 0, b: 0, a: 0.65 },
    },
  },
  'flat-dark': {
    id: 'flat-dark',
    mode: 'dark',
    keyRadius: 10,
    keyBorder: false,
    colors: {
      ...DARK_COLORS,
      keyBackground: { r: 0, g: 0, b: 0, a: 0 },
      specialKeyBackground: { r: 255, g: 255, b: 255, a: 0.06 },
    },
  },
  'flat-light': {
    id: 'flat-light',
    mode: 'light',
    keyRadius: 10,
    keyBorder: false,
    colors: {
      ...LIGHT_COLORS,
      keyBackground: { r: 0, g: 0, b: 0, a: 0 },
      specialKeyBackground: { r: 0, g: 0, b: 0, a: 0.06 },
    },
  },
};

export function isPresetId(value: string): value is ThemePresetId {
  return (
    value === 'dark' ||
    value === 'light' ||
    value === 'amoled' ||
    value === 'flat-dark' ||
    value === 'flat-light'
  );
}
