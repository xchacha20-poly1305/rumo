export type ThemeMode = 'dark' | 'light';

export type ThemePresetId =
  | 'dark'
  | 'light'
  | 'amoled'
  | 'flat-dark'
  | 'flat-light';

export type BackgroundSizeMode = 'cover' | 'contain';

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SystemAccentPalette {
  bg: RgbaColor;
  fg: RgbaColor;
}

export interface ThemeGeometry {
  keyRadius: number;
  keyBorder: boolean;
}

export interface ThemeTypography {
  fontFamily: string | null;
  fontScale: number;
}

export interface ThemeBackground {
  imageUri: string | null;
  size: BackgroundSizeMode;
  dim: number;
}

export type ThemeCoreColorKey =
  | 'accent'
  | 'accentForeground'
  | 'keyboardBackground'
  | 'keyBackground'
  | 'keyForeground'
  | 'specialKeyBackground'
  | 'specialKeyForeground'
  | 'candidateForeground'
  | 'divider';

export type ThemeFineColorKey =
  | 'keyboardBorder'
  | 'backgroundScrim'
  | 'candidateBarBackground'
  | 'preeditForeground'
  | 'candidatePrimaryBackground'
  | 'candidatePrimaryForeground'
  | 'candidateHoverBackground'
  | 'statusForeground'
  | 'separator'
  | 'barActionBackground'
  | 'barActionForeground'
  | 'barActionActiveBackground'
  | 'keyHoverBackground'
  | 'keyPressedBackground'
  | 'keyPressedForeground'
  | 'keyBorderColor'
  | 'activeKeyBackground'
  | 'activeKeyBorder'
  | 'altKeyBackground'
  | 'altKeyForeground'
  | 'spaceForeground'
  | 'secondaryLabelForeground'
  | 'secondaryLabelActiveForeground'
  | 'drawerRowBorder'
  | 'drawerSidebarBorder'
  | 'drawerSideButtonBackground'
  | 'paginationTrack'
  | 'paginationThumb';

export type ThemeColorKey = ThemeCoreColorKey | ThemeFineColorKey;

export interface ResolvedThemeColors extends Record<ThemeColorKey, RgbaColor> {
  accentHoverBackground: RgbaColor;
  barActionHoverBackground: RgbaColor;
  barActionActiveForeground: RgbaColor;
  barActionDisabledForeground: RgbaColor;
  barActionDisabledBackground: RgbaColor;
  specialKeyHoverBackground: RgbaColor;
  activeKeyForeground: RgbaColor;
  drawerSideButtonForeground: RgbaColor;
  drawerSideButtonHoverBackground: RgbaColor;
  drawerMoreBackground: RgbaColor;
  drawerMoreForeground: RgbaColor;
  drawerMoreHoverBackground: RgbaColor;
  symbolTabForeground: RgbaColor;
  symbolTabHoverBackground: RgbaColor;
  symbolTabActiveBackground: RgbaColor;
  symbolEmptyForeground: RgbaColor;
}

export interface ResolvedTheme {
  preset: ThemePresetId;
  mode: ThemeMode;
  geometry: ThemeGeometry;
  typography: ThemeTypography;
  background: ThemeBackground;
  colors: ResolvedThemeColors;
}

export interface AppliedThemeState {
  mode: ThemeMode;
  keyBorder: boolean;
  hasBackgroundImage: boolean;
}

export interface ThemeLayerInput {
  sourceLabel: string;
  rawText: string;
}

export type BackgroundPathResult = { uri: string } | { error: string };

export interface ResolveThemeInput {
  systemMode: ThemeMode;
  systemAccent: SystemAccentPalette;
  baseLayer?: ThemeLayerInput | null;
  modeLayer?: ThemeLayerInput | null;
  resolveBackgroundPath?: (rawPath: string) => BackgroundPathResult;
}

export interface ResolveThemeResult {
  theme: ResolvedTheme;
  warnings: string[];
}
