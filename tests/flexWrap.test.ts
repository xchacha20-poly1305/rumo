import { describe, expect, it } from 'bun:test';
import { estimateCandidateWidth, packCandidateRows } from '../src/core/flexWrap.js';

describe('flexWrap', () => {
  it('estimates wider widths for CJK and long phrases than single chars', () => {
    const single = estimateCandidateWidth('你');
    const phrase = estimateCandidateWidth('hard disk drive');
    const cjkPhrase = estimateCandidateWidth('HDMI高清接口');

    expect(single).toBeGreaterThanOrEqual(76);
    expect(phrase).toBeGreaterThan(single);
    expect(cjkPhrase).toBeGreaterThan(single);
  });

  it('packs short single chars densely and wraps long phrases cleanly', () => {
    const items = [
      { text: '孩' },
      { text: '亥' },
      { text: '咳' },
      { text: '骸' },
      { text: '骇' },
      { text: '氦' },
      { text: '醢' },
      { text: '嗐' },
      { text: 'hard disk drive' },
      { text: 'HDMI高清接口' },
      { text: '海红旗-9C' },
    ];

    // 700px wide: 8 single chars (8 * 76 = 608 <= 700) fit on row 1
    const rows = packCandidateRows(items, 700);
    expect(rows[0].length).toBe(8);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.flat().map((i) => i.text)).toEqual(items.map((i) => i.text));
  });
});
