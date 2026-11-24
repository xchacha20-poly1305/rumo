import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Keyval, charToKeyval, isPrintableAscii } from '../core/fcitxProtocol.js';
import type { CommitTextOptions, ITextInjector } from '../core/types.js';

const TERMINAL_WM_CLASSES = [
  'gnome-terminal',
  'org.gnome.console',
  'org.gnome.ptyxis',
  'alacritty',
  'kitty',
  'wezterm',
  'foot',
  'konsole',
  'xterm',
];

function isTerminalWindow(window: any): boolean {
  if (!window) return false;
  const wmClass = String(window.get_wm_class?.() ?? '').toLowerCase();
  const wmInstance = String(window.get_wm_class_instance?.() ?? '').toLowerCase();
  for (const name of TERMINAL_WM_CLASSES) {
    if (wmClass.includes(name) || wmInstance.includes(name)) {
      return true;
    }
  }
  return false;
}

export class TextInjector implements ITextInjector {
  private _virtualDevice: any;
  private _clipboardFallbackEnabled: boolean;
  private _pendingTimers: Set<number> = new Set();

  constructor(clipboardFallbackEnabled = true) {
    this._clipboardFallbackEnabled = clipboardFallbackEnabled;
    const seat = global.stage.context.get_backend().get_default_seat();
    this._virtualDevice = seat.create_virtual_device(
      Clutter.InputDeviceType.KEYBOARD_DEVICE,
    );
  }

  setClipboardFallbackEnabled(enabled: boolean): void {
    this._clipboardFallbackEnabled = enabled;
  }

  commitText(text: string, options?: CommitTextOptions): void {
    if (!text) return;

    // Tier 1: Native Wayland text-input-v3 commit via Main.inputMethod
    if (Main.inputMethod.currentFocus) {
      Main.inputMethod.commit(text);
      return;
    }

    // Tier 2: Pure printable ASCII via Clutter.VirtualInputDevice
    // Skip when caller requests avoiding keyvals (e.g. Fcitx5 ShareInputState=All with CN active)
    if (
      isPrintableAscii(text) &&
      !(options?.avoidKeyvalForAscii && this._clipboardFallbackEnabled)
    ) {
      for (let i = 0; i < text.length; i++) {
        this.sendKeyval(charToKeyval(text[i]));
      }
      return;
    }

    // Tier 3: XWayland / non-IM-focus fallback for Chinese / Emoji via clipboard paste
    if (this._clipboardFallbackEnabled) {
      this._commitViaClipboard(text);
      return;
    }

    // Best-effort Unicode keysym fallback if clipboard fallback is disabled
    for (const ch of text) {
      this.sendKeyval(charToKeyval(ch));
    }
  }

  sendKeyval(keyval: number, modifiers: number[] = []): void {
    if (!this._virtualDevice) return;
    const timeUs = Clutter.get_current_event_time() * 1000;

    for (const mod of modifiers) {
      this._virtualDevice.notify_keyval(timeUs, mod, Clutter.KeyState.PRESSED);
    }

    this._virtualDevice.notify_keyval(timeUs, keyval, Clutter.KeyState.PRESSED);
    this._virtualDevice.notify_keyval(timeUs, keyval, Clutter.KeyState.RELEASED);

    for (let i = modifiers.length - 1; i >= 0; i--) {
      this._virtualDevice.notify_keyval(
        timeUs,
        modifiers[i],
        Clutter.KeyState.RELEASED,
      );
    }
  }

  private _commitViaClipboard(text: string): void {
    const clipboard = St.Clipboard.get_default();
    const isTerm = isTerminalWindow(global.display.focus_window);

    clipboard.get_text(St.ClipboardType.CLIPBOARD, (_cb: any, previousText: string | null) => {
      clipboard.set_text(St.ClipboardType.CLIPBOARD, text);

      const pasteTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
        this._pendingTimers.delete(pasteTimer);
        const mods = isTerm
          ? [Keyval.Control_L, Keyval.Shift_L]
          : [Keyval.Control_L];
        this.sendKeyval(charToKeyval('v'), mods);

        if (previousText !== null && previousText !== text) {
          const restoreTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 140, () => {
            this._pendingTimers.delete(restoreTimer);
            clipboard.set_text(St.ClipboardType.CLIPBOARD, previousText);
            return GLib.SOURCE_REMOVE;
          });
          this._pendingTimers.add(restoreTimer);
        }
        return GLib.SOURCE_REMOVE;
      });
      this._pendingTimers.add(pasteTimer);
    });
  }

  destroy(): void {
    for (const id of this._pendingTimers) {
      GLib.source_remove(id);
    }
    this._pendingTimers.clear();

    if (this._virtualDevice) {
      this._virtualDevice.run_dispose();
      this._virtualDevice = null;
    }
  }
}
