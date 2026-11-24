export interface TextSizedItem {
  text: string;
}

const ASCII_CHAR_PX = 10;
const WIDE_CHAR_PX = 19;
const HORIZONTAL_PADDING_PX = 28;
const MIN_ITEM_PX = 76;

/**
 * Estimates the natural horizontal width (in px) of a candidate item
 * for flex-wrap row packing.
 */
export function estimateCandidateWidth(text: string): number {
  let contentPx = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    contentPx += code <= 0x7f ? ASCII_CHAR_PX : WIDE_CHAR_PX;
  }
  return Math.max(MIN_ITEM_PX, contentPx + HORIZONTAL_PADDING_PX);
}

/**
 * Greedily packs candidate items into flex-wrap rows for a given container width.
 * Each row always contains at least one item; when rendered with x_expand=true,
 * items in each row stretch evenly to fill the full row width.
 */
export function packCandidateRows<T extends TextSizedItem>(
  items: T[],
  availableWidth: number,
): T[][] {
  if (items.length === 0) return [];
  const maxWidth = Math.max(MIN_ITEM_PX, availableWidth);
  const rows: T[][] = [];
  let currentRow: T[] = [];
  let currentWidth = 0;

  for (const item of items) {
    const w = estimateCandidateWidth(item.text);
    if (currentRow.length > 0 && currentWidth + w > maxWidth) {
      rows.push(currentRow);
      currentRow = [item];
      currentWidth = w;
    } else {
      currentRow.push(item);
      currentWidth += w;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  return rows;
}
