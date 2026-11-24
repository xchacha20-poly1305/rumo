import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { makeSymbolPickerBottomRow } from '../core/layouts.js';
import type { KeyAction, KeySpec, SymbolPickerState } from '../core/types.js';
import { KeyButton } from './keyButton.js';

const KEY_GAP_PX = 6;
const SWIPE_THRESHOLD_PX = 42;
const SCROLL_DEBOUNCE_US = 120000;

export interface SymbolPickerViewCallbacks {
  onKeyAction(action: KeyAction): void;
  onPrevPage(): void;
  onNextPage(): void;
}

export class SymbolPickerView {
  readonly actor: any;

  private readonly _gridBox: any;
  private readonly _paginationTrack: any;
  private readonly _paginationThumb: any;
  private readonly _bottomRow: any;

  private _width = 1024;
  private _height = 320;
  private _lastState: SymbolPickerState | null = null;
  private _imeActive = true;

  private _symbolButtons: KeyButton[] = [];
  private _rowActors: any[] = [];
  private _backspaceBtn: KeyButton | null = null;
  private _bottomButtons: KeyButton[] = [];
  private _bottomSpecs: KeySpec[] = [];

  private _swipeTracking = false;
  private _swipeActive = false;
  private _swipeStartX = 0;
  private _swipeStartY = 0;
  private _lastScrollTimeUs = 0;

  constructor(
    private readonly _callbacks: SymbolPickerViewCallbacks,
    private readonly _extensionPath: string,
  ) {
    this.actor = new St.BoxLayout({
      style_class: 'rumo-symbol-picker',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_expand: true,
      visible: false,
      reactive: true,
      can_focus: false,
    });

    this._gridBox = new St.BoxLayout({
      style_class: 'rumo-symbol-grid',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      y_expand: true,
      reactive: true,
      can_focus: false,
    });
    this.actor.add_child(this._gridBox);

    this._paginationTrack = new St.Widget({
      style_class: 'rumo-pagination-track',
      layout_manager: new Clutter.FixedLayout(),
      x_expand: true,
      can_focus: false,
    });
    this._paginationThumb = new St.Widget({
      style_class: 'rumo-pagination-thumb',
      can_focus: false,
    });
    this._paginationTrack.add_child(this._paginationThumb);
    this.actor.add_child(this._paginationTrack);

    this._bottomRow = new St.BoxLayout({
      style_class: 'rumo-key-row rumo-symbol-bottom-row',
      x_expand: true,
      y_expand: false,
      x_align: Clutter.ActorAlign.FILL,
      can_focus: false,
    });
    this.actor.add_child(this._bottomRow);

    this._bindGridNavigation();
    this.actor.connect('destroy', () => {
      this._resetSwipeState();
    });
  }

  show(): void {
    this.actor.show();
  }

  hide(): void {
    this._resetSwipeState();
    this.actor.hide();
  }

  setDimensions(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._applySizing();
  }

  update(state: SymbolPickerState, imeActive: boolean): void {
    this._lastState = state;
    this._imeActive = imeActive;
    this._resetSwipeState();

    this._renderGrid(state);
    this._renderBottomRow(imeActive);
    this._applySizing();
  }

  private _bindGridNavigation(): void {
    this._gridBox.connect('scroll-event', (_actor: any, event: any) => {
      const now = GLib.get_monotonic_time();
      if (now - this._lastScrollTimeUs < SCROLL_DEBOUNCE_US) {
        return Clutter.EVENT_STOP;
      }

      const dir = event.get_scroll_direction();
      let delta = 0;
      if (dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.LEFT) {
        delta = -1;
      } else if (
        dir === Clutter.ScrollDirection.DOWN ||
        dir === Clutter.ScrollDirection.RIGHT
      ) {
        delta = 1;
      } else if (dir === Clutter.ScrollDirection.SMOOTH) {
        const [dx, dy] = event.get_scroll_deltas();
        const primary = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (Math.abs(primary) >= 0.25) {
          delta = primary > 0 ? 1 : -1;
        }
      }

      if (delta !== 0) {
        this._lastScrollTimeUs = now;
        if (delta > 0) this._callbacks.onNextPage();
        else this._callbacks.onPrevPage();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    this._gridBox.connect('captured-event', (_actor: any, event: any) => {
      const type = event.type();
      if (type === Clutter.EventType.TOUCH_BEGIN) {
        const src = event.get_source?.();
        if (this._backspaceBtn && src && this._backspaceBtn.actor.contains(src)) {
          this._resetSwipeState();
          return Clutter.EVENT_PROPAGATE;
        }
        const [x, y] = event.get_coords();
        this._swipeTracking = true;
        this._swipeActive = false;
        this._swipeStartX = x;
        this._swipeStartY = y;
        return Clutter.EVENT_PROPAGATE;
      }

      if (type === Clutter.EventType.TOUCH_UPDATE) {
        if (!this._swipeTracking) {
          return Clutter.EVENT_PROPAGATE;
        }
        const [x, y] = event.get_coords();
        const dx = x - this._swipeStartX;
        const dy = y - this._swipeStartY;
        if (!this._swipeActive) {
          if (
            Math.abs(dx) >= SWIPE_THRESHOLD_PX &&
            Math.abs(dx) > Math.abs(dy) * 1.3
          ) {
            this._swipeActive = true;
            for (const btn of this._symbolButtons) {
              btn.cancelPress();
            }
            return Clutter.EVENT_STOP;
          }
          return Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_STOP;
      }

      if (
        type === Clutter.EventType.TOUCH_END ||
        type === Clutter.EventType.TOUCH_CANCEL
      ) {
        if (this._swipeTracking && this._swipeActive) {
          const [x] = event.get_coords();
          const dx = x - this._swipeStartX;
          const isEnd = type === Clutter.EventType.TOUCH_END;
          this._resetSwipeState();
          for (const btn of this._symbolButtons) {
            btn.cancelPress();
          }
          if (isEnd) {
            if (dx < 0) this._callbacks.onNextPage();
            else this._callbacks.onPrevPage();
          }
          return Clutter.EVENT_STOP;
        }
        this._resetSwipeState();
        return Clutter.EVENT_PROPAGATE;
      }

      return Clutter.EVENT_PROPAGATE;
    });
  }

  private _resetSwipeState(): void {
    this._swipeTracking = false;
    this._swipeActive = false;
    this._swipeStartX = 0;
    this._swipeStartY = 0;
  }

  private _renderGrid(state: SymbolPickerState): void {
    this._gridBox.remove_all_children();
    this._symbolButtons = [];
    this._rowActors = [];
    this._backspaceBtn = null;

    const items = state.items;
    const rowRanges: [number, number][] = [
      [0, 10],
      [10, 20],
      [20, 28],
    ];

    for (let rowIdx = 0; rowIdx < rowRanges.length; rowIdx++) {
      const [start, end] = rowRanges[rowIdx];
      const rowBox = new St.BoxLayout({
        style_class: 'rumo-symbol-row',
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        can_focus: false,
      });

      if (rowIdx === 1 && state.isRecentEmpty) {
        const emptyLabel = new St.Label({
          text: _('No recently used symbols'),
          style_class: 'rumo-symbol-empty-label',
          x_expand: true,
          y_expand: true,
          x_align: Clutter.ActorAlign.CENTER,
          y_align: Clutter.ActorAlign.CENTER,
        });
        rowBox.add_child(emptyLabel);
        this._rowActors.push(rowBox);
        this._gridBox.add_child(rowBox);
        continue;
      }

      if (rowIdx === 2) {
        rowBox.add_child(
          new St.Widget({
            style_class: 'rumo-symbol-spacer-left',
            can_focus: false,
          }),
        );
      }

      for (let idx = start; idx < end; idx++) {
        const sym = items[idx];
        if (sym !== undefined) {
          const btn = new KeyButton(
            {
              id: `sym-${rowIdx}-${idx}`,
              label: sym,
              style: 'normal',
              action: { type: 'commit-direct', value: sym, recordRecent: true },
            },
            (action) => this._callbacks.onKeyAction(action),
            this._extensionPath,
          );
          btn.actor.add_style_class_name('rumo-symbol-key');
          this._symbolButtons.push(btn);
          rowBox.add_child(btn.actor);
        } else {
          rowBox.add_child(
            new St.Widget({
              style_class: 'rumo-symbol-placeholder',
              can_focus: false,
            }),
          );
        }
      }

      if (rowIdx === 2) {
        rowBox.add_child(
          new St.Widget({
            style_class: 'rumo-symbol-spacer-right',
            can_focus: false,
          }),
        );
        const bsBtn = new KeyButton(
          {
            id: 'backspace',
            label: '⌫',
            icon: 'backspace-symbolic',
            repeatable: true,
            width: 1.5,
            style: 'special',
            action: { type: 'backspace' },
          },
          (action) => this._callbacks.onKeyAction(action),
          this._extensionPath,
        );
        this._backspaceBtn = bsBtn;
        rowBox.add_child(bsBtn.actor);
      }

      this._rowActors.push(rowBox);
      this._gridBox.add_child(rowBox);
    }
  }

  private _renderBottomRow(imeActive: boolean): void {
    this._bottomRow.remove_all_children();
    this._bottomButtons = [];
    this._bottomSpecs = makeSymbolPickerBottomRow(imeActive);

    for (const spec of this._bottomSpecs) {
      const btn = new KeyButton(
        spec,
        (action) => this._callbacks.onKeyAction(action),
        this._extensionPath,
      );
      this._bottomButtons.push(btn);
      this._bottomRow.add_child(btn.actor);
    }
  }

  private _applySizing(): void {
    const usableWidth = Math.max(320, this._width - 28);
    const cellWidth = Math.floor((usableWidth - 9 * KEY_GAP_PX) / 10);
    const bsUnit = (usableWidth - 8 * KEY_GAP_PX) / 10;
    const bsWidth = Math.max(28, Math.floor(bsUnit * 1.5));

    // Align bottom row height with 1 row of the 4-row grid layouts
    const approxGridArea = Math.max(160, this._height - 76);
    const rowHeight = Math.max(36, Math.floor((approxGridArea - 3 * 7) / 4));
    this._bottomRow.set_height(rowHeight);

    // 3 symbol rows
    this._rowActors.forEach((rowActor, rowIdx) => {
      if (rowIdx === 1 && this._lastState?.isRecentEmpty) {
        return;
      }
      const children = rowActor.get_children();
      if (rowIdx < 2) {
        for (const child of children) {
          child.set_width(cellWidth);
        }
        return;
      }

      // Row 2: [leftSpacer, ...8 cells, rightSpacer, backspace]
      const leftArea = usableWidth - bsWidth - KEY_GAP_PX;
      const cellsTotal = 8 * cellWidth + 7 * KEY_GAP_PX;
      const spare = Math.max(0, leftArea - cellsTotal - 2 * KEY_GAP_PX);
      const leftPad = Math.floor(spare / 2);
      const rightPad = spare - leftPad;

      children.forEach((child: any, idx: number) => {
        if (idx === 0) {
          child.set_width(leftPad);
        } else if (idx === children.length - 2) {
          child.set_width(rightPad);
        } else if (idx === children.length - 1) {
          child.set_width(bsWidth);
        } else {
          child.set_width(cellWidth);
        }
      });
    });

    // Pagination indicator track & thumb
    const count = this._lastState?.categoryPageCount ?? 1;
    const pageIdx = this._lastState?.pageInCategory ?? 0;
    this._paginationTrack.set_width(usableWidth);
    if (count <= 1) {
      this._paginationThumb.hide();
    } else {
      const thumbWidth = Math.max(16, Math.floor(usableWidth / count));
      const maxX = Math.max(0, usableWidth - thumbWidth);
      const thumbX = Math.min(maxX, Math.round((usableWidth / count) * pageIdx));
      this._paginationThumb.set_size(thumbWidth, 3);
      this._paginationThumb.set_position(thumbX, 0);
      this._paginationThumb.show();
    }

    // Bottom action row
    if (this._bottomSpecs.length > 0) {
      let totalWeight = 0;
      for (const spec of this._bottomSpecs) {
        totalWeight += spec.width ?? 1;
      }
      const gapTotal = Math.max(0, this._bottomSpecs.length - 1) * KEY_GAP_PX;
      const unitWidth = (usableWidth - gapTotal) / Math.max(1, totalWeight);
      const bottomChildren = this._bottomRow.get_children();
      bottomChildren.forEach((child: any, colIdx: number) => {
        const weight = this._bottomSpecs[colIdx]?.width ?? 1;
        child.set_width(Math.max(28, Math.floor(unitWidth * weight)));
      });
    }
  }

  destroy(): void {
    this._resetSwipeState();
    this.actor.destroy();
  }
}
