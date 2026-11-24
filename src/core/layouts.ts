import type { KeySpec, LayoutDef, LayoutId } from './types.js';

function charKey(ch: string, secondaryLabel?: string, width = 1): KeySpec {
  return {
    id: `char-${ch}`,
    label: ch,
    secondaryLabel,
    secondaryAction: secondaryLabel
      ? { type: 'char', value: secondaryLabel, ignoreShift: true }
      : undefined,
    width,
    style: 'normal',
    action: { type: 'char', value: ch },
  };
}

function directKey(
  ch: string,
  width = 1,
  style: KeySpec['style'] = 'normal',
  idSuffix = ch,
): KeySpec {
  return {
    id: `direct-${idSuffix}`,
    label: ch,
    width,
    style,
    action: { type: 'commit-direct', value: ch, recordRecent: false },
  };
}

function makeQwertyLayout(id: 'qwerty-lower' | 'qwerty-upper', upper: boolean): LayoutDef {
  const t = (s: string) => (upper ? s.toUpperCase() : s);
  const topRow = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
  const topSecs = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const midRow = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const midSecs = ['@', '*', '+', '-', '=', '/', '#', '(', ')'];
  const botRow = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
  const botSecs = ["'", ':', '"', '?', '!', '~', '\\'];

  return {
    id,
    rows: [
      topRow.map((ch, idx) => charKey(t(ch), topSecs[idx])),
      midRow.map((ch, idx) => charKey(t(ch), midSecs[idx])),
      [
        {
          id: 'shift',
          label: upper ? '⬆' : '⇧',
          width: 1.5,
          style: 'special',
          action: { type: 'shift' },
        },
        ...botRow.map((ch, idx) => charKey(t(ch), botSecs[idx])),
        {
          id: 'backspace',
          label: '⌫',
          icon: 'backspace-symbolic',
          repeatable: true,
          width: 1.5,
          style: 'special',
          action: { type: 'backspace' },
        },
      ],
      [
        {
          id: 'to-symbols',
          label: '?123',
          width: 1.5,
          style: 'special',
          action: { type: 'open-symbol-or-number' },
        },
        {
          id: 'toggle-im',
          label: '中/英',
          width: 1.3,
          style: 'special',
          action: { type: 'toggle-im' },
        },
        charKey(',', undefined, 1),
        {
          id: 'space',
          label: 'Space',
          width: 3.6,
          style: 'space',
          action: { type: 'space' },
        },
        charKey('.', undefined, 1),
        {
          id: 'enter',
          label: '↵',
          icon: 'keyboard-return-symbolic',
          width: 1.6,
          style: 'accent',
          action: { type: 'enter' },
        },
      ],
    ],
  };
}

const numpadLayout: LayoutDef = {
  id: 'numpad',
  rows: [
    [
      directKey('+', 1.5, 'special'),
      directKey('1', 2.333, 'numpad-digit'),
      directKey('2', 2.333, 'numpad-digit'),
      directKey('3', 2.333, 'numpad-digit'),
      directKey('/', 1.5, 'special'),
    ],
    [
      directKey('-', 1.5, 'special'),
      directKey('4', 2.333, 'numpad-digit'),
      directKey('5', 2.333, 'numpad-digit'),
      directKey('6', 2.333, 'numpad-digit'),
      {
        id: 'space',
        label: 'Space',
        icon: 'space-bar-symbolic',
        width: 1.5,
        style: 'special',
        action: { type: 'space' },
      },
    ],
    [
      directKey('*', 1.5, 'special'),
      directKey('7', 2.333, 'numpad-digit'),
      directKey('8', 2.333, 'numpad-digit'),
      directKey('9', 2.333, 'numpad-digit'),
      {
        id: 'backspace',
        label: '⌫',
        icon: 'backspace-symbolic',
        repeatable: true,
        width: 1.5,
        style: 'special',
        action: { type: 'backspace' },
      },
    ],
    [
      {
        id: 'to-abc',
        label: 'ABC',
        width: 1.5,
        style: 'special',
        action: { type: 'switch-layout', target: 'qwerty-lower' },
      },
      directKey(',', 1.0, 'special'),
      {
        id: 'to-symbols',
        label: '!?#',
        width: 1.333,
        style: 'alt-fg',
        action: { type: 'switch-layout', target: 'symbol-picker', remember: true },
      },
      directKey('0', 2.334, 'numpad-digit'),
      directKey('=', 1.333, 'alt-fg'),
      directKey('.', 1.0, 'special'),
      {
        id: 'enter',
        label: '↵',
        icon: 'keyboard-return-symbolic',
        width: 1.5,
        style: 'accent',
        action: { type: 'enter' },
      },
    ],
  ],
};

export function makeSymbolPickerBottomRow(imeActive: boolean): KeySpec[] {
  const comma = imeActive ? '，' : ',';
  const period = imeActive ? '。' : '.';
  return [
    {
      id: 'to-abc',
      label: 'ABC',
      width: 1.5,
      style: 'special',
      action: { type: 'switch-layout', target: 'qwerty-lower' },
    },
    directKey(comma, 1.0, 'special', 'symbol-comma'),
    {
      id: 'to-numpad',
      label: '123',
      icon: 'dialpad-symbolic',
      width: 1.0,
      style: 'alt-fg',
      action: { type: 'switch-layout', target: 'numpad', remember: true },
    },
    {
      id: 'space',
      label: 'Space',
      width: 4.0,
      style: 'space',
      action: { type: 'space' },
    },
    directKey(period, 1.0, 'special', 'symbol-period'),
    {
      id: 'enter',
      label: '↵',
      icon: 'keyboard-return-symbolic',
      width: 1.5,
      style: 'accent',
      action: { type: 'enter' },
    },
  ];
}

export const GRID_LAYOUTS: Record<Exclude<LayoutId, 'symbol-picker'>, LayoutDef> = {
  'qwerty-lower': makeQwertyLayout('qwerty-lower', false),
  'qwerty-upper': makeQwertyLayout('qwerty-upper', true),
  numpad: numpadLayout,
};

export const LAYOUTS = GRID_LAYOUTS;

export function getLayout(id: Exclude<LayoutId, 'symbol-picker'>): LayoutDef {
  return GRID_LAYOUTS[id];
}
