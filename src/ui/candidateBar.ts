import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import type { ClientSideUIState, SymbolPickerState } from '../core/types.js';

export interface CandidateBarCallbacks {
  onSelectCandidate(index: number): void;
  onPrevPage(): void;
  onNextPage(): void;
  onToggleDrawer(): void;
  onSelectSymbolCategory(index: number): void;
  onSymbolPrevPage(): void;
  onSymbolNextPage(): void;
  onHide(): void;
}

export class CandidateBar {
  readonly actor: any;

  private readonly _preeditStrip: any;
  private readonly _preeditLabel: any;
  private readonly _candidateRow: any;
  private readonly _candidateList: any;
  private readonly _symbolTabsBox: any;
  private readonly _statusLabel: any;
  private readonly _prevBtn: any;
  private readonly _nextBtn: any;
  private readonly _expandBtn: any;
  private readonly _hideBtn: any;

  private _imStatusText = 'Rumo · 中';
  private _drawerOpen = false;
  private _symbolMode = false;
  private _hasCandidates = false;
  private _hasPreedit = false;
  private _lastHasPrev = false;
  private _lastHasNext = false;

  constructor(
    private readonly _callbacks: CandidateBarCallbacks,
    private readonly _extensionPath: string,
  ) {
    this.actor = new St.BoxLayout({
      style_class: 'rumo-candidate-bar',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      reactive: true,
      can_focus: false,
    });

    this._preeditStrip = new St.BoxLayout({
      style_class: 'rumo-preedit-strip',
      x_expand: true,
      visible: false,
      can_focus: false,
    });
    this._preeditLabel = new St.Label({
      style_class: 'rumo-preedit-label',
      text: '',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._preeditStrip.add_child(this._preeditLabel);
    this.actor.add_child(this._preeditStrip);

    this._candidateRow = new St.BoxLayout({
      style_class: 'rumo-candidate-row',
      x_expand: true,
      can_focus: false,
    });

    this._candidateList = new St.BoxLayout({
      style_class: 'rumo-candidate-list',
      x_expand: true,
      clip_to_allocation: true,
      can_focus: false,
    });

    this._symbolTabsBox = new St.BoxLayout({
      style_class: 'rumo-symbol-tabs',
      x_expand: true,
      visible: false,
      can_focus: false,
    });

    this._statusLabel = new St.Label({
      style_class: 'rumo-status-label',
      text: this._imStatusText,
      x_expand: true,
      x_align: Clutter.ActorAlign.START,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._candidateList.add_child(this._statusLabel);
    this._candidateRow.add_child(this._candidateList);
    this._candidateRow.add_child(this._symbolTabsBox);

    this._prevBtn = this._makeActionButton('‹', () => {
      if (this._symbolMode) {
        this._callbacks.onSymbolPrevPage();
      } else {
        this._callbacks.onPrevPage();
      }
    });
    this._nextBtn = this._makeActionButton('›', () => {
      if (this._symbolMode) {
        this._callbacks.onSymbolNextPage();
      } else {
        this._callbacks.onNextPage();
      }
    });
    this._expandBtn = this._makeActionButton('▾', () => this._callbacks.onToggleDrawer());
    this._hideBtn = this._makeHideButton(() => this._callbacks.onHide());

    this._setNavEnabled(this._prevBtn, false);
    this._setNavEnabled(this._nextBtn, false);
    this._setNavEnabled(this._expandBtn, false);

    this._candidateRow.add_child(this._prevBtn);
    this._candidateRow.add_child(this._nextBtn);
    this._candidateRow.add_child(this._expandBtn);
    this._candidateRow.add_child(
      new St.Widget({
        style_class: 'rumo-cand-sep',
        y_align: Clutter.ActorAlign.CENTER,
        can_focus: false,
      }),
    );
    this._candidateRow.add_child(this._hideBtn);

    this.actor.add_child(this._candidateRow);
  }

  private _makeHideButton(onPress: () => void): any {
    const iconPath = `${this._extensionPath}/icons/keyboard-hide-symbolic.svg`;
    const gicon = Gio.icon_new_for_string(iconPath);
    const icon = new St.Icon({
      gicon,
      style_class: 'rumo-hide-icon',
    });
    const btn = new St.Button({
      child: icon,
      style_class: 'rumo-bar-action-btn rumo-hide-btn',
      can_focus: false,
      reactive: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    btn.connect('clicked', () => onPress());
    return btn;
  }

  private _makeActionButton(label: string, onPress: () => void): any {
    const btn = new St.Button({
      label,
      style_class: 'rumo-bar-action-btn',
      can_focus: false,
      reactive: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    btn.connect('clicked', () => onPress());
    return btn;
  }

  setIMStatus(_imeActive: boolean, label: string): void {
    this._imStatusText = `Rumo · ${label}`;
    if (this._statusLabel.get_parent() === this._candidateList) {
      this._statusLabel.text = this._imStatusText;
    }
  }

  setSymbolPickerMode(active: boolean, state?: SymbolPickerState): void {
    this._symbolMode = active;
    if (active) {
      this._preeditStrip.hide();
      this._candidateList.hide();
      this._expandBtn.hide();
      this._symbolTabsBox.show();
      if (state) {
        this.updateSymbolPickerTabs(state);
      }
      return;
    }

    this._symbolTabsBox.hide();
    this._candidateList.show();
    this._expandBtn.show();
    if (this._hasPreedit) {
      this._preeditStrip.show();
    } else {
      this._preeditStrip.hide();
    }
    this._setNavEnabled(this._prevBtn, this._lastHasPrev);
    this._setNavEnabled(this._nextBtn, this._lastHasNext);
    this._syncExpandBtn();
  }

  updateSymbolPickerTabs(state: SymbolPickerState): void {
    this._symbolTabsBox.remove_all_children();

    state.categories.forEach((cat, idx) => {
      const classes = ['rumo-symbol-tab'];
      if (cat.active) {
        classes.push('rumo-symbol-tab-active');
      }

      const props: Record<string, unknown> = {
        style_class: classes.join(' '),
        x_expand: true,
        can_focus: false,
        reactive: true,
        y_align: Clutter.ActorAlign.CENTER,
      };

      if (cat.icon) {
        const iconPath = `${this._extensionPath}/icons/${cat.icon}.svg`;
        const gicon = Gio.icon_new_for_string(iconPath);
        props.child = new St.Icon({
          gicon,
          style_class: 'rumo-symbol-tab-icon',
        });
      } else {
        props.label = cat.label;
      }

      const tabBtn = new St.Button(props);
      tabBtn.connect('clicked', () => {
        this._callbacks.onSelectSymbolCategory(idx);
      });
      this._symbolTabsBox.add_child(tabBtn);
    });

    if (this._symbolMode) {
      this._setNavEnabled(this._prevBtn, state.hasPrevPage);
      this._setNavEnabled(this._nextBtn, state.hasNextPage);
    }
  }

  updateUI(state: ClientSideUIState): void {
    this._hasPreedit = state.preeditText.length > 0;
    this._preeditLabel.text = state.preeditText;
    if (!this._symbolMode) {
      if (this._hasPreedit) {
        this._preeditStrip.show();
      } else {
        this._preeditStrip.hide();
      }
    }

    this._candidateList.remove_all_children();

    if (state.candidates.length === 0) {
      this._statusLabel.text = this._imStatusText;
      this._candidateList.add_child(this._statusLabel);
    } else {
      state.candidates.forEach((cand, index) => {
        if (index > 0) {
          this._candidateList.add_child(
            new St.Widget({
              style_class: 'rumo-cand-sep',
              y_align: Clutter.ActorAlign.CENTER,
              can_focus: false,
            }),
          );
        }

        const isPrimary =
          index === state.candidateIndex ||
          (state.candidateIndex < 0 && index === 0);
        const btn = new St.Button({
          label: cand.text,
          style_class: isPrimary
            ? 'rumo-candidate-btn rumo-candidate-btn-primary'
            : 'rumo-candidate-btn',
          x_expand: true,
          can_focus: false,
          reactive: true,
          y_align: Clutter.ActorAlign.CENTER,
        });
        btn.connect('clicked', () => {
          this._callbacks.onSelectCandidate(index);
        });
        this._candidateList.add_child(btn);
      });
    }

    this._hasCandidates = state.candidates.length > 0;
    this._lastHasPrev = state.hasPrev;
    this._lastHasNext = state.hasNext;
    if (!this._symbolMode) {
      this._setNavEnabled(this._prevBtn, state.hasPrev);
      this._setNavEnabled(this._nextBtn, state.hasNext);
      this._syncExpandBtn();
    }
  }

  setDrawerOpen(open: boolean): void {
    this._drawerOpen = open;
    this._syncExpandBtn();
  }

  private _syncExpandBtn(): void {
    this._expandBtn.label = this._drawerOpen ? '▴' : '▾';
    this._setNavEnabled(this._expandBtn, this._hasCandidates || this._drawerOpen);
    if (this._drawerOpen) {
      this._expandBtn.add_style_class_name('rumo-bar-action-btn-active');
    } else {
      this._expandBtn.remove_style_class_name('rumo-bar-action-btn-active');
    }
  }

  private _setNavEnabled(btn: any, enabled: boolean): void {
    btn.reactive = enabled;
    if (enabled) {
      btn.remove_style_pseudo_class('insensitive');
    } else {
      btn.add_style_pseudo_class('insensitive');
    }
  }

  destroy(): void {
    this.actor.destroy();
  }
}
