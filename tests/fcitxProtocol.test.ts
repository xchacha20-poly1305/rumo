import { describe, expect, it } from 'bun:test';
import {
  CapabilityFlag,
  RUMO_CAPABILITIES,
  charToKeyval,
  isPlainKeyboardIM,
  isPrintableAscii,
  parseClientSideUI,
} from '../src/core/fcitxProtocol.js';

describe('fcitxProtocol', () => {
  it('sets ClientSideInputPanel (1 << 39) in RUMO_CAPABILITIES', () => {
    expect(CapabilityFlag.ClientSideInputPanel).toBe(1n << 39n);
    expect((RUMO_CAPABILITIES & CapabilityFlag.ClientSideInputPanel) !== 0n).toBe(true);
    expect((RUMO_CAPABILITIES & CapabilityFlag.Preedit) === 0n).toBe(true);
    expect((RUMO_CAPABILITIES & CapabilityFlag.FormattedPreedit) === 0n).toBe(true);
    expect(Number(RUMO_CAPABILITIES)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('parses UpdateClientSideUI payload accurately', () => {
    const ui = parseClientSideUI(
      [
        ['ni', 0],
        ["'", 0],
        ['hao', 0],
      ],
      6,
      [['aux', 0]],
      [],
      [
        ['1. ', '你好'],
        ['2. ', '拟好'],
      ],
      0,
      1,
      false,
      true,
    );

    expect(ui.preeditText).toBe("ni'hao");
    expect(ui.cursorPos).toBe(6);
    expect(ui.candidates).toEqual([
      { label: '1. ', text: '你好' },
      { label: '2. ', text: '拟好' },
    ]);
    expect(ui.hasPrev).toBe(false);
    expect(ui.hasNext).toBe(true);
  });

  it('converts ASCII and Unicode characters to X11 keysyms', () => {
    expect(charToKeyval('a')).toBe(0x61);
    expect(charToKeyval(' ')).toBe(0x20);
    expect(charToKeyval('中')).toBe(0x01004e2d);
  });

  it('detects printable ASCII strings and plain keyboard IM names', () => {
    expect(isPrintableAscii('hello 123!')).toBe(true);
    expect(isPrintableAscii('你好')).toBe(false);
    expect(isPrintableAscii('')).toBe(false);

    expect(isPlainKeyboardIM('keyboard-us')).toBe(true);
    expect(isPlainKeyboardIM('pinyin')).toBe(false);
    expect(isPlainKeyboardIM('rime')).toBe(false);
  });
});
