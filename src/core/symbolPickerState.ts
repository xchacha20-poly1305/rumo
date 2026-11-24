import {
  RECENT_SYMBOLS_MAX,
  SYMBOL_CATEGORIES,
  SYMBOL_PAGE_SIZE,
  recordRecentSymbol,
  sanitizeRecentSymbols,
} from './symbolData.js';
import type { SymbolCategoryId, SymbolPickerState } from './types.js';

interface PageEntry {
  categoryIndex: number;
  pageInCategory: number;
  items: readonly string[];
}

interface CategoryRange {
  startPage: number;
  pageCount: number;
}

export class SymbolPickerController {
  private readonly _pages: PageEntry[] = [];
  private readonly _categoryRanges: CategoryRange[] = [];
  private _recentSymbols: string[] = [];
  private _displayedRecent: string[] = [];
  private _globalPageIndex = 1;

  constructor(initialRecentSymbols?: readonly string[]) {
    for (let catIdx = 0; catIdx < SYMBOL_CATEGORIES.length; catIdx++) {
      const cat = SYMBOL_CATEGORIES[catIdx];
      const startPage = this._pages.length;
      if (cat.isRecent) {
        this._pages.push({
          categoryIndex: catIdx,
          pageInCategory: 0,
          items: [],
        });
        this._categoryRanges.push({ startPage, pageCount: 1 });
        continue;
      }

      const chunks: string[][] = [];
      for (let i = 0; i < cat.items.length; i += SYMBOL_PAGE_SIZE) {
        chunks.push(cat.items.slice(i, i + SYMBOL_PAGE_SIZE));
      }
      if (chunks.length === 0) {
        chunks.push([]);
      }
      chunks.forEach((chunk, pageInCategory) => {
        this._pages.push({
          categoryIndex: catIdx,
          pageInCategory,
          items: chunk,
        });
      });
      this._categoryRanges.push({ startPage, pageCount: chunks.length });
    }

    if (initialRecentSymbols) {
      this.setRecentSymbols(initialRecentSymbols);
    }
  }

  get totalPages(): number {
    return this._pages.length;
  }

  setRecentSymbols(items: readonly string[]): void {
    const cleaned = sanitizeRecentSymbols(items, RECENT_SYMBOLS_MAX);
    this._recentSymbols = cleaned;
    this._displayedRecent = [...cleaned];
  }

  getRecentSymbols(): string[] {
    return [...this._recentSymbols];
  }

  getCategoryRange(categoryIndex: number): CategoryRange {
    const clamped = Math.max(0, Math.min(SYMBOL_CATEGORIES.length - 1, categoryIndex));
    return this._categoryRanges[clamped];
  }

  openDefault(imeActive: boolean): SymbolPickerState {
    this._displayedRecent = [...this._recentSymbols];
    const targetId: SymbolCategoryId = imeActive ? 'chinese' : 'common';
    const catIdx = SYMBOL_CATEGORIES.findIndex((c) => c.id === targetId);
    const resolvedIdx = catIdx >= 0 ? catIdx : 1;
    this._globalPageIndex = this._categoryRanges[resolvedIdx].startPage;
    return this.getState();
  }

  selectCategory(categoryIndex: number): SymbolPickerState {
    const clamped = Math.max(0, Math.min(SYMBOL_CATEGORIES.length - 1, categoryIndex));
    if (SYMBOL_CATEGORIES[clamped].isRecent) {
      this._displayedRecent = [...this._recentSymbols];
    }
    this._globalPageIndex = this._categoryRanges[clamped].startPage;
    return this.getState();
  }

  nextPage(): SymbolPickerState | null {
    if (this._globalPageIndex + 1 >= this._pages.length) {
      return null;
    }
    this._globalPageIndex++;
    if (this._pages[this._globalPageIndex].categoryIndex === 0) {
      this._displayedRecent = [...this._recentSymbols];
    }
    return this.getState();
  }

  prevPage(): SymbolPickerState | null {
    if (this._globalPageIndex - 1 < 0) {
      return null;
    }
    this._globalPageIndex--;
    if (this._pages[this._globalPageIndex].categoryIndex === 0) {
      this._displayedRecent = [...this._recentSymbols];
    }
    return this.getState();
  }

  recordUsed(symbol: string): { changed: boolean; recentSymbols: string[] } {
    const next = recordRecentSymbol(this._recentSymbols, symbol, RECENT_SYMBOLS_MAX);
    const changed =
      next.length !== this._recentSymbols.length ||
      next.some((item, idx) => item !== this._recentSymbols[idx]);

    if (!changed) {
      return { changed: false, recentSymbols: [...this._recentSymbols] };
    }

    this._recentSymbols = next;
    const currentCategoryIndex = this._pages[this._globalPageIndex].categoryIndex;
    if (!SYMBOL_CATEGORIES[currentCategoryIndex].isRecent) {
      this._displayedRecent = [...this._recentSymbols];
    }

    return { changed: true, recentSymbols: [...this._recentSymbols] };
  }

  getState(): SymbolPickerState {
    const page = this._pages[this._globalPageIndex];
    const activeCatIdx = page.categoryIndex;
    const activeCat = SYMBOL_CATEGORIES[activeCatIdx];
    const range = this._categoryRanges[activeCatIdx];
    const items = activeCat.isRecent ? [...this._displayedRecent] : page.items;

    return {
      categories: SYMBOL_CATEGORIES.map((cat, idx) => ({
        id: cat.id,
        label: cat.label,
        icon: cat.icon,
        active: idx === activeCatIdx,
      })),
      activeCategoryIndex: activeCatIdx,
      activeCategoryId: activeCat.id,
      pageInCategory: page.pageInCategory,
      categoryPageCount: range.pageCount,
      globalPageIndex: this._globalPageIndex,
      totalPages: this._pages.length,
      items,
      hasPrevPage: this._globalPageIndex > 0,
      hasNextPage: this._globalPageIndex < this._pages.length - 1,
      isRecentEmpty: Boolean(activeCat.isRecent && items.length === 0),
    };
  }
}
