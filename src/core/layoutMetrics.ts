export const KEYBOARD_BORDER_TOP_PX = 1;
export const CONTENT_PADDING_TOP_PX = 6;
export const CONTENT_PADDING_BOTTOM_PX = 10;
export const CONTENT_SPACING_PX = 6;
export const CANDIDATE_BAR_PADDING_BOTTOM_PX = 4;
export const CANDIDATE_BAR_BORDER_BOTTOM_PX = 1;
export const KEY_GRID_PADDING_TOP_PX = 2;
export const KEY_ROW_SPACING_PX = 7;
export const BASE_CANDIDATE_ROW_HEIGHT_PX = 40;
export const BASE_PREEDIT_HEIGHT_PX = 28;

export interface KeyboardLayoutMetrics {
  candidateRowHeight: number;
  candidateButtonHeight: number;
  candidateBarHeight: number;
  preeditHeight: number;
  gridHeight: number;
  rowHeight: number;
}

export function computeKeyboardLayoutMetrics(
  keyboardHeight: number,
  fontScale = 1,
  rowCount = 4,
): KeyboardLayoutMetrics {
  const effectiveScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const safeRowCount =
    Number.isFinite(rowCount) && rowCount > 0 ? Math.floor(rowCount) : 4;

  const candidateRowHeight = Math.round(BASE_CANDIDATE_ROW_HEIGHT_PX * effectiveScale);
  const candidateButtonHeight = candidateRowHeight - 4;
  const candidateBarHeight =
    candidateRowHeight + CANDIDATE_BAR_PADDING_BOTTOM_PX + CANDIDATE_BAR_BORDER_BOTTOM_PX;
  const preeditHeight = Math.round(BASE_PREEDIT_HEIGHT_PX * effectiveScale);

  const chromeOverhead =
    KEYBOARD_BORDER_TOP_PX +
    CONTENT_PADDING_TOP_PX +
    CONTENT_PADDING_BOTTOM_PX +
    CONTENT_SPACING_PX +
    candidateBarHeight +
    KEY_GRID_PADDING_TOP_PX;

  const safeKbHeight = Number.isFinite(keyboardHeight) ? keyboardHeight : 0;
  const gridHeight = Math.max(120, safeKbHeight - chromeOverhead);
  const totalRowGaps = Math.max(0, safeRowCount - 1) * KEY_ROW_SPACING_PX;
  const rowHeight = Math.max(
    32,
    Math.floor((gridHeight - totalRowGaps) / safeRowCount),
  );

  return {
    candidateRowHeight,
    candidateButtonHeight,
    candidateBarHeight,
    preeditHeight,
    gridHeight,
    rowHeight,
  };
}
