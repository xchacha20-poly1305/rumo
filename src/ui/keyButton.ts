import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { KeyAction, KeySpec } from '../core/types.js';

const REPEAT_INITIAL_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 55;
const SECONDARY_LONG_PRESS_MS = 350;
const LONG_PRESS_CANCEL_MOVE_PX = 12;
const SWIPE_UP_MIN_DY_PX = 22;
const SWIPE_UP_DISARM_DY_PX = 12;

export class KeyButton {
  readonly actor: any;
  readonly spec: KeySpec;

  private readonly _onTrigger: (action: KeyAction) => void;
  private readonly _mainLabel: any = null;

  private _touchHandled = false;
  private _pointerDown = false;
  private _pressActive = false;
  private _startX = 0;
  private _startY = 0;

  private _repeatDelayId = 0;
  private _repeatIntervalId = 0;
  private _longPressId = 0;

  private _repeatFired = false;
  private _secondaryFired = false;
  private _swipeArmed = false;

  constructor(
    spec: KeySpec,
    onTrigger: (action: KeyAction) => void,
    extensionPath: string,
  ) {
    this.spec = spec;
    this._onTrigger = onTrigger;

    const classes = ['rumo-key'];
    if (spec.style === 'special') classes.push('rumo-key-special');
    else if (spec.style === 'accent') classes.push('rumo-key-accent');
    else if (spec.style === 'space') classes.push('rumo-key-space');
    else if (spec.style === 'alt-fg') classes.push('rumo-key-alt-fg');
    else if (spec.style === 'numpad-digit') classes.push('rumo-key-numpad-digit');

    const buttonProps: Record<string, unknown> = {
      style_class: classes.join(' '),
      can_focus: false,
      reactive: true,
      x_expand: true,
      y_expand: true,
    };

    if (spec.icon) {
      const iconPath = `${extensionPath}/icons/${spec.icon}.svg`;
      const gicon = Gio.icon_new_for_string(iconPath);
      buttonProps.child = new St.Icon({
        gicon,
        icon_size: 20,
        style_class: 'rumo-key-icon',
      });
    } else if (spec.secondaryLabel) {
      const container = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        y_align: Clutter.ActorAlign.FILL,
        can_focus: false,
      });
      this._mainLabel = new St.Label({
        text: spec.label,
        style_class: 'rumo-key-main-label',
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });
      const secLabel = new St.Label({
        text: spec.secondaryLabel,
        style_class: 'rumo-key-secondary-label',
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.START,
      });
      container.add_child(this._mainLabel);
      container.add_child(secLabel);
      buttonProps.child = container;
    } else {
      buttonProps.label = spec.id === 'space' ? _('Space') : spec.label;
    }

    this.actor = new St.Button(buttonProps);

    // Multi-touch friendly handling (does not steal focus)
    this.actor.connect('touch-event', (_actor: any, event: any) => {
      const type = event.type();
      if (type === Clutter.EventType.TOUCH_BEGIN) {
        this._touchHandled = true;
        this._pointerDown = false;
        const [x, y] = event.get_coords();
        this._onPressBegin(x, y);
        return Clutter.EVENT_STOP;
      }
      if (type === Clutter.EventType.TOUCH_UPDATE) {
        const [x, y] = event.get_coords();
        this._onPressMove(x, y);
        return Clutter.EVENT_STOP;
      }
      if (type === Clutter.EventType.TOUCH_END) {
        this._onPressEnd();
        return Clutter.EVENT_STOP;
      }
      if (type === Clutter.EventType.TOUCH_CANCEL) {
        this._onPressCancel();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    // Pointer/mouse fallback (guarded against duplicate touch firing)
    this.actor.connect('button-press-event', (_actor: any, event: any) => {
      if (this._touchHandled) {
        this._touchHandled = false;
        this._pointerDown = false;
        return Clutter.EVENT_STOP;
      }
      this._pointerDown = true;
      const [x, y] = event.get_coords();
      this._onPressBegin(x, y);
      return Clutter.EVENT_STOP;
    });

    this.actor.connect('motion-event', (_actor: any, event: any) => {
      if (!this._pointerDown) {
        return Clutter.EVENT_PROPAGATE;
      }
      const [x, y] = event.get_coords();
      this._onPressMove(x, y);
      return Clutter.EVENT_STOP;
    });

    this.actor.connect('button-release-event', () => {
      if (this._touchHandled) {
        this._touchHandled = false;
        this._pointerDown = false;
        return Clutter.EVENT_STOP;
      }
      if (!this._pointerDown) {
        return Clutter.EVENT_STOP;
      }
      this._pointerDown = false;
      this._onPressEnd();
      return Clutter.EVENT_STOP;
    });

    this.actor.connect('leave-event', () => {
      if (this._pointerDown) {
        this._pointerDown = false;
        this._onPressCancel();
      }
      return Clutter.EVENT_PROPAGATE;
    });

    this.actor.connect('destroy', () => {
      this._pointerDown = false;
      this._resetPressVisualAndTimers();
    });
  }

  setLabel(label: string): void {
    if (this._mainLabel) {
      this._mainLabel.text = label;
    } else {
      this.actor.label = label;
    }
  }

  setActive(active: boolean): void {
    if (active) {
      this.actor.add_style_class_name('rumo-key-active');
    } else {
      this.actor.remove_style_class_name('rumo-key-active');
    }
  }

  cancelPress(): void {
    this._pointerDown = false;
    this._resetPressVisualAndTimers();
  }

  private _onPressBegin(x: number, y: number): void {
    this._resetPressVisualAndTimers();
    this._pressActive = true;
    this._startX = x;
    this._startY = y;
    this.actor.add_style_class_name('rumo-key-pressed');

    if (this.spec.repeatable) {
      this._repeatDelayId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        REPEAT_INITIAL_DELAY_MS,
        () => {
          this._repeatDelayId = 0;
          if (!this._pressActive) {
            return GLib.SOURCE_REMOVE;
          }
          this._repeatFired = true;
          this._onTrigger(this.spec.action);
          this._repeatIntervalId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            REPEAT_INTERVAL_MS,
            () => {
              if (!this._pressActive) {
                this._repeatIntervalId = 0;
                return GLib.SOURCE_REMOVE;
              }
              this._onTrigger(this.spec.action);
              return GLib.SOURCE_CONTINUE;
            },
          );
          return GLib.SOURCE_REMOVE;
        },
      );
    } else if (this.spec.secondaryAction) {
      const secondaryAction = this.spec.secondaryAction;
      this._longPressId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        SECONDARY_LONG_PRESS_MS,
        () => {
          this._longPressId = 0;
          if (!this._pressActive || this._secondaryFired) {
            return GLib.SOURCE_REMOVE;
          }
          this._secondaryFired = true;
          this.actor.add_style_class_name('rumo-key-secondary-active');
          this._onTrigger(secondaryAction);
          return GLib.SOURCE_REMOVE;
        },
      );
    }
  }

  private _onPressMove(x: number, y: number): void {
    if (!this._pressActive || !this.spec.secondaryAction || this._secondaryFired) {
      return;
    }

    const dx = x - this._startX;
    const dy = this._startY - y;
    if (dx * dx + dy * dy > LONG_PRESS_CANCEL_MOVE_PX * LONG_PRESS_CANCEL_MOVE_PX) {
      this._clearLongPressTimer();
    }

    if (dy >= SWIPE_UP_MIN_DY_PX && dy > Math.abs(dx) * 1.1) {
      if (!this._swipeArmed) {
        this._swipeArmed = true;
        this.actor.add_style_class_name('rumo-key-secondary-active');
      }
    } else if (dy < SWIPE_UP_DISARM_DY_PX && this._swipeArmed) {
      this._swipeArmed = false;
      this.actor.remove_style_class_name('rumo-key-secondary-active');
    }
  }

  private _onPressEnd(): void {
    if (!this._pressActive) return;

    const repeatFired = this._repeatFired;
    const secondaryFired = this._secondaryFired;
    const swipeArmed = this._swipeArmed;

    this._resetPressVisualAndTimers();

    if (repeatFired || secondaryFired) {
      return;
    }
    if (swipeArmed && this.spec.secondaryAction) {
      this._onTrigger(this.spec.secondaryAction);
    } else {
      this._onTrigger(this.spec.action);
    }
  }

  private _onPressCancel(): void {
    if (!this._pressActive) return;
    this._resetPressVisualAndTimers();
  }

  private _clearLongPressTimer(): void {
    if (this._longPressId) {
      GLib.source_remove(this._longPressId);
      this._longPressId = 0;
    }
  }

  private _clearRepeatTimers(): void {
    if (this._repeatDelayId) {
      GLib.source_remove(this._repeatDelayId);
      this._repeatDelayId = 0;
    }
    if (this._repeatIntervalId) {
      GLib.source_remove(this._repeatIntervalId);
      this._repeatIntervalId = 0;
    }
  }

  private _resetPressVisualAndTimers(): void {
    this._clearLongPressTimer();
    this._clearRepeatTimers();
    this._pressActive = false;
    this._repeatFired = false;
    this._secondaryFired = false;
    this._swipeArmed = false;
    this.actor.remove_style_class_name('rumo-key-pressed');
    this.actor.remove_style_class_name('rumo-key-secondary-active');
  }
}
