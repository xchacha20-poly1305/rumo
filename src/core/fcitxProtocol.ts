import type { CandidateItem, ClientSideUIState, PreeditSegment } from './types.js';

/**
 * Fcitx5 CapabilityFlag bitmask values verified from
 * /usr/include/Fcitx5/Utils/fcitx-utils/capabilityflags.h (Fcitx5 5.1.23)
 */
export const CapabilityFlag = {
  NoFlag: 0n,
  Preedit: 1n << 1n,
  Password: 1n << 3n,
  FormattedPreedit: 1n << 4n,
  GetIMInfoOnFocus: 1n << 23n,
  KeyEventOrderFix: 1n << 37n,
  ClientSideInputPanel: 1n << 39n,
  Disable: 1n << 40n,
} as const;

// Deliberately omit Preedit & FormattedPreedit so Fcitx5 delivers preedit
// together with candidates inside UpdateClientSideUI.
export const RUMO_CAPABILITIES: bigint =
  CapabilityFlag.GetIMInfoOnFocus |
  CapabilityFlag.KeyEventOrderFix |
  CapabilityFlag.ClientSideInputPanel;

/** Common X11 KeySyms used by both Fcitx5 and Clutter.VirtualInputDevice */
export const Keyval = {
  BackSpace: 0xff08,
  Tab: 0xff09,
  Return: 0xff0d,
  Escape: 0xff1b,
  Space: 0x0020,
  Left: 0xff51,
  Up: 0xff52,
  Right: 0xff53,
  Down: 0xff54,
  Delete: 0xffff,
  Shift_L: 0xffe1,
  Control_L: 0xffe3,
  Alt_L: 0xffe9,
} as const;

export const KeyState = {
  None: 0,
  Shift: 1 << 0,
  Ctrl: 1 << 2,
  Alt: 1 << 3,
} as const;

export function emptyClientSideUI(): ClientSideUIState {
  return {
    preedit: [],
    preeditText: '',
    cursorPos: -1,
    auxUp: [],
    auxDown: [],
    candidates: [],
    candidateIndex: -1,
    layoutHint: 0,
    hasPrev: false,
    hasNext: false,
  };
}

/**
 * Converts a single printable ASCII character to its X11 keysym.
 * For non-ASCII characters, returns Unicode keysym (0x01000000 | codePoint).
 */
export function charToKeyval(ch: string): number {
  const cp = ch.codePointAt(0);
  if (cp === undefined) {
    return 0;
  }
  if (cp >= 0x20 && cp <= 0x7e) {
    return cp;
  }
  return 0x01000000 | cp;
}

/**
 * Checks whether a string consists strictly of printable ASCII characters.
 */
export function isPrintableAscii(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }
  return true;
}

/**
 * Parses the unpacked tuple from Fcitx5 InputContext1 `UpdateClientSideUI` signal:
 * (a(si) preedit, i cursorpos, a(si) auxUp, a(si) auxDown, a(ss) candidates,
 *  i candidateIndex, i layoutHint, b hasPrev, b hasNext)
 */
export function parseClientSideUI(
  rawPreedit: ReadonlyArray<readonly [string, number]>,
  cursorPos: number,
  rawAuxUp: ReadonlyArray<readonly [string, number]>,
  rawAuxDown: ReadonlyArray<readonly [string, number]>,
  rawCandidates: ReadonlyArray<readonly [string, string]>,
  candidateIndex: number,
  layoutHint: number,
  hasPrev: boolean,
  hasNext: boolean,
): ClientSideUIState {
  const preedit: PreeditSegment[] = rawPreedit.map(([text, format]) => ({
    text,
    format,
  }));
  const auxUp: PreeditSegment[] = rawAuxUp.map(([text, format]) => ({
    text,
    format,
  }));
  const auxDown: PreeditSegment[] = rawAuxDown.map(([text, format]) => ({
    text,
    format,
  }));
  const candidates: CandidateItem[] = rawCandidates.map(([label, text]) => ({
    label,
    text,
  }));

  let preeditText = '';
  for (const seg of preedit) {
    preeditText += seg.text;
  }

  return {
    preedit,
    preeditText,
    cursorPos,
    auxUp,
    auxDown,
    candidates,
    candidateIndex,
    layoutHint,
    hasPrev,
    hasNext,
  };
}

/**
 * Determines whether a Fcitx5 IM uniqueName represents a plain Latin keyboard layout
 * (e.g. "keyboard-us") vs an active IME engine (e.g. "pinyin", "rime", "wubi").
 */
export function isPlainKeyboardIM(uniqueName: string): boolean {
  return uniqueName.length === 0 || uniqueName.startsWith('keyboard-');
}
