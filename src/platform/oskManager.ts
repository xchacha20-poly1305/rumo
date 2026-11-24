import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { InputPurposeKind } from '../core/types.js';
import type { FocusTracker } from './focusTracker.js';
import type { KeyboardView } from '../ui/keyboardView.js';

const A11Y_APPLICATIONS_SCHEMA = 'org.gnome.desktop.a11y.applications';
const SHOW_KEYBOARD_KEY = 'screen-keyboard-enabled';

function mapClutterPurpose(purpose: number): InputPurposeKind {
  switch (purpose) {
    case Clutter.InputContentPurpose.PASSWORD:
      return 'password';
    case Clutter.InputContentPurpose.PIN:
      return 'pin';
    case Clutter.InputContentPurpose.NUMBER:
      return 'number';
    case Clutter.InputContentPurpose.DIGITS:
      return 'digits';
    case Clutter.InputContentPurpose.TERMINAL:
      return 'terminal';
    default:
      return 'normal';
  }
}

export interface OskManagerCallbacks {
  onOpened(): void;
  onClosed(): void;
  onPurposeChanged(purpose: InputPurposeKind): void;
}

export class OskManager {
  private _visible = false;
  private _heightRatio: number;
  private _a11ySettings: any;
  private _panelButton: any = null;

  private _panelStateId = 0;
  private _purposeChangedId = 0;
  private _a11yChangedId = 0;

  private _origKeyboardOpen: any = null;
  private _origKeyboardClose: any = null;
  private _origSyncEnabled: any = null;

  constructor(
    private readonly _view: KeyboardView,
    private readonly _focusTracker: FocusTracker,
    private readonly _callbacks: OskManagerCallbacks,
    heightRatio: number,
    showPanelIndicator: boolean,
  ) {
    this._heightRatio = heightRatio;
    this._a11ySettings = new Gio.Settings({ schema_id: A11Y_APPLICATIONS_SCHEMA });

    this._installHooks();
    this._mountView();
    this._connectSignals();

    if (showPanelIndicator) {
      this._createPanelIndicator();
    }
  }

  get visible(): boolean {
    return this._visible;
  }

  setHeightRatio(ratio: number): void {
    this._heightRatio = Math.min(0.55, Math.max(0.22, ratio));
    if (this._visible) {
      this._applyGeometry();
    }
  }

  setShowPanelIndicator(show: boolean): void {
    if (show && !this._panelButton) {
      this._createPanelIndicator();
    } else if (!show && this._panelButton) {
      this._panelButton.destroy();
      this._panelButton = null;
    }
  }

  private _installHooks(): void {
    const km = Main.keyboard;
    if (!km) return;

    this._origKeyboardOpen = km.open?.bind(km) ?? null;
    this._origKeyboardClose = km.close?.bind(km) ?? null;
    this._origSyncEnabled = km._syncEnabled?.bind(km) ?? null;

    // Hide any currently mounted stock GNOME OSK actor
    if (km._keyboard) {
      km._keyboard.close?.(true);
      km._keyboard.hide?.();
    }

    km.open = (_monitor?: number) => {
      this.open();
    };
    km.close = () => {
      this.close();
    };
    km._syncEnabled = () => {
      // Managed by Rumo while enabled
    };
  }

  private _mountView(): void {
    const kbBox = Main.layoutManager.keyboardBox;
    kbBox.add_child(this._view.actor);
    this._view.actor.hide();
    kbBox.hide();
  }

  private _connectSignals(): void {
    this._panelStateId = Main.inputMethod.connect(
      'input-panel-state',
      (_im: any, state: number) => {
        const a11yEnabled = this._a11ySettings.get_boolean(SHOW_KEYBOARD_KEY);
        if (state === Clutter.InputPanelState.ON) {
          if (a11yEnabled) {
            this.open();
          }
        } else if (state === Clutter.InputPanelState.OFF) {
          this.close();
        } else if (state === Clutter.InputPanelState.TOGGLE) {
          this.toggle();
        }
      },
    );

    this._purposeChangedId = Main.inputMethod.connect(
      'notify::content-purpose',
      (im: any) => {
        this._callbacks.onPurposeChanged(mapClutterPurpose(im.content_purpose));
      },
    );

    this._a11yChangedId = this._a11ySettings.connect(
      `changed::${SHOW_KEYBOARD_KEY}`,
      () => {
        const enabled = this._a11ySettings.get_boolean(SHOW_KEYBOARD_KEY);
        if (!enabled && this._visible) {
          this.close();
        }
      },
    );

    // Sync initial purpose
    this._callbacks.onPurposeChanged(
      mapClutterPurpose(Main.inputMethod.content_purpose ?? 0),
    );
  }

  private _createPanelIndicator(): void {
    const btn = new PanelMenu.Button(0.0, _('Rumo Keyboard'), true);
    const icon = new St.Icon({
      icon_name: 'input-keyboard-symbolic',
      style_class: 'system-status-icon',
    });
    btn.add_child(icon);
    btn.connect('button-press-event', () => {
      this.toggle();
      return Clutter.EVENT_STOP;
    });
    Main.panel.addToStatusArea('rumo-osk-indicator', btn);
    this._panelButton = btn;
  }

  private _applyGeometry(): number {
    const monitorIdx = Main.layoutManager.focusIndex ?? Main.layoutManager.primaryIndex;
    const monitor = Main.layoutManager.monitors[monitorIdx];
    if (!monitor) return 0;

    const kbHeight = Math.round(monitor.height * this._heightRatio);
    const kbBox = Main.layoutManager.keyboardBox;

    kbBox.set_position(monitor.x, monitor.y + monitor.height - kbHeight);
    kbBox.set_size(monitor.width, kbHeight);
    this._view.setDimensions(monitor.width, kbHeight);
    return kbHeight;
  }

  open(): void {
    if (this._visible) return;
    this._visible = true;

    const kbHeight = this._applyGeometry();
    const kbBox = Main.layoutManager.keyboardBox;

    this._view.actor.show();
    kbBox.show();
    kbBox.translation_y = kbHeight;
    kbBox.ease({
      translation_y: 0,
      duration: 180,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });

    this._focusTracker.setKeyboardState(true, kbHeight);
    this._callbacks.onOpened();
  }

  close(): void {
    if (!this._visible) return;
    this._visible = false;

    const kbBox = Main.layoutManager.keyboardBox;
    const kbHeight = kbBox.height || 300;

    this._focusTracker.setKeyboardState(false, 0);
    this._callbacks.onClosed();

    kbBox.ease({
      translation_y: kbHeight,
      duration: 140,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
      onComplete: () => {
        if (!this._visible) {
          this._view.actor.hide();
          kbBox.hide();
          kbBox.translation_y = 0;
        }
      },
    });
  }

  toggle(): void {
    if (this._visible) {
      this.close();
    } else {
      this.open();
    }
  }

  destroy(): void {
    if (this._visible) {
      this._visible = false;
      this._focusTracker.setKeyboardState(false, 0);
    }

    if (this._panelStateId) {
      Main.inputMethod.disconnect(this._panelStateId);
      this._panelStateId = 0;
    }
    if (this._purposeChangedId) {
      Main.inputMethod.disconnect(this._purposeChangedId);
      this._purposeChangedId = 0;
    }
    if (this._a11yChangedId) {
      this._a11ySettings.disconnect(this._a11yChangedId);
      this._a11yChangedId = 0;
    }

    if (this._panelButton) {
      this._panelButton.destroy();
      this._panelButton = null;
    }

    const kbBox = Main.layoutManager.keyboardBox;
    if (this._view.actor.get_parent() === kbBox) {
      kbBox.remove_child(this._view.actor);
    }
    kbBox.hide();
    kbBox.translation_y = 0;

    // Restore stock GNOME Shell Main.keyboard methods cleanly
    const km = Main.keyboard;
    if (km) {
      if (this._origKeyboardOpen) km.open = this._origKeyboardOpen;
      if (this._origKeyboardClose) km.close = this._origKeyboardClose;
      if (this._origSyncEnabled) {
        km._syncEnabled = this._origSyncEnabled;
        km._syncEnabled();
      }
    }
  }
}
