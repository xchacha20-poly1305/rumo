export type LayoutId =
  | 'qwerty-lower'
  | 'qwerty-upper'
  | 'symbol-picker'
  | 'numpad';

export type ShiftState = 'off' | 'once' | 'locked';

export type KeyStyleVariant =
  | 'normal'
  | 'special'
  | 'accent'
  | 'space'
  | 'alt-fg'
  | 'numpad-digit';

export type KeyAction =
  | { type: 'char'; value: string; ignoreShift?: boolean }
  | { type: 'commit-direct'; value: string; recordRecent?: boolean }
  | { type: 'keyval'; keyval: number }
  | { type: 'shift' }
  | { type: 'backspace' }
  | { type: 'enter' }
  | { type: 'space' }
  | { type: 'toggle-im' }
  | { type: 'switch-layout'; target: LayoutId; remember?: boolean }
  | { type: 'open-symbol-or-number' }
  | { type: 'hide' };

export interface KeySpec {
  id: string;
  label: string;
  icon?: string;
  secondaryLabel?: string;
  secondaryAction?: KeyAction;
  repeatable?: boolean;
  width?: number;
  style?: KeyStyleVariant;
  action: KeyAction;
}

export interface LayoutDef {
  id: Exclude<LayoutId, 'symbol-picker'>;
  rows: KeySpec[][];
}

export type SymbolCategoryId =
  | 'recent'
  | 'chinese'
  | 'common'
  | 'bracket'
  | 'arrow'
  | 'math'
  | 'ordinal'
  | 'other'
  | 'fullwidth';

export interface SymbolCategoryDef {
  id: SymbolCategoryId;
  label: string;
  icon?: string;
  items: readonly string[];
  isRecent?: boolean;
}

export interface SymbolCategoryTab {
  id: SymbolCategoryId;
  label: string;
  icon?: string;
  active: boolean;
}

export interface SymbolPickerState {
  categories: readonly SymbolCategoryTab[];
  activeCategoryIndex: number;
  activeCategoryId: SymbolCategoryId;
  pageInCategory: number;
  categoryPageCount: number;
  globalPageIndex: number;
  totalPages: number;
  items: readonly string[];
  hasPrevPage: boolean;
  hasNextPage: boolean;
  isRecentEmpty: boolean;
}

export interface PreeditSegment {
  text: string;
  format: number;
}

export interface CandidateItem {
  label: string;
  text: string;
}

export interface DrawerCandidateItem {
  pageIndex: number;
  indexInPage: number;
  text: string;
  isPrimary: boolean;
}

export interface CandidateDrawerState {
  open: boolean;
  items: DrawerCandidateItem[];
  hasMore: boolean;
  loading: boolean;
}

export interface ClientSideUIState {
  preedit: PreeditSegment[];
  preeditText: string;
  cursorPos: number;
  auxUp: PreeditSegment[];
  auxDown: PreeditSegment[];
  candidates: CandidateItem[];
  candidateIndex: number;
  layoutHint: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface IMInfo {
  name: string;
  uniqueName: string;
  langCode: string;
}

export type InputPurposeKind =
  | 'normal'
  | 'password'
  | 'pin'
  | 'number'
  | 'digits'
  | 'terminal';

export interface IFcitxBackend {
  readonly isConnected: boolean;
  reconnect(): void;
  acquireFocus(activateRumoIM: boolean): void;
  focusIn(): void;
  focusOut(): void;
  reset(): Promise<void> | void;
  processKeyEvent(
    keyval: number,
    keycode: number,
    state: number,
    isRelease: boolean,
  ): Promise<boolean>;
  selectCandidate(index: number): Promise<void> | void;
  selectCandidateAtPageOffset(pageDelta: number, index: number): void;
  nextPage(): void;
  prevPage(): void;
  activateIM(): void;
  deactivateIM(): void;
}

export interface CommitTextOptions {
  avoidKeyvalForAscii?: boolean;
}

export interface ITextInjector {
  commitText(text: string, options?: CommitTextOptions): void;
  sendKeyval(keyval: number, modifiers?: number[]): void;
}
