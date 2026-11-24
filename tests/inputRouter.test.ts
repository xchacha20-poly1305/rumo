import { describe, expect, it, mock } from 'bun:test';
import { KeyState, Keyval, parseClientSideUI } from '../src/core/fcitxProtocol.js';
import { InputRouter } from '../src/core/inputRouter.js';
import type { IFcitxBackend, ITextInjector } from '../src/core/types.js';

function createMocks(connected = true, initialRecent?: string[]) {
  const events: string[] = [];

  const fcitx: IFcitxBackend & { isConnected: boolean } = {
    isConnected: connected,
    reconnect: mock(() => {}),
    acquireFocus: mock(() => {}),
    focusIn: mock(() => {}),
    focusOut: mock(() => {}),
    reset: mock(async () => {
      events.push('fcitx.reset');
    }),
    processKeyEvent: mock(async () => true),
    selectCandidate: mock(async () => {
      events.push('fcitx.selectCandidate(0)');
    }),
    selectCandidateAtPageOffset: mock(() => {}),
    nextPage: mock(() => {}),
    prevPage: mock(() => {}),
    activateIM: mock(() => {}),
    deactivateIM: mock(() => {}),
  };

  const injector: ITextInjector = {
    commitText: mock((text: string) => {
      events.push(`injector.commitText(${text})`);
    }),
    sendKeyval: mock(() => {}),
  };

  const callbacks = {
    onLayoutChanged: mock(() => {}),
    onUIStateChanged: mock(() => {}),
    onDrawerStateChanged: mock(() => {}),
    onSymbolPickerStateChanged: mock(() => {}),
    onRecentSymbolsChanged: mock(() => {}),
    onIMModeChanged: mock(() => {}),
    onHideRequested: mock(() => {}),
  };

  const router = new InputRouter(fcitx, injector, callbacks, initialRecent);
  return { fcitx, injector, callbacks, router, events };
}

describe('InputRouter', () => {
  it('routes characters through Fcitx5 when IME is active and commits on unhandled', async () => {
    const { fcitx, injector, router } = createMocks(true);

    await router.handleKeyAction({ type: 'char', value: 'n' });
    expect(fcitx.processKeyEvent).toHaveBeenCalledWith(0x6e, 0, 0, false);
    expect(injector.commitText).not.toHaveBeenCalled();

    (fcitx.processKeyEvent as ReturnType<typeof mock>).mockResolvedValueOnce(false);
    await router.handleKeyAction({ type: 'char', value: ',' });
    expect(injector.commitText).toHaveBeenCalledWith(',');
  });

  it('sends KeyState.None for secondary char with ignoreShift while consuming one-shot shift', async () => {
    const { fcitx, router } = createMocks(true);

    await router.handleKeyAction({ type: 'shift' });
    expect(router.shiftState).toBe('once');

    await router.handleKeyAction({ type: 'char', value: '(', ignoreShift: true });
    expect(fcitx.processKeyEvent).toHaveBeenCalledWith(0x28, 0, KeyState.None, false);
    expect(router.shiftState).toBe('off');
    expect(router.layout).toBe('qwerty-lower');
  });

  it('bypasses Fcitx5 in password and pin fields, and opens numpad for pin', async () => {
    const { fcitx, injector, router } = createMocks(true);

    router.setPurpose('password');
    expect(fcitx.reset).toHaveBeenCalled();
    expect(fcitx.focusOut).toHaveBeenCalled();
    expect(router.layout).toBe('qwerty-lower');

    await router.handleKeyAction({ type: 'char', value: 's' });
    expect(fcitx.processKeyEvent).not.toHaveBeenCalled();
    expect(injector.commitText).toHaveBeenCalledWith('s');

    router.setPurpose('pin');
    expect(router.layout).toBe('numpad');
    expect(router.lastSymbolLayout).toBe('symbol-picker');

    await router.handleKeyAction({ type: 'commit-direct', value: '7' });
    expect(fcitx.processKeyEvent).not.toHaveBeenCalled();
    expect(injector.commitText).toHaveBeenCalledWith('7', undefined);
  });

  it('remembers manual symbol/number choice without letting numeric purpose overwrite memory', async () => {
    const { callbacks, router } = createMocks(true);

    expect(router.lastSymbolLayout).toBe('symbol-picker');
    await router.handleKeyAction({ type: 'open-symbol-or-number' });
    expect(router.layout).toBe('symbol-picker');
    expect(callbacks.onSymbolPickerStateChanged).toHaveBeenCalled();

    await router.handleKeyAction({
      type: 'switch-layout',
      target: 'numpad',
      remember: true,
    });
    expect(router.layout).toBe('numpad');
    expect(router.lastSymbolLayout).toBe('numpad');

    await router.handleKeyAction({ type: 'switch-layout', target: 'qwerty-lower' });
    await router.handleKeyAction({ type: 'open-symbol-or-number' });
    expect(router.layout).toBe('numpad');

    // Switching back to symbol-picker updates memory again
    await router.handleKeyAction({
      type: 'switch-layout',
      target: 'symbol-picker',
      remember: true,
    });
    expect(router.lastSymbolLayout).toBe('symbol-picker');

    // Number/digits purpose opens numpad but does NOT overwrite remembered symbol-picker
    router.setPurpose('number');
    expect(router.layout).toBe('numpad');
    expect(router.lastSymbolLayout).toBe('symbol-picker');

    router.setPurpose('normal');
    expect(router.layout).toBe('qwerty-lower');

    await router.handleKeyAction({ type: 'open-symbol-or-number' });
    expect(router.layout).toBe('symbol-picker');
  });

  it('restores qwerty-lower on keyboard close from symbol-picker or manual numpad, preserving memory', async () => {
    const { router } = createMocks(true);

    await router.handleKeyAction({
      type: 'switch-layout',
      target: 'numpad',
      remember: true,
    });
    expect(router.layout).toBe('numpad');

    router.onKeyboardClosed();
    expect(router.layout).toBe('qwerty-lower');
    expect(router.lastSymbolLayout).toBe('numpad');

    // When purpose is number, closing keeps numpad
    router.setPurpose('number');
    expect(router.layout).toBe('numpad');
    router.onKeyboardClosed();
    expect(router.layout).toBe('numpad');
  });

  it('commits first candidate then resets before direct symbol commit, and records recent', async () => {
    const { fcitx, injector, callbacks, router, events } = createMocks(true, ['！']);

    router.onFcitxUIUpdate(
      parseClientSideUI([['ni', 0]], 2, [], [], [['1.', '你']], 0, 0, false, false),
    );

    await router.handleKeyAction({
      type: 'commit-direct',
      value: '（',
      recordRecent: true,
    });

    expect(fcitx.selectCandidate).toHaveBeenCalledWith(0);
    expect(fcitx.reset).toHaveBeenCalled();
    expect(injector.commitText).toHaveBeenCalledWith('（', { avoidKeyvalForAscii: true });
    expect(events).toEqual([
      'fcitx.selectCandidate(0)',
      'fcitx.reset',
      'injector.commitText(（)',
    ]);
    expect(callbacks.onRecentSymbolsChanged).toHaveBeenCalledWith(['（', '！']);
  });

  it('commits raw preedit text when no candidates exist before direct symbol commit', async () => {
    const { fcitx, injector, router, events } = createMocks(true);

    router.onFcitxUIUpdate(
      parseClientSideUI([['abc', 0]], 3, [], [], [], -1, 0, false, false),
    );

    await router.handleKeyAction({
      type: 'commit-direct',
      value: '+',
      recordRecent: false,
    });

    expect(fcitx.selectCandidate).not.toHaveBeenCalled();
    expect(events).toEqual([
      'injector.commitText(abc)',
      'fcitx.reset',
      'injector.commitText(+)',
    ]);
    expect(injector.commitText).toHaveBeenLastCalledWith('+', { avoidKeyvalForAscii: true });
  });

  it('routes backspace to Fcitx5 only when preedit is active', async () => {
    const { fcitx, injector, router } = createMocks(true);

    // No preedit -> direct BackSpace keyval
    await router.handleKeyAction({ type: 'backspace' });
    expect(fcitx.processKeyEvent).not.toHaveBeenCalled();
    expect(injector.sendKeyval).toHaveBeenCalledWith(Keyval.BackSpace);

    // Active preedit -> send to Fcitx5
    router.onFcitxUIUpdate(
      parseClientSideUI([['ni', 0]], 2, [], [], [['1.', '你']], 0, 0, false, false),
    );
    await router.handleKeyAction({ type: 'backspace' });
    expect(fcitx.processKeyEvent).toHaveBeenCalledWith(Keyval.BackSpace, 0, 0, false);
  });

  it('cycles shift state (off -> once -> locked -> off) and consumes one-shot shift', async () => {
    const { router } = createMocks(false);

    await router.handleKeyAction({ type: 'shift' });
    expect(router.shiftState).toBe('once');
    expect(router.layout).toBe('qwerty-upper');

    await router.handleKeyAction({ type: 'char', value: 'A' });
    expect(router.shiftState).toBe('off');
    expect(router.layout).toBe('qwerty-lower');

    await router.handleKeyAction({ type: 'shift' });
    await router.handleKeyAction({ type: 'shift' });
    expect(router.shiftState).toBe('locked');

    await router.handleKeyAction({ type: 'char', value: 'B' });
    expect(router.shiftState).toBe('locked');
  });

  it('degrades gracefully when Fcitx5 disconnects and triggers reconnect on toggle/open', async () => {
    const { fcitx, injector, callbacks, router } = createMocks(true);
    fcitx.isConnected = false;
    router.onFcitxConnectionChanged(false);

    expect(callbacks.onIMModeChanged).toHaveBeenCalledWith(false, 'EN (离线)');
    await router.handleKeyAction({ type: 'char', value: 'a' });
    expect(injector.commitText).toHaveBeenCalledWith('a');

    // Opening or tapping 中/英 while disconnected triggers reconnect
    router.onKeyboardOpened();
    await router.handleKeyAction({ type: 'toggle-im' });
    expect(fcitx.reconnect).toHaveBeenCalledTimes(2);

    // Once reconnected while keyboard is open, acquires focus and clears offline state
    fcitx.isConnected = true;
    router.onFcitxConnectionChanged(true);
    expect(fcitx.acquireFocus).toHaveBeenCalledWith(true);
    expect(callbacks.onIMModeChanged).toHaveBeenLastCalledWith(true, '中');
  });

  it('acquires focus cleanly on toggle-im and window focus change', async () => {
    const { fcitx, router } = createMocks(true);
    router.onKeyboardOpened();
    expect(fcitx.acquireFocus).toHaveBeenLastCalledWith(true);

    await router.handleKeyAction({ type: 'toggle-im' });
    expect(router.imeActive).toBe(false);
    expect(fcitx.acquireFocus).toHaveBeenLastCalledWith(false);

    router.onFocusWindowChanged();
    expect(fcitx.acquireFocus).toHaveBeenLastCalledWith(false);
  });

  it('expands candidate drawer, prefetches pages, and selects with page offset', () => {
    const { fcitx, callbacks, router } = createMocks(true);

    // Page 0 arrives
    router.onFcitxUIUpdate(
      parseClientSideUI(
        [['ni', 0]],
        2,
        [],
        [],
        [
          ['1 ', '你'],
          ['2 ', '拟'],
        ],
        0,
        0,
        false,
        true,
      ),
    );

    // Toggle drawer open -> triggers nextPage prefetch
    router.toggleCandidateDrawer();
    expect(fcitx.nextPage).toHaveBeenCalledTimes(1);

    // Page 1 arrives (last page: hasNext = false)
    router.onFcitxUIUpdate(
      parseClientSideUI(
        [['ni', 0]],
        2,
        [],
        [],
        [
          ['1 ', '尼'],
          ['2 ', '妮'],
        ],
        0,
        0,
        true,
        false,
      ),
    );

    const lastDrawerCall =
      (callbacks.onDrawerStateChanged as ReturnType<typeof mock>).mock.calls.at(-1)?.[0];
    expect(lastDrawerCall.open).toBe(true);
    expect(lastDrawerCall.items.map((x: any) => x.text)).toEqual(['你', '拟', '尼', '妮']);
    expect(lastDrawerCall.hasMore).toBe(false);

    // Select '拟' (page 0, index 1) while Fcitx5 is currently on page 1 -> pageDelta = -1
    router.selectDrawerCandidate(0, 1);
    expect(fcitx.selectCandidateAtPageOffset).toHaveBeenCalledWith(-1, 1);
  });
});
