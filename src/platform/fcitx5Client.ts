import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
  RUMO_CAPABILITIES,
  parseClientSideUI,
} from '../core/fcitxProtocol.js';
import type {
  ClientSideUIState,
  IFcitxBackend,
  IMInfo,
} from '../core/types.js';

const FCITX_BUS_NAME = 'org.fcitx.Fcitx5';
const IM_OBJECT_PATH = '/org/freedesktop/portal/inputmethod';
const IM_INTERFACE = 'org.fcitx.Fcitx.InputMethod1';
const IC_INTERFACE = 'org.fcitx.Fcitx.InputContext1';
const CONTROLLER_PATH = '/controller';
const CONTROLLER_INTERFACE = 'org.fcitx.Fcitx.Controller1';

export interface Fcitx5ClientCallbacks {
  onConnectionChanged(connected: boolean): void;
  onUIUpdate(ui: ClientSideUIState): void;
  onCommit(text: string): void;
  onForwardKey(keyval: number, state: number, isRelease: boolean): void;
  onIMChanged(info: IMInfo): void;
}

function callDBusAsync(
  bus: any,
  busName: string,
  objectPath: string,
  ifaceName: string,
  methodName: string,
  params: any,
  timeoutMs = 5000,
  replyType: any = null,
): Promise<any> {
  return new Promise((resolve, reject) => {
    bus.call(
      busName,
      objectPath,
      ifaceName,
      methodName,
      params,
      replyType,
      Gio.DBusCallFlags.NONE,
      timeoutMs,
      null,
      (conn: any, res: any) => {
        try {
          resolve(conn.call_finish(res));
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000];

export class Fcitx5Client implements IFcitxBackend {
  private readonly _bus: any;
  private _watchId = 0;
  private _icPath: string | null = null;
  private _signalSubIds: number[] = [];
  private _destroyed = false;
  private _namePresent = false;
  private _initInFlight = false;
  private _retryTimerId = 0;
  private _retryAttempt = 0;

  constructor(private readonly _callbacks: Fcitx5ClientCallbacks) {
    this._bus = Gio.DBus.session;
    this._watchId = Gio.bus_watch_name_on_connection(
      this._bus,
      FCITX_BUS_NAME,
      Gio.BusNameWatcherFlags.NONE,
      () => {
        this._namePresent = true;
        this._retryAttempt = 0;
        this._clearRetryTimer();
        this._startInit();
      },
      () => {
        this._namePresent = false;
        this._clearRetryTimer();
        this._teardownInputContext(false);
        this._callbacks.onConnectionChanged(false);
      },
    );
  }

  get isConnected(): boolean {
    return this._icPath !== null;
  }

  reconnect(): void {
    if (this._destroyed || this._icPath !== null) return;
    this._clearRetryTimer();
    this._retryAttempt = 0;
    this._startInit();
  }

  private _clearRetryTimer(): void {
    if (this._retryTimerId) {
      GLib.source_remove(this._retryTimerId);
      this._retryTimerId = 0;
    }
  }

  private _scheduleRetry(): void {
    if (this._destroyed || !this._namePresent || this._icPath !== null) return;
    this._clearRetryTimer();

    const idx = Math.min(this._retryAttempt, RETRY_DELAYS_MS.length - 1);
    const delayMs = RETRY_DELAYS_MS[idx];
    this._retryAttempt++;

    this._retryTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
      this._retryTimerId = 0;
      if (!this._destroyed && this._namePresent && this._icPath === null) {
        this._startInit();
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  private _startInit(): void {
    if (this._destroyed || this._initInFlight || this._icPath !== null) return;
    this._initInFlight = true;
    this._initInputContext()
      .catch((err) => {
        console.error('[Rumo] Failed to create Fcitx5 InputContext:', err);
        this._teardownInputContext(false);
        this._callbacks.onConnectionChanged(false);
        this._scheduleRetry();
      })
      .finally(() => {
        this._initInFlight = false;
      });
  }

  private async _initInputContext(): Promise<void> {
    if (this._destroyed) return;
    this._teardownInputContext(false);

    // Pass a custom display ('rumo:') so Fcitx5 dbusfrontend does not strip
    // ClientSideInputPanel under GNOME + kimpanel.
    const params = new GLib.Variant('(a(ss))', [
      [
        ['program', 'rumo'],
        ['display', 'rumo:'],
      ],
    ]);
    const res = await callDBusAsync(
      this._bus,
      FCITX_BUS_NAME,
      IM_OBJECT_PATH,
      IM_INTERFACE,
      'CreateInputContext',
      params,
      5000,
    );

    if (this._destroyed) return;

    const [icPath] = res.deepUnpack() as [string, Uint8Array];
    this._icPath = icPath;

    // 1n << 39n fits cleanly inside JS safe integer range (< 2^53)
    const capVariant = new GLib.Variant('(t)', [Number(RUMO_CAPABILITIES)]);
    await callDBusAsync(
      this._bus,
      FCITX_BUS_NAME,
      icPath,
      IC_INTERFACE,
      'SetSupportedCapability',
      capVariant,
      5000,
    );
    await callDBusAsync(
      this._bus,
      FCITX_BUS_NAME,
      icPath,
      IC_INTERFACE,
      'SetCapability',
      capVariant,
      5000,
    );

    if (this._destroyed) return;

    this._retryAttempt = 0;
    this._subscribeSignals(icPath);
    this._callbacks.onConnectionChanged(true);
  }

  private _subscribeSignals(icPath: string): void {
    const sub = (signalName: string, handler: (...args: any[]) => void) => {
      const id = this._bus.signal_subscribe(
        FCITX_BUS_NAME,
        IC_INTERFACE,
        signalName,
        icPath,
        null,
        Gio.DBusSignalFlags.NONE,
        (_conn: any, _sender: any, _path: any, _iface: any, _sig: any, params: any) => {
          if (this._destroyed) return;
          try {
            handler(params.deepUnpack());
          } catch (err) {
            console.error(`[Rumo] Error handling Fcitx5 signal ${signalName}:`, err);
          }
        },
      );
      this._signalSubIds.push(id);
    };

    sub('CommitString', (args: [string]) => {
      this._callbacks.onCommit(args[0]);
    });

    sub('ForwardKey', (args: [number, number, boolean]) => {
      this._callbacks.onForwardKey(args[0], args[1], args[2]);
    });

    sub('CurrentIM', (args: [string, string, string]) => {
      this._callbacks.onIMChanged({
        name: args[0],
        uniqueName: args[1],
        langCode: args[2],
      });
    });

    sub(
      'UpdateClientSideUI',
      (
        args: [
          [string, number][],
          number,
          [string, number][],
          [string, number][],
          [string, string][],
          number,
          number,
          boolean,
          boolean,
        ],
      ) => {
        const state = parseClientSideUI(
          args[0],
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
          args[6],
          args[7],
          args[8],
        );
        this._callbacks.onUIUpdate(state);
      },
    );
  }

  private async _callICSafe(method: string, params: any = null): Promise<void> {
    if (!this._icPath || this._destroyed) return;
    try {
      await callDBusAsync(
        this._bus,
        FCITX_BUS_NAME,
        this._icPath,
        IC_INTERFACE,
        method,
        params,
        3000,
      );
    } catch (err) {
      console.error(`[Rumo] Fcitx5 IC.${method} failed:`, err);
    }
  }

  private async _callControllerSafe(method: string, params: any = null): Promise<void> {
    if (this._destroyed) return;
    try {
      await callDBusAsync(
        this._bus,
        FCITX_BUS_NAME,
        CONTROLLER_PATH,
        CONTROLLER_INTERFACE,
        method,
        params,
        3000,
      );
    } catch (err) {
      console.error(`[Rumo] Fcitx5 Controller.${method} failed:`, err);
    }
  }

  acquireFocus(activateRumoIM: boolean): void {
    void this._acquireFocusAsync(activateRumoIM);
  }

  private async _acquireFocusAsync(activateRumoIM: boolean): Promise<void> {
    if (!this._icPath || this._destroyed) return;

    // 1. Deactivate whichever app IC currently holds Fcitx5 focus so virtual
    //    keystrokes injected by Rumo (e.g. EN mode) will not trigger the app's own IM.
    await this._callControllerSafe('Deactivate');
    if (!this._icPath || this._destroyed) return;

    // 2. Move Fcitx5 focus to Rumo's own InputContext.
    await this._callICSafe('FocusIn');
    if (!this._icPath || this._destroyed) return;

    // 3. Apply Rumo's desired IM state on Rumo's InputContext.
    if (activateRumoIM) {
      await this._callControllerSafe('Activate');
    } else {
      await this._callControllerSafe('Deactivate');
    }
  }

  focusIn(): void {
    void this._callICSafe('FocusIn');
  }

  focusOut(): void {
    void this._callICSafe('FocusOut');
  }

  reset(): Promise<void> {
    return this._callICSafe('Reset');
  }

  async processKeyEvent(
    keyval: number,
    keycode: number,
    state: number,
    isRelease: boolean,
  ): Promise<boolean> {
    if (!this._icPath || this._destroyed) return false;
    try {
      const res = await callDBusAsync(
        this._bus,
        FCITX_BUS_NAME,
        this._icPath,
        IC_INTERFACE,
        'ProcessKeyEvent',
        new GLib.Variant('(uuubu)', [keyval, keycode, state, isRelease, 0]),
        2000,
      );
      const [handled] = res.deepUnpack() as [boolean];
      return handled;
    } catch (err) {
      console.error('[Rumo] ProcessKeyEvent failed:', err);
      return false;
    }
  }

  selectCandidate(index: number): Promise<void> {
    return this._callICSafe('SelectCandidate', new GLib.Variant('(i)', [index]));
  }

  selectCandidateAtPageOffset(pageDelta: number, index: number): void {
    void this._selectCandidateAtPageOffsetAsync(pageDelta, index);
  }

  private async _selectCandidateAtPageOffsetAsync(
    pageDelta: number,
    index: number,
  ): Promise<void> {
    if (!this._icPath || this._destroyed) return;
    const steps = Math.abs(pageDelta);
    const method = pageDelta < 0 ? 'PrevPage' : 'NextPage';
    for (let i = 0; i < steps; i++) {
      if (!this._icPath || this._destroyed) return;
      await this._callICSafe(method);
    }
    if (!this._icPath || this._destroyed) return;
    await this._callICSafe('SelectCandidate', new GLib.Variant('(i)', [index]));
  }

  nextPage(): void {
    void this._callICSafe('NextPage');
  }

  prevPage(): void {
    void this._callICSafe('PrevPage');
  }

  activateIM(): void {
    void this._callControllerSafe('Activate');
  }

  deactivateIM(): void {
    void this._callControllerSafe('Deactivate');
  }

  private _teardownInputContext(callDestroy: boolean): void {
    for (const id of this._signalSubIds) {
      this._bus.signal_unsubscribe(id);
    }
    this._signalSubIds = [];

    if (callDestroy && this._icPath) {
      const pathToDestroy = this._icPath;
      this._icPath = null;
      callDBusAsync(
        this._bus,
        FCITX_BUS_NAME,
        pathToDestroy,
        IC_INTERFACE,
        'DestroyIC',
        null,
        2000,
      ).catch(() => {});
    } else {
      this._icPath = null;
    }
  }

  destroy(): void {
    this._destroyed = true;
    this._clearRetryTimer();
    if (this._watchId) {
      Gio.bus_unwatch_name(this._watchId);
      this._watchId = 0;
    }
    this._teardownInputContext(true);
  }
}
