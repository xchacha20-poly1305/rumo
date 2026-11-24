import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { packCandidateRows } from '../core/flexWrap.js';
import type { CandidateDrawerState } from '../core/types.js';

const SIDEBAR_WIDTH_PX = 84;
const SCROLL_STEP_PX = 120;

export interface CandidateDrawerCallbacks {
  onSelectCandidate(pageIndex: number, indexInPage: number): void;
  onLoadMore(): void;
  onBackspace(): void;
  onClose(): void;
}

export class CandidateDrawer {
  readonly actor: any;

  private readonly _scrollView: any;
  private readonly _gridBox: any;
  private readonly _sidebar: any;
  private readonly _scrollUpBtn: any;
  private readonly _scrollDownBtn: any;
  private readonly _backspaceBtn: any;
  private readonly _backBtn: any;

  private _containerWidth = 960;
  private _lastState: CandidateDrawerState | null = null;

  constructor(private readonly _callbacks: CandidateDrawerCallbacks) {
    this.actor = new St.BoxLayout({
      style_class: 'rumo-drawer',
      orientation: Clutter.Orientation.HORIZONTAL,
      x_expand: true,
      y_expand: true,
      visible: false,
      reactive: true,
      can_focus: false,
    });

    this._scrollView = new St.ScrollView({
      style_class: 'rumo-drawer-scroll',
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      x_expand: true,
      y_expand: true,
      can_focus: false,
    });

    this._gridBox = new St.BoxLayout({
      style_class: 'rumo-drawer-grid',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      can_focus: false,
    });

    this._scrollView.set_child(this._gridBox);
    this.actor.add_child(this._scrollView);

    this._sidebar = new St.BoxLayout({
      style_class: 'rumo-drawer-sidebar',
      orientation: Clutter.Orientation.VERTICAL,
      y_expand: true,
      can_focus: false,
    });

    this._scrollUpBtn = this._makeSidebarBtn('↑', 'rumo-drawer-side-btn', () => {
      this._scrollBy(-SCROLL_STEP_PX);
    });
    this._scrollDownBtn = this._makeSidebarBtn('↓', 'rumo-drawer-side-btn', () => {
      const atBottom = this._scrollBy(SCROLL_STEP_PX);
      if (atBottom && this._lastState?.hasMore && !this._lastState.loading) {
        this._callbacks.onLoadMore();
      }
    });
    this._backspaceBtn = this._makeSidebarBtn('⌫', 'rumo-drawer-side-btn', () => {
      this._callbacks.onBackspace();
    });
    this._backBtn = this._makeSidebarBtn(
      '↩',
      'rumo-drawer-side-btn rumo-drawer-back-btn',
      () => {
        this._callbacks.onClose();
      },
    );

    this._sidebar.add_child(this._scrollUpBtn);
    this._sidebar.add_child(this._scrollDownBtn);
    this._sidebar.add_child(this._backspaceBtn);
    this._sidebar.add_child(this._backBtn);
    this.actor.add_child(this._sidebar);
  }

  private _makeSidebarBtn(label: string, styleClass: string, onClick: () => void): any {
    const btn = new St.Button({
      label,
      style_class: styleClass,
      y_expand: true,
      can_focus: false,
      reactive: true,
    });
    btn.connect('clicked', () => onClick());
    return btn;
  }

  private _scrollBy(delta: number): boolean {
    const vadj = this._scrollView.vadjustment;
    if (!vadj) return true;
    const maxVal = Math.max(0, vadj.upper - vadj.page_size);
    const nextVal = Math.max(0, Math.min(maxVal, vadj.value + delta));
    const wasAtBottom = maxVal - vadj.value <= 8;
    vadj.value = nextVal;
    return delta > 0 && (wasAtBottom || maxVal - nextVal <= 8);
  }

  setContainerWidth(width: number): void {
    if (width <= 0 || width === this._containerWidth) return;
    this._containerWidth = width;
    if (this._lastState?.open) {
      this._renderItems(this._lastState);
    }
  }

  update(state: CandidateDrawerState): void {
    this._lastState = state;
    if (!state.open) {
      this.actor.hide();
      return;
    }

    this._renderItems(state);
    this.actor.show();
  }

  private _renderItems(state: CandidateDrawerState): void {
    this._gridBox.remove_all_children();

    const availableWidth = Math.max(240, this._containerWidth - SIDEBAR_WIDTH_PX - 32);
    const rows = packCandidateRows(state.items, availableWidth);

    for (const rowItems of rows) {
      const rowBox = new St.BoxLayout({
        style_class: 'rumo-drawer-row',
        x_expand: true,
        can_focus: false,
      });

      rowItems.forEach((item, colIdx) => {
        if (colIdx > 0) {
          rowBox.add_child(
            new St.Widget({
              style_class: 'rumo-cand-sep',
              y_align: Clutter.ActorAlign.CENTER,
              can_focus: false,
            }),
          );
        }

        const btn = new St.Button({
          label: item.text,
          style_class: item.isPrimary
            ? 'rumo-drawer-cand-btn rumo-drawer-cand-btn-primary'
            : 'rumo-drawer-cand-btn',
          x_expand: true,
          can_focus: false,
          reactive: true,
        });
        btn.connect('clicked', () => {
          this._callbacks.onSelectCandidate(item.pageIndex, item.indexInPage);
        });
        rowBox.add_child(btn);
      });

      this._gridBox.add_child(rowBox);
    }

    if (state.hasMore) {
      const moreBtn = new St.Button({
        label: state.loading ? _('Loading more…') : _('Load more candidates'),
        style_class: 'rumo-drawer-more-btn',
        x_expand: true,
        can_focus: false,
        reactive: !state.loading,
      });
      moreBtn.connect('clicked', () => this._callbacks.onLoadMore());
      this._gridBox.add_child(moreBtn);
    }
  }

  destroy(): void {
    this.actor.destroy();
  }
}
