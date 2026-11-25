import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { getLayout } from '../core/layouts.js';
import { computeKeyboardLayoutMetrics } from '../core/layoutMetrics.js';
import type { DisplayMode } from '../core/settings.js';
import type { AppliedThemeState } from '../core/themeTypes.js';
import type {
  CandidateDrawerState,
  ClientSideUIState,
  KeyAction,
  LayoutId,
  ShiftState,
  SymbolPickerState,
} from '../core/types.js';
import { CandidateBar } from './candidateBar.js';
import { CandidateDrawer } from './candidateDrawer.js';
import { KeyButton } from './keyButton.js';
import { SymbolPickerView } from './symbolPickerView.js';

export interface KeyboardViewCallbacks {
  onKeyAction(action: KeyAction): void;
  onSelectCandidate(index: number): void;
  onSelectDrawerCandidate(pageIndex: number, indexInPage: number): void;
  onPrevPage(): void;
  onNextPage(): void;
  onToggleDrawer(): void;
  onLoadMoreCandidates(): void;
  onCloseDrawer(): void;
  onSelectSymbolCategory(index: number): void;
  onSymbolPrevPage(): void;
  onSymbolNextPage(): void;
  onToggleDisplayMode(): void;
  onOpenSettings(): void;
  onHide(): void;
}

export class KeyboardView {
  readonly actor: any;
  readonly preeditActor: any;
  private readonly _bgLayer: any;
  private readonly _contentBox: any;
  private readonly _preeditLabel: any;
  private readonly _candidateBar: CandidateBar;
  private readonly _candidateDrawer: CandidateDrawer;
  private readonly _symbolPickerView: SymbolPickerView;
  private readonly _keyGrid: any;
  private readonly _extensionPath: string;

  private _currentLayout: LayoutId = 'qwerty-lower';
  private _shiftState: ShiftState = 'off';
  private _imeActive = true;
  private _imLabel = '中';
  private _width = 1024;
  private _height = 320;
  private _fontScale = 1;
  private _monitorX = 0;
  private _monitorY = 0;
  private _monitorWidth = 1024;
  private _monitorHeight = 768;
  private _preeditText = '';
  private _isVisible = false;
  private _buttons: KeyButton[] = [];
  private _drawerOpen = false;
  private _symbolPickerState: SymbolPickerState | null = null;

  constructor(
    private readonly _callbacks: KeyboardViewCallbacks,
    extensionPath: string,
  ) {
    this._extensionPath = extensionPath;
    this.actor = new St.Widget({
      layout_manager: new Clutter.BinLayout(),
      style_class: 'rumo-keyboard',
      reactive: true,
      can_focus: false,
      x_expand: true,
      y_expand: true,
    });

    this.preeditActor = new St.BoxLayout({
      style_class: 'rumo-preedit-strip',
      reactive: false,
      can_focus: false,
      visible: false,
    });
    this._preeditLabel = new St.Label({
      style_class: 'rumo-preedit-label',
      text: '',
      y_align: Clutter.ActorAlign.CENTER,
    });
    const preeditClutterText = this._preeditLabel.get_clutter_text?.();
    if (preeditClutterText) {
      preeditClutterText.ellipsize = Pango.EllipsizeMode.START;
    }
    this.preeditActor.add_child(this._preeditLabel);

    this._bgLayer = new St.Widget({
      style_class: 'rumo-keyboard-bg',
      x_expand: true,
      y_expand: true,
      x_align: Clutter.ActorAlign.FILL,
      y_align: Clutter.ActorAlign.FILL,
      visible: false,
      can_focus: false,
    });
    this.actor.add_child(this._bgLayer);

    this._contentBox = new St.BoxLayout({
      style_class: 'rumo-keyboard-content',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_expand: true,
      x_align: Clutter.ActorAlign.FILL,
      y_align: Clutter.ActorAlign.FILL,
      can_focus: false,
    });
    this.actor.add_child(this._contentBox);

    this._candidateBar = new CandidateBar(
      {
        onSelectCandidate: (i) => this._callbacks.onSelectCandidate(i),
        onPrevPage: () => this._callbacks.onPrevPage(),
        onNextPage: () => this._callbacks.onNextPage(),
        onToggleDrawer: () => this._callbacks.onToggleDrawer(),
        onSelectSymbolCategory: (idx) => this._callbacks.onSelectSymbolCategory(idx),
        onSymbolPrevPage: () => this._callbacks.onSymbolPrevPage(),
        onSymbolNextPage: () => this._callbacks.onSymbolNextPage(),
        onToggleDisplayMode: () => this._callbacks.onToggleDisplayMode(),
        onOpenSettings: () => this._callbacks.onOpenSettings(),
        onHide: () => this._callbacks.onHide(),
      },
      extensionPath,
    );
    this._contentBox.add_child(this._candidateBar.actor);

    this._candidateDrawer = new CandidateDrawer({
      onSelectCandidate: (pageIndex, indexInPage) =>
        this._callbacks.onSelectDrawerCandidate(pageIndex, indexInPage),
      onLoadMore: () => this._callbacks.onLoadMoreCandidates(),
      onBackspace: () => this._callbacks.onKeyAction({ type: 'backspace' }),
      onClose: () => this._callbacks.onCloseDrawer(),
    });
    this._contentBox.add_child(this._candidateDrawer.actor);

    this._symbolPickerView = new SymbolPickerView(
      {
        onKeyAction: (action) => this._callbacks.onKeyAction(action),
        onPrevPage: () => this._callbacks.onSymbolPrevPage(),
        onNextPage: () => this._callbacks.onSymbolNextPage(),
      },
      extensionPath,
    );
    this._contentBox.add_child(this._symbolPickerView.actor);

    this._keyGrid = new St.BoxLayout({
      style_class: 'rumo-key-grid',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_expand: true,
      can_focus: false,
    });
    this._contentBox.add_child(this._keyGrid);

    this.renderLayout('qwerty-lower', 'off');
  }

  applyThemeState(state: AppliedThemeState): void {
    if (state.mode === 'dark') {
      this.actor.add_style_class_name('rumo-mode-dark');
      this.actor.remove_style_class_name('rumo-mode-light');
      this.preeditActor.add_style_class_name('rumo-mode-dark');
      this.preeditActor.remove_style_class_name('rumo-mode-light');
    } else {
      this.actor.add_style_class_name('rumo-mode-light');
      this.actor.remove_style_class_name('rumo-mode-dark');
      this.preeditActor.add_style_class_name('rumo-mode-light');
      this.preeditActor.remove_style_class_name('rumo-mode-dark');
    }

    if (state.keyBorder) {
      this.actor.remove_style_class_name('rumo-borderless');
    } else {
      this.actor.add_style_class_name('rumo-borderless');
    }

    if (state.hasBackgroundImage) {
      this.actor.add_style_class_name('rumo-has-bg-image');
      this._bgLayer.show();
    } else {
      this.actor.remove_style_class_name('rumo-has-bg-image');
      this._bgLayer.hide();
    }

    this._fontScale = Number.isFinite(state.fontScale) ? state.fontScale : 1;
    this._symbolPickerView.setFontScale(this._fontScale);
    this._applyLayoutMetrics();
  }

  setDisplayMode(mode: DisplayMode): void {
    this._candidateBar.setDisplayMode(mode);
  }

  setKeyboardVisible(visible: boolean): void {
    this._isVisible = visible;
    if (!visible) {
      this._candidateBar.collapseToolbar();
    }
    this._syncPreeditVisibility();
  }

  setDimensions(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this.actor.set_size(width, height);
    this._candidateDrawer.setContainerWidth(width);
    this._symbolPickerView.setDimensions(width, height);
    this._applyLayoutMetrics();
  }

  setMonitorBounds(
    x: number,
    y: number,
    width: number,
    height: number,
    kbHeight: number,
  ): void {
    this._monitorX = x;
    this._monitorY = y;
    this._monitorWidth = width;
    this._monitorHeight = height;
    this._height = kbHeight;
    this._updatePreeditGeometry();
  }

  renderLayout(layoutId: LayoutId, shiftState: ShiftState): void {
    this._currentLayout = layoutId;
    this._shiftState = shiftState;

    if (layoutId === 'symbol-picker') {
      this._keyGrid.remove_all_children();
      this._buttons = [];
      this._keyGrid.hide();
      if (!this._drawerOpen) {
        this._symbolPickerView.show();
      }
      this._candidateBar.setSymbolPickerMode(
        true,
        this._symbolPickerState ?? undefined,
      );
      this._syncPreeditVisibility();
      return;
    }

    this._symbolPickerView.hide();
    this._candidateBar.setSymbolPickerMode(false);
    if (!this._drawerOpen) {
      this._keyGrid.show();
    }

    this._keyGrid.remove_all_children();
    this._buttons = [];

    const layout = getLayout(layoutId);
    for (const rowSpecs of layout.rows) {
      const rowBox = new St.BoxLayout({
        style_class: 'rumo-key-row',
        x_expand: true,
        y_expand: false,
        x_align: Clutter.ActorAlign.FILL,
        can_focus: false,
      });

      for (const spec of rowSpecs) {
        const keyBtn = new KeyButton(
          spec,
          (action) => this._callbacks.onKeyAction(action),
          this._extensionPath,
        );

        if (spec.id === 'shift') {
          if (shiftState === 'locked') {
            keyBtn.setLabel('⇪');
            keyBtn.setActive(true);
          } else if (shiftState === 'once') {
            keyBtn.setLabel('⬆');
            keyBtn.setActive(true);
          } else {
            keyBtn.setLabel('⇧');
            keyBtn.setActive(false);
          }
        } else if (spec.id === 'toggle-im') {
          keyBtn.setLabel(this._imeActive ? '中/英' : 'EN');
          keyBtn.setActive(this._imeActive);
        }

        this._buttons.push(keyBtn);
        rowBox.add_child(keyBtn.actor);
      }

      this._keyGrid.add_child(rowBox);
    }

    this._applyKeySizes();
    this._syncPreeditVisibility();
  }

  updateSymbolPickerState(state: SymbolPickerState): void {
    this._symbolPickerState = state;
    this._candidateBar.updateSymbolPickerTabs(state);
    this._symbolPickerView.update(state, this._imeActive);
  }

  updateUIState(state: ClientSideUIState): void {
    this._preeditText = state.preeditText;
    this._preeditLabel.text = state.preeditText;
    this._syncPreeditVisibility();
    this._candidateBar.updateUI(state);
  }

  updateDrawerState(state: CandidateDrawerState): void {
    this._drawerOpen = state.open;
    this._candidateBar.setDrawerOpen(state.open);
    this._candidateDrawer.update(state);
    if (state.open) {
      this._keyGrid.hide();
      this._symbolPickerView.hide();
    } else if (this._currentLayout === 'symbol-picker') {
      this._symbolPickerView.show();
    } else {
      this._keyGrid.show();
    }
  }

  updateIMMode(imeActive: boolean, label: string): void {
    this._imeActive = imeActive;
    this._imLabel = label;
    this._candidateBar.setIMStatus(imeActive, label);

    for (const btn of this._buttons) {
      if (btn.spec.id === 'toggle-im') {
        btn.setLabel(imeActive ? '中/英' : 'EN');
        btn.setActive(imeActive);
      }
    }

    if (this._currentLayout === 'symbol-picker' && this._symbolPickerState) {
      this._symbolPickerView.update(this._symbolPickerState, this._imeActive);
    }
  }

  private _syncPreeditVisibility(): void {
    if (
      this._isVisible &&
      this._currentLayout !== 'symbol-picker' &&
      this._preeditText.length > 0
    ) {
      this._updatePreeditGeometry();
      this.preeditActor.show();
    } else {
      this.preeditActor.hide();
    }
  }

  private _updatePreeditGeometry(): void {
    const metrics = computeKeyboardLayoutMetrics(this._height, this._fontScale, 4);
    const maxWidth = Math.max(120, this._monitorWidth - 24);
    this.preeditActor.set_style(`max-width: ${maxWidth}px;`);
    this.preeditActor.set_height(metrics.preeditHeight);
    const preeditX = this._monitorX + 12;
    const preeditY = Math.max(
      this._monitorY,
      this._monitorY + this._monitorHeight - this._height - metrics.preeditHeight,
    );
    this.preeditActor.set_position(preeditX, preeditY);
  }

  private _applyLayoutMetrics(): void {
    const metrics = computeKeyboardLayoutMetrics(this._height, this._fontScale, 4);
    this._candidateBar.setBarHeights(
      metrics.candidateBarHeight,
      metrics.candidateRowHeight,
    );
    this._updatePreeditGeometry();
    this._applyKeySizes();
  }

  private _applyKeySizes(): void {
    if (this._currentLayout === 'symbol-picker') {
      return;
    }

    const layout = getLayout(this._currentLayout);
    const metrics = computeKeyboardLayoutMetrics(
      this._height,
      this._fontScale,
      layout.rows.length,
    );
    this._candidateBar.setBarHeights(
      metrics.candidateBarHeight,
      metrics.candidateRowHeight,
    );

    const usableWidth = Math.max(320, this._width - 28);
    const rows = this._keyGrid.get_children();

    rows.forEach((rowActor: any, rowIdx: number) => {
      const rowSpecs = layout.rows[rowIdx];
      if (!rowSpecs) return;

      rowActor.set_height(metrics.rowHeight);

      let totalWeight = 0;
      for (const spec of rowSpecs) {
        totalWeight += spec.width ?? 1;
      }

      const gapTotal = Math.max(0, rowSpecs.length - 1) * 6;
      const unitWidth = (usableWidth - gapTotal) / Math.max(1, totalWeight);

      const children = rowActor.get_children();
      children.forEach((child: any, colIdx: number) => {
        const weight = rowSpecs[colIdx]?.width ?? 1;
        child.set_size(
          Math.max(28, Math.floor(unitWidth * weight)),
          metrics.rowHeight,
        );
      });
    });
  }

  destroy(): void {
    this._candidateBar.destroy();
    this._candidateDrawer.destroy();
    this._symbolPickerView.destroy();
    this.preeditActor.destroy();
    this.actor.destroy();
  }
}
