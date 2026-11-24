import { describe, expect, it } from 'bun:test';
import {
  RECENT_SYMBOLS_MAX,
  SYMBOL_CATEGORIES,
  SYMBOL_PAGE_SIZE,
  isDigitSymbol,
  recordRecentSymbol,
} from '../src/core/symbolData.js';
import { SymbolPickerController } from '../src/core/symbolPickerState.js';

describe('symbolData & SymbolPickerController', () => {
  it('defines 9 categories with 28-item chinese category and exact page counts', () => {
    expect(SYMBOL_CATEGORIES.length).toBe(9);
    expect(SYMBOL_CATEGORIES.map((c) => c.id)).toEqual([
      'recent',
      'chinese',
      'common',
      'bracket',
      'arrow',
      'math',
      'ordinal',
      'other',
      'fullwidth',
    ]);
    expect(SYMBOL_CATEGORIES[1].items.length).toBe(SYMBOL_PAGE_SIZE);

    const ctrl = new SymbolPickerController();
    expect(ctrl.getCategoryRange(0).pageCount).toBe(1); // recent
    expect(ctrl.getCategoryRange(1).pageCount).toBe(1); // chinese (28)
    expect(ctrl.getCategoryRange(2).pageCount).toBe(3); // common (84)
    expect(ctrl.getCategoryRange(3).pageCount).toBe(2); // bracket (56)
    expect(ctrl.getCategoryRange(4).pageCount).toBe(3); // arrow (84)
    expect(ctrl.getCategoryRange(5).pageCount).toBe(4); // math (112)
    expect(ctrl.getCategoryRange(6).pageCount).toBe(3); // ordinal (84)
    expect(ctrl.getCategoryRange(7).pageCount).toBe(4); // other (112)
    expect(ctrl.getCategoryRange(8).pageCount).toBe(2); // fullwidth (52)
    expect(ctrl.totalPages).toBe(23);
  });

  it('filters ASCII and fullwidth digits, deduplicates, and caps recent symbols at 28', () => {
    expect(isDigitSymbol('0')).toBe(true);
    expect(isDigitSymbol('9')).toBe(true);
    expect(isDigitSymbol('０')).toBe(true);
    expect(isDigitSymbol('９')).toBe(true);
    expect(isDigitSymbol('10')).toBe(false);
    expect(isDigitSymbol('①')).toBe(false);

    let recent: string[] = [];
    recent = recordRecentSymbol(recent, '5');
    recent = recordRecentSymbol(recent, '５');
    expect(recent).toEqual([]);

    for (let i = 0; i < 35; i++) {
      recent = recordRecentSymbol(recent, String.fromCodePoint(0x2460 + i));
    }
    expect(recent.length).toBe(RECENT_SYMBOLS_MAX);

    const first = recent[0];
    const third = recent[2];
    recent = recordRecentSymbol(recent, third);
    expect(recent[0]).toBe(third);
    expect(recent[1]).toBe(first);
    expect(recent.length).toBe(RECENT_SYMBOLS_MAX);
  });

  it('opens chinese category by default in CN mode and common in EN mode', () => {
    const ctrl = new SymbolPickerController();
    const cnState = ctrl.openDefault(true);
    expect(cnState.activeCategoryId).toBe('chinese');
    expect(cnState.activeCategoryIndex).toBe(1);
    expect(cnState.items[0]).toBe('，');

    const enState = ctrl.openDefault(false);
    expect(enState.activeCategoryId).toBe('common');
    expect(enState.activeCategoryIndex).toBe(2);
    expect(enState.items[0]).toBe('1');
  });

  it('navigates across category boundaries via nextPage and prevPage', () => {
    const ctrl = new SymbolPickerController();
    ctrl.openDefault(true); // globalPageIndex = 1 (chinese, 1 page)
    expect(ctrl.getState().hasPrevPage).toBe(true);

    const prev = ctrl.prevPage();
    expect(prev?.activeCategoryId).toBe('recent');
    expect(prev?.hasPrevPage).toBe(false);
    expect(prev?.isRecentEmpty).toBe(true);
    expect(ctrl.prevPage()).toBeNull();

    const backToCn = ctrl.nextPage();
    expect(backToCn?.activeCategoryId).toBe('chinese');

    const toCommonPage0 = ctrl.nextPage();
    expect(toCommonPage0?.activeCategoryId).toBe('common');
    expect(toCommonPage0?.pageInCategory).toBe(0);
    expect(toCommonPage0?.categoryPageCount).toBe(3);

    const toCommonPage1 = ctrl.nextPage();
    expect(toCommonPage1?.activeCategoryId).toBe('common');
    expect(toCommonPage1?.pageInCategory).toBe(1);

    ctrl.selectCategory(8);
    expect(ctrl.nextPage()?.pageInCategory).toBe(1);
    expect(ctrl.getState().hasNextPage).toBe(false);
    expect(ctrl.nextPage()).toBeNull();
  });

  it('does not reorder displayed recent items while on the recent tab until revisiting', () => {
    const ctrl = new SymbolPickerController(['！', '？', '。', '5']);
    expect(ctrl.getRecentSymbols()).toEqual(['！', '？', '。']);

    const recentState = ctrl.selectCategory(0);
    expect(recentState.items).toEqual(['！', '？', '。']);

    const res = ctrl.recordUsed('。');
    expect(res.changed).toBe(true);
    expect(res.recentSymbols).toEqual(['。', '！', '？']);
    // Displayed snapshot on recent page remains unchanged until leaving & re-entering
    expect(ctrl.getState().items).toEqual(['！', '？', '。']);

    ctrl.selectCategory(1);
    const refreshedRecent = ctrl.selectCategory(0);
    expect(refreshedRecent.items).toEqual(['。', '！', '？']);
  });
});
