import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { DisplayMode } from '../core/settings.js';

export class FocusTracker {
  private _focusWindow: any = null;
  private _focusWindowChangedId = 0;
  private _focusNotifyTimerId = 0;
  private _overviewShowingId = 0;
  private _overviewHiddenId = 0;

  private _displayMode: DisplayMode;
  private _keyboardVisible = false;
  private _keyboardHeight = 0;
  private _overviewShowing = false;
  private _appliedShift = 0;

  constructor(
    private readonly _onFocusWindowChanged?: () => void,
    initialDisplayMode: DisplayMode = 'overlay',
  ) {
    this._displayMode = initialDisplayMode;
    this._focusWindow = global.display.focus_window;
    this._overviewShowing = Boolean(Main.overview?.visible);

    this._focusWindowChangedId = global.display.connect('notify::focus-window', () => {
      const nextWin = global.display.focus_window;
      if (nextWin !== this._focusWindow) {
        this._focusWindow = nextWin;
        this._scheduleFocusWindowNotify();
      }
    });

    if (Main.overview?.connect) {
      this._overviewShowingId = Main.overview.connect('showing', () => {
        this._overviewShowing = true;
        this._syncShift(false);
      });
      this._overviewHiddenId = Main.overview.connect('hidden', () => {
        this._overviewShowing = false;
        this._syncShift(true);
      });
    }
  }

  setDisplayMode(mode: DisplayMode, animate = true): void {
    if (this._displayMode === mode) return;
    this._displayMode = mode;
    this._syncShift(animate);
  }

  setKeyboardState(
    visible: boolean,
    keyboardHeight: number,
    animate = true,
  ): void {
    this._keyboardVisible = visible;
    this._keyboardHeight = visible ? Math.max(0, Math.round(keyboardHeight)) : 0;
    this._syncShift(animate);
  }

  private _syncShift(animate: boolean): void {
    const target =
      this._keyboardVisible && this._displayMode === 'push' && !this._overviewShowing
        ? this._keyboardHeight
        : 0;

    if (target === this._appliedShift) {
      return;
    }
    const prevShift = this._appliedShift;
    this._appliedShift = target;

    const duration = target > 0 ? 180 : 140;
    const mode =
      target > 0
        ? Clutter.AnimationMode.EASE_OUT_QUAD
        : Clutter.AnimationMode.EASE_IN_QUAD;

    this._translateActor(global.window_group, -target, animate, duration, mode);
    this._translateActor(global.top_window_group, -target, animate, duration, mode);

    const bgGroup = Main.layoutManager?._backgroundGroup;
    if (bgGroup && bgGroup.get_parent?.() === global.window_group) {
      this._translateActor(bgGroup, target, animate, duration, mode);
    } else if (prevShift !== 0 && bgGroup) {
      this._translateActor(bgGroup, 0, false, duration, mode);
    }
  }

  private _translateActor(
    actor: any,
    translationY: number,
    animate: boolean,
    duration: number,
    mode: number,
  ): void {
    if (!actor) return;
    if (!animate) {
      actor.remove_transition?.('translation-y');
      actor.translation_y = translationY;
      return;
    }
    actor.ease({
      translation_y: translationY,
      duration,
      mode,
    });
  }

  private _scheduleFocusWindowNotify(): void {
    if (!this._onFocusWindowChanged) return;
    if (this._focusNotifyTimerId) {
      GLib.source_remove(this._focusNotifyTimerId);
      this._focusNotifyTimerId = 0;
    }
    // Wait briefly so the newly focused app's IM module finishes FocusIn before Rumo re-acquires
    this._focusNotifyTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
      this._focusNotifyTimerId = 0;
      this._onFocusWindowChanged?.();
      return GLib.SOURCE_REMOVE;
    });
  }

  destroy(): void {
    this._keyboardVisible = false;
    this._keyboardHeight = 0;
    this._appliedShift = 0;
    this._translateActor(global.window_group, 0, false, 0, 0);
    this._translateActor(global.top_window_group, 0, false, 0, 0);
    const bgGroup = Main.layoutManager?._backgroundGroup;
    if (bgGroup) {
      this._translateActor(bgGroup, 0, false, 0, 0);
    }

    if (this._overviewShowingId && Main.overview) {
      Main.overview.disconnect(this._overviewShowingId);
      this._overviewShowingId = 0;
    }
    if (this._overviewHiddenId && Main.overview) {
      Main.overview.disconnect(this._overviewHiddenId);
      this._overviewHiddenId = 0;
    }
    if (this._focusNotifyTimerId) {
      GLib.source_remove(this._focusNotifyTimerId);
      this._focusNotifyTimerId = 0;
    }
    if (this._focusWindowChangedId) {
      global.display.disconnect(this._focusWindowChangedId);
      this._focusWindowChangedId = 0;
    }
  }
}
