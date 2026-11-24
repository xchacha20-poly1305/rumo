import {
  KeyState,
  Keyval,
  charToKeyval,
  emptyClientSideUI,
  isPlainKeyboardIM,
} from './fcitxProtocol.js';
import { SymbolPickerController } from './symbolPickerState.js';
import type {
  CandidateDrawerState,
  CandidateItem,
  ClientSideUIState,
  CommitTextOptions,
  DrawerCandidateItem,
  IFcitxBackend,
  IMInfo,
  ITextInjector,
  InputPurposeKind,
  KeyAction,
  LayoutId,
  ShiftState,
  SymbolPickerState,
} from './types.js';

const INITIAL_DRAWER_PAGES = 6;
const LOAD_MORE_DRAWER_PAGES = 4;

export interface RouterViewCallbacks {
  onLayoutChanged(layout: LayoutId, shiftState: ShiftState): void;
  onUIStateChanged(ui: ClientSideUIState): void;
  onDrawerStateChanged(state: CandidateDrawerState): void;
  onSymbolPickerStateChanged(state: SymbolPickerState): void;
  onRecentSymbolsChanged?(symbols: string[]): void;
  onIMModeChanged(imeActive: boolean, label: string): void;
  onHideRequested(): void;
}

export class InputRouter {
  private _layout: LayoutId = 'qwerty-lower';
  private _lastSymbolLayout: 'symbol-picker' | 'numpad' = 'symbol-picker';
  private _shiftState: ShiftState = 'off';
  private _purpose: InputPurposeKind = 'normal';
  private _imeActive = true;
  private _imLabel = '中';
  private _keyboardOpen = false;
  private _uiState: ClientSideUIState = emptyClientSideUI();
  private readonly _symbolPicker: SymbolPickerController;

  // Multi-page candidate drawer state
  private _pageMap: Map<number, CandidateItem[]> = new Map();
  private _currentPageIdx = 0;
  private _pendingPageDelta = 0;
  private _lastPreeditText = '';
  private _drawerOpen = false;
  private _drawerFetching = false;
  private _drawerTargetPages = 0;

  constructor(
    private readonly _fcitx: IFcitxBackend,
    private readonly _injector: ITextInjector,
    private readonly _callbacks: RouterViewCallbacks,
    initialRecentSymbols?: readonly string[],
  ) {
    this._symbolPicker = new SymbolPickerController(initialRecentSymbols);
  }

  get layout(): LayoutId {
    return this._layout;
  }

  get lastSymbolLayout(): 'symbol-picker' | 'numpad' {
    return this._lastSymbolLayout;
  }

  get shiftState(): ShiftState {
    return this._shiftState;
  }

  get imeActive(): boolean {
    return this._imeActive;
  }

  get purpose(): InputPurposeKind {
    return this._purpose;
  }

  get uiState(): ClientSideUIState {
    return this._uiState;
  }

  get hasActivePreedit(): boolean {
    return (
      this._uiState.preeditText.length > 0 ||
      this._uiState.candidates.length > 0
    );
  }

  private get _shouldUseFcitx(): boolean {
    if (!this._fcitx.isConnected) return false;
    if (this._purpose === 'password' || this._purpose === 'pin') return false;
    if (!this._imeActive) return false;
    return true;
  }

  private get _isNumericPurpose(): boolean {
    return (
      this._purpose === 'number' ||
      this._purpose === 'digits' ||
      this._purpose === 'pin'
    );
  }

  setPurpose(purpose: InputPurposeKind): void {
    if (this._purpose === purpose) return;
    this._purpose = purpose;

    if (purpose === 'password') {
      void this._fcitx.reset();
      this._fcitx.focusOut();
      this._clearUI();
      this.setLayout('qwerty-lower', false);
      return;
    }

    if (purpose === 'pin') {
      void this._fcitx.reset();
      this._fcitx.focusOut();
      this._clearUI();
      this.setLayout('numpad', false);
      return;
    }

    if (purpose === 'number' || purpose === 'digits') {
      void this._fcitx.reset();
      this._clearUI();
      this.setLayout('numpad', false);
      return;
    }

    if (this._layout === 'numpad') {
      this.setLayout('qwerty-lower', false);
    }
    this._fcitx.focusIn();
  }

  onKeyboardOpened(): void {
    this._keyboardOpen = true;
    if (!this._fcitx.isConnected) {
      this._fcitx.reconnect();
      return;
    }
    if (this._purpose !== 'password' && this._purpose !== 'pin') {
      this._fcitx.acquireFocus(this._imeActive);
    } else {
      this._fcitx.deactivateIM();
    }
  }

  onKeyboardClosed(): void {
    this._keyboardOpen = false;
    void this._fcitx.reset();
    this._fcitx.focusOut();
    this._clearUI();
    if (
      this._layout === 'symbol-picker' ||
      (this._layout === 'numpad' && !this._isNumericPurpose)
    ) {
      this.setLayout('qwerty-lower', false);
    }
  }

  onFocusWindowChanged(): void {
    if (!this._keyboardOpen || !this._fcitx.isConnected) return;
    if (this._purpose !== 'password' && this._purpose !== 'pin') {
      this._fcitx.acquireFocus(this._imeActive);
    } else {
      this._fcitx.deactivateIM();
    }
  }

  onFcitxUIUpdate(ui: ClientSideUIState): void {
    this._uiState = ui;

    const isPageTurn =
      this._pendingPageDelta !== 0 &&
      ui.candidates.length > 0 &&
      ui.preeditText === this._lastPreeditText;

    if (isPageTurn) {
      this._currentPageIdx = Math.max(0, this._currentPageIdx + this._pendingPageDelta);
      this._pendingPageDelta = 0;
      this._pageMap.set(this._currentPageIdx, ui.candidates);
    } else {
      this._pageMap.clear();
      this._currentPageIdx = 0;
      this._pendingPageDelta = 0;
      this._drawerFetching = false;
      this._drawerTargetPages = 0;
      this._lastPreeditText = ui.preeditText;
      if (ui.candidates.length > 0) {
        this._pageMap.set(0, ui.candidates);
      } else if (this._drawerOpen) {
        this._drawerOpen = false;
        this._emitDrawerState();
      }
    }

    this._callbacks.onUIStateChanged(ui);

    if (this._drawerOpen) {
      if (
        this._drawerFetching &&
        ui.hasNext &&
        this._pageMap.size < this._drawerTargetPages
      ) {
        this._pendingPageDelta = 1;
        this._fcitx.nextPage();
      } else {
        this._drawerFetching = false;
      }
      this._emitDrawerState();
    }
  }

  onFcitxCommit(text: string): void {
    if (text.length > 0) {
      this._injector.commitText(text, this._directCommitOptions());
    }
  }

  onFcitxForwardKey(keyval: number, _state: number, isRelease: boolean): void {
    if (!isRelease) {
      this._injector.sendKeyval(keyval);
    }
  }

  onFcitxIMChanged(info: IMInfo): void {
    const plain = isPlainKeyboardIM(info.uniqueName);
    this._imeActive = !plain;
    this._imLabel = plain ? 'EN' : info.name || '中';
    this._callbacks.onIMModeChanged(this._imeActive, this._imLabel);
  }

  onFcitxConnectionChanged(connected: boolean): void {
    if (!connected) {
      this._clearUI();
      this._callbacks.onIMModeChanged(false, 'EN (离线)');
    } else {
      this._callbacks.onIMModeChanged(this._imeActive, this._imLabel);
      if (this._keyboardOpen) {
        if (this._purpose !== 'password' && this._purpose !== 'pin') {
          this._fcitx.acquireFocus(this._imeActive);
        } else {
          this._fcitx.deactivateIM();
        }
      }
    }
  }

  setLayout(target: LayoutId, remember = false): void {
    this._closeDrawerIfOpen();
    this._layout = target;
    if (target === 'qwerty-lower') {
      this._shiftState = 'off';
    } else if (target === 'qwerty-upper' && this._shiftState === 'off') {
      this._shiftState = 'once';
    }
    if (remember && (target === 'symbol-picker' || target === 'numpad')) {
      this._lastSymbolLayout = target;
    }
    this._callbacks.onLayoutChanged(this._layout, this._shiftState);
    if (target === 'symbol-picker') {
      this._callbacks.onSymbolPickerStateChanged(
        this._symbolPicker.openDefault(this._imeActive),
      );
    }
  }

  selectSymbolCategory(categoryIndex: number): void {
    const state = this._symbolPicker.selectCategory(categoryIndex);
    this._callbacks.onSymbolPickerStateChanged(state);
  }

  nextSymbolPage(): void {
    const state = this._symbolPicker.nextPage();
    if (state) {
      this._callbacks.onSymbolPickerStateChanged(state);
    }
  }

  prevSymbolPage(): void {
    const state = this._symbolPicker.prevPage();
    if (state) {
      this._callbacks.onSymbolPickerStateChanged(state);
    }
  }

  selectCandidate(index: number): void {
    if (this._fcitx.isConnected) {
      this._closeDrawerIfOpen();
      void this._fcitx.selectCandidate(index);
    }
  }

  selectDrawerCandidate(pageIndex: number, indexInPage: number): void {
    if (!this._fcitx.isConnected) return;
    const pageDelta = pageIndex - this._currentPageIdx;
    this._drawerFetching = false;
    this._pendingPageDelta = 0;
    this._closeDrawerIfOpen();
    this._fcitx.selectCandidateAtPageOffset(pageDelta, indexInPage);
  }

  toggleCandidateDrawer(): void {
    if (this._drawerOpen) {
      this.closeCandidateDrawer();
      return;
    }
    if (this._uiState.candidates.length === 0) return;

    this._drawerOpen = true;
    this._drawerTargetPages = Math.max(this._pageMap.size, INITIAL_DRAWER_PAGES);

    if (
      this._fcitx.isConnected &&
      this._uiState.hasNext &&
      this._pageMap.size < this._drawerTargetPages
    ) {
      this._drawerFetching = true;
      this._pendingPageDelta = 1;
      this._fcitx.nextPage();
    } else {
      this._drawerFetching = false;
    }
    this._emitDrawerState();
  }

  loadMoreCandidates(): void {
    if (!this._drawerOpen || !this._fcitx.isConnected || !this._uiState.hasNext) {
      return;
    }
    if (this._drawerFetching) return;

    this._drawerTargetPages = this._pageMap.size + LOAD_MORE_DRAWER_PAGES;
    this._drawerFetching = true;
    this._pendingPageDelta = 1;
    this._fcitx.nextPage();
    this._emitDrawerState();
  }

  closeCandidateDrawer(): void {
    this._drawerFetching = false;
    this._closeDrawerIfOpen();
  }

  nextCandidatePage(): void {
    if (this._fcitx.isConnected && this._uiState.hasNext) {
      this._pendingPageDelta = 1;
      this._fcitx.nextPage();
    }
  }

  prevCandidatePage(): void {
    if (this._fcitx.isConnected && this._uiState.hasPrev) {
      this._pendingPageDelta = -1;
      this._fcitx.prevPage();
    }
  }

  async handleKeyAction(action: KeyAction): Promise<void> {
    switch (action.type) {
      case 'hide':
        this._callbacks.onHideRequested();
        return;

      case 'open-symbol-or-number':
        this.setLayout(this._lastSymbolLayout, false);
        return;

      case 'switch-layout':
        this.setLayout(action.target, action.remember ?? false);
        return;

      case 'shift':
        this._cycleShift();
        return;

      case 'toggle-im':
        this._toggleIM();
        return;

      case 'backspace':
        await this._sendFunctionalKey(Keyval.BackSpace);
        return;

      case 'enter':
        await this._sendFunctionalKey(Keyval.Return);
        return;

      case 'space':
        await this._sendSpace();
        return;

      case 'keyval':
        this._injector.sendKeyval(action.keyval);
        return;

      case 'commit-direct':
        await this._commitDirect(action.value, action.recordRecent ?? false);
        return;

      case 'char':
        await this._sendChar(action.value, action.ignoreShift ?? false);
        return;
    }
  }

  private _directCommitOptions(): CommitTextOptions | undefined {
    if (
      this._imeActive &&
      this._purpose !== 'password' &&
      this._purpose !== 'pin'
    ) {
      return { avoidKeyvalForAscii: true };
    }
    return undefined;
  }

  private _cycleShift(): void {
    if (this._shiftState === 'off') {
      this._shiftState = 'once';
      this._layout = 'qwerty-upper';
    } else if (this._shiftState === 'once') {
      this._shiftState = 'locked';
      this._layout = 'qwerty-upper';
    } else {
      this._shiftState = 'off';
      this._layout = 'qwerty-lower';
    }
    this._callbacks.onLayoutChanged(this._layout, this._shiftState);
  }

  private _consumeOneShotShift(): void {
    if (this._shiftState === 'once') {
      this._shiftState = 'off';
      this._layout = 'qwerty-lower';
      this._callbacks.onLayoutChanged(this._layout, this._shiftState);
    }
  }

  private _toggleIM(): void {
    if (!this._fcitx.isConnected) {
      this._fcitx.reconnect();
      return;
    }
    if (this._imeActive) {
      void this._fcitx.reset();
      this._clearUI();
      this._imeActive = false;
      this._imLabel = 'EN';
      this._fcitx.acquireFocus(false);
    } else {
      this._imeActive = true;
      this._imLabel = '中';
      this._fcitx.acquireFocus(true);
    }
    this._callbacks.onIMModeChanged(this._imeActive, this._imLabel);
  }

  private async _sendFunctionalKey(keyval: number): Promise<void> {
    if (this._shouldUseFcitx && this.hasActivePreedit) {
      const handled = await this._fcitx.processKeyEvent(keyval, 0, KeyState.None, false);
      if (handled) return;
    }
    this._injector.sendKeyval(keyval);
  }

  private async _sendSpace(): Promise<void> {
    if (this._shouldUseFcitx && this.hasActivePreedit) {
      const handled = await this._fcitx.processKeyEvent(Keyval.Space, 0, KeyState.None, false);
      if (handled) return;
    }
    this._injector.commitText(' ');
  }

  private async _sendChar(value: string, ignoreShift = false): Promise<void> {
    const isUpper = !ignoreShift && this._shiftState !== 'off';
    if (this._shouldUseFcitx && this._layout !== 'numpad') {
      const keyval = charToKeyval(value);
      const state = isUpper ? KeyState.Shift : KeyState.None;
      const handled = await this._fcitx.processKeyEvent(keyval, 0, state, false);
      this._consumeOneShotShift();
      if (handled) return;
    } else {
      this._consumeOneShotShift();
    }
    this._injector.commitText(value);
  }

  private async _commitDirect(value: string, recordRecent: boolean): Promise<void> {
    if (this._shouldUseFcitx && this.hasActivePreedit) {
      if (this._uiState.candidates.length > 0) {
        await this._fcitx.selectCandidate(0);
        await this._fcitx.reset();
      } else if (this._uiState.preeditText.length > 0) {
        this._injector.commitText(
          this._uiState.preeditText,
          this._directCommitOptions(),
        );
        await this._fcitx.reset();
      } else {
        await this._fcitx.reset();
      }
      this._clearUI();
    }
    this._consumeOneShotShift();
    this._injector.commitText(value, this._directCommitOptions());
    if (recordRecent) {
      const { changed, recentSymbols } = this._symbolPicker.recordUsed(value);
      if (changed) {
        this._callbacks.onRecentSymbolsChanged?.(recentSymbols);
      }
    }
  }

  private _closeDrawerIfOpen(): void {
    if (!this._drawerOpen) return;
    this._drawerOpen = false;
    this._drawerFetching = false;
    this._emitDrawerState();
  }

  private _emitDrawerState(): void {
    const items: DrawerCandidateItem[] = [];
    if (this._drawerOpen) {
      const sortedPages = Array.from(this._pageMap.keys()).sort((a, b) => a - b);
      for (const pageIndex of sortedPages) {
        const list = this._pageMap.get(pageIndex) ?? [];
        list.forEach((cand, indexInPage) => {
          items.push({
            pageIndex,
            indexInPage,
            text: cand.text,
            isPrimary: pageIndex === 0 && indexInPage === 0,
          });
        });
      }
    }
    this._callbacks.onDrawerStateChanged({
      open: this._drawerOpen,
      items,
      hasMore: this._uiState.hasNext,
      loading: this._drawerFetching,
    });
  }

  private _clearUI(): void {
    this._uiState = emptyClientSideUI();
    this._pageMap.clear();
    this._currentPageIdx = 0;
    this._pendingPageDelta = 0;
    this._lastPreeditText = '';
    this._drawerFetching = false;
    this._drawerTargetPages = 0;
    if (this._drawerOpen) {
      this._drawerOpen = false;
      this._emitDrawerState();
    }
    this._callbacks.onUIStateChanged(this._uiState);
  }
}
