import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { isSafeCssUri } from '../core/themeColor.js';
import { compileThemeCss } from '../core/themeCssCompiler.js';
import { getAdwaitaAccentPalette } from '../core/themePresets.js';
import { resolveTheme } from '../core/themeResolver.js';
import type {
  AppliedThemeState,
  BackgroundPathResult,
  RgbaColor,
  SystemAccentPalette,
  ThemeLayerInput,
  ThemeMode,
} from '../core/themeTypes.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const FILE_RELOAD_DEBOUNCE_MS = 150;
const SETTINGS_RELOAD_DEBOUNCE_MS = 40;

const WATCHED_CONFIG_FILES = new Set([
  'theme.json',
  'theme-light.json',
  'theme-dark.json',
  'custom.css',
]);

export interface ThemeManagerCallbacks {
  onThemeApplied(state: AppliedThemeState): void;
}

export class ThemeManager {
  private readonly _configParentDir: string;
  private readonly _configDir: string;
  private readonly _cacheDir: string;

  private _stSettings: any = null;
  private _stSignalIds: number[] = [];
  private _interfaceSettings: any = null;
  private _interfaceSignalIds: number[] = [];
  private _themeContext: any = null;
  private _themeContextSignalId = 0;

  private _monitor: any = null;
  private _monitorSignalId = 0;
  private _monitoringConfigDir = false;
  private _debounceId = 0;

  private _attachedTheme: any = null;
  private _loadedGeneratedFile: any = null;
  private _loadedGeneratedPath: string | null = null;
  private _loadedCustomFile: any = null;
  private _trackedBgBasename: string | null = null;
  private _seq = 0;
  private _destroyed = false;

  constructor(private readonly _callbacks: ThemeManagerCallbacks) {
    this._configParentDir = GLib.get_user_config_dir();
    this._configDir = GLib.build_filenamev([this._configParentDir, 'rumo']);
    this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'rumo']);

    this._sweepStaleCacheFiles();
    this._connectSystemSignals();
    this._setupMonitor();
    this.reload();
  }

  reload(): void {
    if (this._destroyed) return;

    const systemMode = this._getSystemMode();
    const systemAccent = this._getSystemAccent();

    const baseLayer = this._readOptionalLayer(
      GLib.build_filenamev([this._configDir, 'theme.json']),
      'theme.json',
    );
    const modeFilename = systemMode === 'dark' ? 'theme-dark.json' : 'theme-light.json';
    const modeLayer = this._readOptionalLayer(
      GLib.build_filenamev([this._configDir, modeFilename]),
      modeFilename,
    );

    let nextTrackedBgBasename: string | null = null;
    const resolveBackgroundPath = (rawPath: string): BackgroundPathResult => {
      const resolved = this._resolveBackgroundFile(rawPath);
      if ('uri' in resolved && resolved.trackedBasename) {
        nextTrackedBgBasename = resolved.trackedBasename;
      }
      return 'uri' in resolved ? { uri: resolved.uri } : { error: resolved.error };
    };

    const result = resolveTheme({
      systemMode,
      systemAccent,
      baseLayer,
      modeLayer,
      resolveBackgroundPath,
    });

    this._trackedBgBasename = nextTrackedBgBasename;

    for (const warning of result.warnings) {
      console.warn('[Rumo][Theme]', warning);
    }

    const css = compileThemeCss(result.theme);
    this._applyStylesheets(css);

    this._callbacks.onThemeApplied({
      mode: result.theme.mode,
      keyBorder: result.theme.geometry.keyBorder,
      hasBackgroundImage: result.theme.background.imageUri !== null,
      fontScale: result.theme.typography.fontScale,
    });
  }

  private _connectSystemSignals(): void {
    try {
      this._stSettings = St.Settings.get();
    } catch {
      this._stSettings = null;
    }

    if (this._stSettings) {
      for (const prop of ['color-scheme', 'accent-color', 'high-contrast']) {
        const id = this._stSettings.connect(`notify::${prop}`, () => {
          this._scheduleReload(SETTINGS_RELOAD_DEBOUNCE_MS);
        });
        this._stSignalIds.push(id);
      }
    } else {
      try {
        this._interfaceSettings = new Gio.Settings({ schema_id: INTERFACE_SCHEMA });
        for (const key of ['color-scheme', 'accent-color']) {
          const id = this._interfaceSettings.connect(`changed::${key}`, () => {
            this._scheduleReload(SETTINGS_RELOAD_DEBOUNCE_MS);
          });
          this._interfaceSignalIds.push(id);
        }
      } catch (err) {
        console.warn('[Rumo][Theme] Failed to bind interface settings fallback:', err);
      }
    }

    try {
      this._themeContext = St.ThemeContext.get_for_stage(global.stage);
      this._themeContextSignalId = this._themeContext.connect('changed', () => {
        this._onThemeContextChanged();
      });
    } catch (err) {
      console.warn('[Rumo][Theme] Failed to bind St.ThemeContext:', err);
    }
  }

  private _onThemeContextChanged(): void {
    if (this._destroyed || !this._themeContext) return;
    const currentTheme = this._themeContext.get_theme();
    if (!currentTheme || currentTheme === this._attachedTheme) return;

    this._attachedTheme = currentTheme;
    if (this._loadedGeneratedFile) {
      try {
        currentTheme.load_stylesheet(this._loadedGeneratedFile);
      } catch (err) {
        console.warn('[Rumo][Theme] Failed to re-attach generated stylesheet:', err);
      }
    }
    this._loadCustomStylesheet(currentTheme);
  }

  private _getSystemMode(): ThemeMode {
    if (this._stSettings) {
      const darkValue = St.SystemColorScheme?.PREFER_DARK ?? 1;
      return this._stSettings.color_scheme === darkValue ? 'dark' : 'light';
    }

    if (this._interfaceSettings) {
      const scheme = this._interfaceSettings.get_string('color-scheme');
      return scheme === 'prefer-dark' ? 'dark' : 'light';
    }

    return 'dark';
  }

  private _getSystemAccent(): SystemAccentPalette {
    if (this._themeContext?.get_accent_color) {
      try {
        const res = this._themeContext.get_accent_color();
        if (Array.isArray(res) && res.length >= 2 && res[0] && res[1]) {
          const bg = this._coglToRgba(res[0]);
          const fg = this._coglToRgba(res[1]);
          if (bg && fg) {
            return { bg, fg };
          }
        }
      } catch {
        // Fall through to GSettings/Adwaita fallback
      }
    }

    if (this._stSettings) {
      const enumMap: Record<number, string> = {
        [St.SystemAccentColor?.BLUE ?? 0]: 'blue',
        [St.SystemAccentColor?.TEAL ?? 1]: 'teal',
        [St.SystemAccentColor?.GREEN ?? 2]: 'green',
        [St.SystemAccentColor?.YELLOW ?? 3]: 'yellow',
        [St.SystemAccentColor?.ORANGE ?? 4]: 'orange',
        [St.SystemAccentColor?.RED ?? 5]: 'red',
        [St.SystemAccentColor?.PINK ?? 6]: 'pink',
        [St.SystemAccentColor?.PURPLE ?? 7]: 'purple',
        [St.SystemAccentColor?.SLATE ?? 8]: 'slate',
      };
      const name = enumMap[this._stSettings.accent_color] ?? 'blue';
      return getAdwaitaAccentPalette(name);
    }

    if (this._interfaceSettings) {
      return getAdwaitaAccentPalette(this._interfaceSettings.get_string('accent-color'));
    }

    return getAdwaitaAccentPalette('blue');
  }

  private _coglToRgba(coglColor: any): RgbaColor | null {
    const r = Number(coglColor?.red);
    const g = Number(coglColor?.green);
    const b = Number(coglColor?.blue);
    const aRaw = Number(coglColor?.alpha);
    if (
      !Number.isFinite(r) ||
      !Number.isFinite(g) ||
      !Number.isFinite(b) ||
      !Number.isFinite(aRaw)
    ) {
      return null;
    }
    return {
      r: Math.max(0, Math.min(255, Math.round(r))),
      g: Math.max(0, Math.min(255, Math.round(g))),
      b: Math.max(0, Math.min(255, Math.round(b))),
      a: Math.max(0, Math.min(1, aRaw / 255)),
    };
  }

  private _readOptionalLayer(filePath: string, sourceLabel: string): ThemeLayerInput | null {
    if (!GLib.file_test(filePath, GLib.FileTest.EXISTS)) {
      return null;
    }
    try {
      const file = Gio.File.new_for_path(filePath);
      const [ok, bytes] = file.load_contents(null);
      if (!ok) {
        console.warn(`[Rumo][Theme] Failed to read ${filePath}; skipping ${sourceLabel}`);
        return null;
      }
      const rawText = new TextDecoder('utf-8').decode(bytes);
      return { sourceLabel, rawText };
    } catch (err) {
      console.warn(`[Rumo][Theme] Failed to read ${filePath}; skipping:`, err);
      return null;
    }
  }

  private _resolveBackgroundFile(
    rawPath: string,
  ): { uri: string; trackedBasename: string | null } | { error: string } {
    let absPath: string;
    if (rawPath.startsWith('~/')) {
      absPath = GLib.build_filenamev([GLib.get_home_dir(), rawPath.slice(2)]);
    } else if (GLib.path_is_absolute(rawPath)) {
      absPath = rawPath;
    } else {
      absPath = GLib.build_filenamev([this._configDir, rawPath]);
    }

    if (!GLib.file_test(absPath, GLib.FileTest.IS_REGULAR)) {
      return { error: `file not found: ${absPath}` };
    }

    const uri = Gio.File.new_for_path(absPath).get_uri();
    if (!isSafeCssUri(uri)) {
      return { error: `unsupported characters in image path: ${absPath}` };
    }

    const prefix = this._configDir.endsWith('/') ? this._configDir : `${this._configDir}/`;
    const trackedBasename = absPath.startsWith(prefix)
      ? GLib.path_get_basename(absPath)
      : null;

    return { uri, trackedBasename };
  }

  private _applyStylesheets(css: string): void {
    const theme = this._themeContext?.get_theme?.();
    if (!theme) {
      console.warn('[Rumo][Theme] Active St.Theme unavailable; skipping stylesheet apply');
      return;
    }

    try {
      GLib.mkdir_with_parents(this._cacheDir, 0o700);
    } catch (err) {
      console.warn('[Rumo][Theme] Failed to create cache directory:', err);
      return;
    }

    const newGenPath = GLib.build_filenamev([
      this._cacheDir,
      `generated-${++this._seq}.css`,
    ]);
    try {
      GLib.file_set_contents(newGenPath, new TextEncoder().encode(css));
    } catch (err) {
      console.warn('[Rumo][Theme] Failed to write generated CSS:', err);
      return;
    }

    const newGenFile = Gio.File.new_for_path(newGenPath);
    const oldGenFile = this._loadedGeneratedFile;
    const oldGenPath = this._loadedGeneratedPath;

    // Assign _attachedTheme before load_stylesheet so St.ThemeContext::changed does not re-enter
    this._attachedTheme = theme;
    this._unloadCustomStylesheet(theme);

    try {
      theme.load_stylesheet(newGenFile);
      this._loadedGeneratedFile = newGenFile;
      this._loadedGeneratedPath = newGenPath;
    } catch (err) {
      console.warn('[Rumo][Theme] Failed to load generated CSS:', err);
      this._safeUnlink(newGenPath);
      this._loadCustomStylesheet(theme);
      return;
    }

    if (oldGenFile) {
      try {
        theme.unload_stylesheet(oldGenFile);
      } catch {
        // Ignore unload failures for stale handles
      }
    }
    if (oldGenPath) {
      this._safeUnlink(oldGenPath);
    }

    this._loadCustomStylesheet(theme);
  }

  private _unloadCustomStylesheet(theme: any): void {
    if (!this._loadedCustomFile) return;
    try {
      theme.unload_stylesheet(this._loadedCustomFile);
    } catch {
      // Ignore if already detached
    }
    this._loadedCustomFile = null;
  }

  private _loadCustomStylesheet(theme: any): void {
    const customCssPath = GLib.build_filenamev([this._configDir, 'custom.css']);
    if (!GLib.file_test(customCssPath, GLib.FileTest.IS_REGULAR)) {
      this._loadedCustomFile = null;
      return;
    }

    const customFile = Gio.File.new_for_path(customCssPath);
    try {
      theme.load_stylesheet(customFile);
      this._loadedCustomFile = customFile;
    } catch (err) {
      console.warn(`[Rumo][Theme] Failed to load ${customCssPath}; ignoring:`, err);
      this._loadedCustomFile = null;
    }
  }

  private _setupMonitor(): void {
    this._clearMonitor();

    if (this._destroyed) return;

    const hasConfigDir = GLib.file_test(this._configDir, GLib.FileTest.IS_DIR);
    const targetPath = hasConfigDir ? this._configDir : this._configParentDir;
    if (!GLib.file_test(targetPath, GLib.FileTest.IS_DIR)) {
      return;
    }

    try {
      this._monitoringConfigDir = hasConfigDir;
      this._monitor = Gio.File.new_for_path(targetPath).monitor_directory(
        Gio.FileMonitorFlags.NONE,
        null,
      );
      this._monitorSignalId = this._monitor.connect(
        'changed',
        (_mon: any, file: any, otherFile: any) => {
          this._onMonitorChanged(file, otherFile);
        },
      );
    } catch (err) {
      console.warn(`[Rumo][Theme] Failed to watch ${targetPath}:`, err);
      this._clearMonitor();
    }
  }

  private _onMonitorChanged(file: any, otherFile: any): void {
    if (this._destroyed) return;

    const nameA: string | null = file?.get_basename?.() ?? null;
    const nameB: string | null = otherFile?.get_basename?.() ?? null;

    if (!this._monitoringConfigDir) {
      if (
        (nameA === 'rumo' || nameB === 'rumo') &&
        GLib.file_test(this._configDir, GLib.FileTest.IS_DIR)
      ) {
        this._setupMonitor();
        this._scheduleReload(FILE_RELOAD_DEBOUNCE_MS);
      }
      return;
    }

    if (!GLib.file_test(this._configDir, GLib.FileTest.IS_DIR)) {
      this._setupMonitor();
      this._scheduleReload(FILE_RELOAD_DEBOUNCE_MS);
      return;
    }

    if (
      this._isWatchedFilename(nameA) ||
      this._isWatchedFilename(nameB) ||
      (nameA === null && nameB === null)
    ) {
      this._scheduleReload(FILE_RELOAD_DEBOUNCE_MS);
    }
  }

  private _isWatchedFilename(name: string | null): boolean {
    if (!name) return false;
    return WATCHED_CONFIG_FILES.has(name) || name === this._trackedBgBasename;
  }

  private _scheduleReload(delayMs: number): void {
    if (this._destroyed) return;
    if (this._debounceId) {
      GLib.source_remove(this._debounceId);
      this._debounceId = 0;
    }
    this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
      this._debounceId = 0;
      if (!this._destroyed) {
        this.reload();
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  private _sweepStaleCacheFiles(): void {
    if (!GLib.file_test(this._cacheDir, GLib.FileTest.IS_DIR)) {
      return;
    }
    try {
      const dir = Gio.File.new_for_path(this._cacheDir);
      const enumerator = dir.enumerate_children(
        'standard::name',
        Gio.FileQueryInfoFlags.NONE,
        null,
      );
      while (true) {
        const info = enumerator.next_file(null);
        if (!info) break;
        const name = info.get_name();
        if (name.startsWith('generated-') && name.endsWith('.css')) {
          this._safeUnlink(GLib.build_filenamev([this._cacheDir, name]));
        }
      }
      enumerator.close(null);
    } catch {
      // Ignore cache cleanup errors
    }
  }

  private _safeUnlink(path: string): void {
    try {
      GLib.unlink(path);
    } catch {
      // Ignore unlink failures
    }
  }

  private _clearMonitor(): void {
    if (this._monitor) {
      if (this._monitorSignalId) {
        this._monitor.disconnect(this._monitorSignalId);
        this._monitorSignalId = 0;
      }
      try {
        this._monitor.cancel();
      } catch {
        // Ignore cancel errors
      }
      this._monitor = null;
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._debounceId) {
      GLib.source_remove(this._debounceId);
      this._debounceId = 0;
    }

    this._clearMonitor();

    if (this._stSettings) {
      for (const id of this._stSignalIds) {
        this._stSettings.disconnect(id);
      }
      this._stSignalIds = [];
      this._stSettings = null;
    }

    if (this._interfaceSettings) {
      for (const id of this._interfaceSignalIds) {
        this._interfaceSettings.disconnect(id);
      }
      this._interfaceSignalIds = [];
      this._interfaceSettings = null;
    }

    if (this._themeContext && this._themeContextSignalId) {
      this._themeContext.disconnect(this._themeContextSignalId);
      this._themeContextSignalId = 0;
    }

    const theme = this._attachedTheme ?? this._themeContext?.get_theme?.();
    if (theme) {
      this._unloadCustomStylesheet(theme);
      if (this._loadedGeneratedFile) {
        try {
          theme.unload_stylesheet(this._loadedGeneratedFile);
        } catch {
          // Ignore unload failures on shutdown
        }
      }
    }

    if (this._loadedGeneratedPath) {
      this._safeUnlink(this._loadedGeneratedPath);
      this._loadedGeneratedPath = null;
    }

    this._loadedGeneratedFile = null;
    this._loadedCustomFile = null;
    this._attachedTheme = null;
    this._themeContext = null;
  }
}
