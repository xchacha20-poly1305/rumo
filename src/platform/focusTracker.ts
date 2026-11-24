import GLib from 'gi://GLib';

export class FocusTracker {
  private _focusWindow: any = null;
  private _focusWindowChangedId = 0;
  private _focusNotifyTimerId = 0;

  constructor(private readonly _onFocusWindowChanged?: () => void) {
    this._focusWindow = global.display.focus_window;

    this._focusWindowChangedId = global.display.connect('notify::focus-window', () => {
      const nextWin = global.display.focus_window;
      if (nextWin !== this._focusWindow) {
        this._focusWindow = nextWin;
        this._scheduleFocusWindowNotify();
      }
    });
  }

  setKeyboardState(_visible: boolean, _keyboardHeight: number): void {
    // Intentionally do not shift/push windows upward when the keyboard opens.
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
