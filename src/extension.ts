import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { InputRouter } from './core/inputRouter.js';
import { clampHeightRatio, normalizeDisplayMode } from './core/settings.js';
import { Fcitx5Client } from './platform/fcitx5Client.js';
import { FocusTracker } from './platform/focusTracker.js';
import { OskManager } from './platform/oskManager.js';
import { TextInjector } from './platform/textInjector.js';
import { ThemeManager } from './platform/themeManager.js';
import { KeyboardView } from './ui/keyboardView.js';

export default class RumoExtension extends Extension {
  private _settings: any = null;
  private _settingsSignalIds: number[] = [];
  private _fcitx: Fcitx5Client | null = null;
  private _injector: TextInjector | null = null;
  private _focusTracker: FocusTracker | null = null;
  private _view: KeyboardView | null = null;
  private _themeManager: ThemeManager | null = null;
  private _router: InputRouter | null = null;
  private _oskManager: OskManager | null = null;

  enable(): void {
    this._settings = this.getSettings();

    const clipboardFallback = this._settings.get_boolean(
      'xwayland-clipboard-fallback',
    );
    const displayMode = normalizeDisplayMode(
      this._settings.get_string('display-mode'),
    );
    const heightRatio = clampHeightRatio(
      this._settings.get_double('keyboard-height-ratio'),
    );
    const showIndicator = this._settings.get_boolean('show-panel-indicator');
    const initialRecentSymbols = this._settings.get_strv('recent-symbols');

    this._injector = new TextInjector(clipboardFallback);

    let routerRef: InputRouter | null = null;

    this._focusTracker = new FocusTracker(() => {
      routerRef?.onFocusWindowChanged();
    }, displayMode);

    this._fcitx = new Fcitx5Client({
      onConnectionChanged: (connected) => routerRef?.onFcitxConnectionChanged(connected),
      onUIUpdate: (ui) => routerRef?.onFcitxUIUpdate(ui),
      onCommit: (text) => routerRef?.onFcitxCommit(text),
      onForwardKey: (keyval, state, isRelease) =>
        routerRef?.onFcitxForwardKey(keyval, state, isRelease),
      onIMChanged: (info) => routerRef?.onFcitxIMChanged(info),
    });

    this._view = new KeyboardView(
      {
        onKeyAction: (action) => {
          routerRef?.handleKeyAction(action).catch((err) => {
            console.error('[Rumo] handleKeyAction failed:', err);
          });
        },
        onSelectCandidate: (index) => routerRef?.selectCandidate(index),
        onSelectDrawerCandidate: (pageIndex, indexInPage) =>
          routerRef?.selectDrawerCandidate(pageIndex, indexInPage),
        onPrevPage: () => routerRef?.prevCandidatePage(),
        onNextPage: () => routerRef?.nextCandidatePage(),
        onToggleDrawer: () => routerRef?.toggleCandidateDrawer(),
        onLoadMoreCandidates: () => routerRef?.loadMoreCandidates(),
        onCloseDrawer: () => routerRef?.closeCandidateDrawer(),
        onSelectSymbolCategory: (idx) => routerRef?.selectSymbolCategory(idx),
        onSymbolPrevPage: () => routerRef?.prevSymbolPage(),
        onSymbolNextPage: () => routerRef?.nextSymbolPage(),
        onToggleDisplayMode: () => {
          if (!this._settings) return;
          const current = normalizeDisplayMode(
            this._settings.get_string('display-mode'),
          );
          const next = current === 'overlay' ? 'push' : 'overlay';
          this._settings.set_string('display-mode', next);
        },
        onOpenSettings: () => {
          this.openPreferences();
        },
        onHide: () => this._oskManager?.close(),
      },
      this.path,
    );
    this._view.setDisplayMode(displayMode);

    this._themeManager = new ThemeManager({
      onThemeApplied: (state) => this._view?.applyThemeState(state),
    });

    routerRef = new InputRouter(
      this._fcitx,
      this._injector,
      {
        onLayoutChanged: (layout, shift) => this._view?.renderLayout(layout, shift),
        onUIStateChanged: (ui) => this._view?.updateUIState(ui),
        onDrawerStateChanged: (state) => this._view?.updateDrawerState(state),
        onSymbolPickerStateChanged: (state) =>
          this._view?.updateSymbolPickerState(state),
        onRecentSymbolsChanged: (symbols) => {
          this._settings?.set_strv('recent-symbols', symbols);
        },
        onIMModeChanged: (active, label) => this._view?.updateIMMode(active, label),
        onHideRequested: () => this._oskManager?.close(),
      },
      initialRecentSymbols,
    );
    this._router = routerRef;

    this._oskManager = new OskManager(
      this._view,
      this._focusTracker,
      {
        onOpened: () => this._router?.onKeyboardOpened(),
        onClosed: () => this._router?.onKeyboardClosed(),
        onPurposeChanged: (purpose) => this._router?.setPurpose(purpose),
      },
      heightRatio,
      showIndicator,
      displayMode,
    );

    this._settingsSignalIds.push(
      this._settings.connect('changed::display-mode', () => {
        const mode = normalizeDisplayMode(
          this._settings.get_string('display-mode'),
        );
        this._view?.setDisplayMode(mode);
        this._oskManager?.setDisplayMode(mode);
      }),
      this._settings.connect('changed::xwayland-clipboard-fallback', () => {
        this._injector?.setClipboardFallbackEnabled(
          this._settings.get_boolean('xwayland-clipboard-fallback'),
        );
      }),
      this._settings.connect('changed::keyboard-height-ratio', () => {
        this._oskManager?.setHeightRatio(
          this._settings.get_double('keyboard-height-ratio'),
        );
      }),
      this._settings.connect('changed::show-panel-indicator', () => {
        this._oskManager?.setShowPanelIndicator(
          this._settings.get_boolean('show-panel-indicator'),
        );
      }),
    );
  }

  disable(): void {
    if (this._settings) {
      for (const id of this._settingsSignalIds) {
        this._settings.disconnect(id);
      }
      this._settingsSignalIds = [];
      this._settings = null;
    }

    this._oskManager?.destroy();
    this._oskManager = null;

    this._focusTracker?.destroy();
    this._focusTracker = null;

    this._themeManager?.destroy();
    this._themeManager = null;

    this._view?.destroy();
    this._view = null;

    this._fcitx?.destroy();
    this._fcitx = null;

    this._injector?.destroy();
    this._injector = null;

    this._router = null;
  }
}
