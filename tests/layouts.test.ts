import { describe, expect, it } from 'bun:test';
import {
  LAYOUTS,
  getLayout,
  makeSymbolPickerBottomRow,
} from '../src/core/layouts.js';
import type { KeySpec, LayoutId } from '../src/core/types.js';

function sumWeights(row: readonly KeySpec[]): number {
  let total = 0;
  for (const key of row) {
    total += key.width ?? 1;
  }
  return total;
}

describe('layouts', () => {
  const gridIds: Exclude<LayoutId, 'symbol-picker'>[] = [
    'qwerty-lower',
    'qwerty-upper',
    'numpad',
  ];

  it('defines qwerty and numpad layouts with 4 rows each', () => {
    for (const id of gridIds) {
      const def = getLayout(id);
      expect(def.id).toBe(id);
      expect(def.rows.length).toBe(4);
    }
  });

  it('has valid switch-layout targets in every grid layout', () => {
    for (const id of gridIds) {
      const def = LAYOUTS[id];
      for (const row of def.rows) {
        for (const key of row) {
          if (key.action.type === 'switch-layout' && key.action.target !== 'symbol-picker') {
            expect(LAYOUTS[key.action.target]).toBeDefined();
          }
        }
      }
    }
  });

  it('equips all 26 qwerty letters with secondary labels and ignoreShift actions', () => {
    const expectedPairs: Record<string, string> = {
      q: '1', w: '2', e: '3', r: '4', t: '5', y: '6', u: '7', i: '8', o: '9', p: '0',
      a: '@', s: '*', d: '+', f: '-', g: '=', h: '/', j: '#', k: '(', l: ')',
      z: "'", x: ':', c: '"', v: '?', b: '!', n: '~', m: '\\',
    };

    for (const id of ['qwerty-lower', 'qwerty-upper'] as const) {
      const def = getLayout(id);
      const letterKeys = def.rows
        .slice(0, 3)
        .flat()
        .filter((k) => k.id.startsWith('char-'));
      expect(letterKeys.length).toBe(26);

      for (const key of letterKeys) {
        const lower = key.label.toLowerCase();
        const sec = expectedPairs[lower];
        expect(sec).toBeDefined();
        expect(key.secondaryLabel).toBe(sec);
        expect(key.secondaryAction).toEqual({
          type: 'char',
          value: sec,
          ignoreShift: true,
        });
      }

      const bs = def.rows[2].find((k) => k.id === 'backspace');
      expect(bs?.icon).toBe('backspace-symbolic');
      expect(bs?.repeatable).toBe(true);

      const toSym = def.rows[3].find((k) => k.id === 'to-symbols');
      expect(toSym?.action).toEqual({ type: 'open-symbol-or-number' });
    }
  });

  it('defines 5-col x 4-row numpad with aligned 0 and total weight 10 per row', () => {
    const numpad = getLayout('numpad');
    for (const row of numpad.rows) {
      expect(sumWeights(row)).toBeCloseTo(10, 2);
    }

    const row4 = numpad.rows[3];
    const zeroIdx = row4.findIndex((k) => k.label === '0');
    expect(zeroIdx).toBeGreaterThan(0);

    let leftOfZero = 0;
    for (let i = 0; i < zeroIdx; i++) {
      leftOfZero += row4[i].width ?? 1;
    }
    // Directly aligned under middle digit column (1.5 + 2.333 = 3.833)
    expect(leftOfZero).toBeCloseTo(3.833, 3);

    const toSym = row4.find((k) => k.id === 'to-symbols');
    expect(toSym?.style).toBe('alt-fg');
    expect(toSym?.action).toEqual({
      type: 'switch-layout',
      target: 'symbol-picker',
      remember: true,
    });
  });

  it('builds symbol picker bottom row with dynamic CN/EN punctuation and weight 10', () => {
    const cnRow = makeSymbolPickerBottomRow(true);
    const enRow = makeSymbolPickerBottomRow(false);
    expect(sumWeights(cnRow)).toBeCloseTo(10, 2);
    expect(sumWeights(enRow)).toBeCloseTo(10, 2);

    expect(cnRow[1].label).toBe('，');
    expect(cnRow[1].action).toEqual({ type: 'commit-direct', value: '，', recordRecent: false });
    expect(cnRow[4].label).toBe('。');
    expect(cnRow[4].action).toEqual({ type: 'commit-direct', value: '。', recordRecent: false });

    expect(enRow[1].label).toBe(',');
    expect(enRow[4].label).toBe('.');

    const toNumpad = cnRow.find((k) => k.id === 'to-numpad');
    expect(toNumpad?.icon).toBe('dialpad-symbolic');
    expect(toNumpad?.action).toEqual({
      type: 'switch-layout',
      target: 'numpad',
      remember: true,
    });
  });
});
