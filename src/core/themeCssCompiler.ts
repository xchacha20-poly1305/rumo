import { computeKeyboardLayoutMetrics } from './layoutMetrics.js';
import { formatRgba, isSafeCssUri } from './themeColor.js';
import type { ResolvedTheme } from './themeTypes.js';

function scaledPx(basePx: number, scale: number): string {
  const val = Math.round(basePx * scale * 10) / 10;
  return `${val}px`;
}

export function compileThemeCss(theme: ResolvedTheme): string {
  const { colors: c, geometry, typography, background } = theme;
  const s = typography.fontScale;
  const rgba = formatRgba;
  const metrics = computeKeyboardLayoutMetrics(0, s);
  const candRowHeight = metrics.candidateRowHeight;
  const candBtnHeight = metrics.candidateButtonHeight;
  const preeditHeight = metrics.preeditHeight;

  const fontDecl = typography.fontFamily
    ? `\n  font-family: ${typography.fontFamily};`
    : '';

  const bgLayerRule =
    background.imageUri && isSafeCssUri(background.imageUri)
      ? `
.rumo-keyboard-bg {
  background-image: url("${background.imageUri}");
  background-size: ${background.size};
  background-position: center;
  background-repeat: no-repeat;
}`
      : `
.rumo-keyboard-bg {
  background-image: none;
}`;

  const keyBorderRule = geometry.keyBorder
    ? `2px solid ${rgba(c.keyBorderColor)}`
    : 'none';

  return `/* Rumo Generated Theme (preset: ${theme.preset}, mode: ${theme.mode}) */

.rumo-keyboard {
  background-color: ${rgba(c.keyboardBackground)};
  border-top: 1px solid ${rgba(c.keyboardBorder)};
  padding: 0;${fontDecl}
}
${bgLayerRule}

.rumo-keyboard-content {
  padding: 6px 12px 10px 12px;
  spacing: 6px;
  background-color: transparent;
}

.rumo-keyboard.rumo-has-bg-image .rumo-keyboard-content {
  background-color: ${rgba(c.backgroundScrim)};
}

.rumo-candidate-bar {
  background-color: ${rgba(c.candidateBarBackground)};
  padding: 0 2px 4px 2px;
  border-bottom: 1px solid ${rgba(c.divider)};
}

.rumo-preedit-strip {
  background-color: ${rgba(c.keyboardBackground)};
  border: 1px solid ${rgba(c.keyboardBorder)};
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  padding: 0 10px;
  height: ${preeditHeight}px;
  spacing: 6px;${fontDecl}
}

.rumo-preedit-label {
  color: ${rgba(c.preeditForeground)};
  font-size: ${scaledPx(14, s)};
  font-weight: 600;
  letter-spacing: 0.4px;
}

.rumo-candidate-row {
  spacing: 8px;
  height: ${candRowHeight}px;
  min-height: ${candRowHeight}px;
  max-height: ${candRowHeight}px;
}

.rumo-candidate-list {
  spacing: 0;
  padding: 0;
}

.rumo-cand-sep {
  width: 1px;
  height: 18px;
  background-color: ${rgba(c.separator)};
}

.rumo-candidate-btn {
  background-color: transparent;
  color: ${rgba(c.candidateForeground)};
  border-radius: 8px;
  padding: 2px 10px;
  min-height: ${candBtnHeight}px;
  height: ${candBtnHeight}px;
  font-size: ${scaledPx(18, s)};
  font-weight: 500;
  transition-duration: 80ms;
}

.rumo-candidate-btn:hover,
.rumo-candidate-btn:active {
  background-color: ${rgba(c.candidateHoverBackground)};
}

.rumo-candidate-btn-primary {
  background-color: ${rgba(c.candidatePrimaryBackground)};
  color: ${rgba(c.candidatePrimaryForeground)};
  font-weight: 700;
}

.rumo-candidate-btn-primary:hover,
.rumo-candidate-btn-primary:active {
  background-color: ${rgba(c.candidateHoverBackground)};
}

.rumo-status-label {
  color: ${rgba(c.statusForeground)};
  font-size: ${scaledPx(14, s)};
  padding: 0 8px;
}

.rumo-bar-action-btn {
  background-color: ${rgba(c.barActionBackground)};
  color: ${rgba(c.barActionForeground)};
  border-radius: 9px;
  padding: 2px 10px;
  min-width: 40px;
  min-height: ${candBtnHeight}px;
  height: ${candBtnHeight}px;
  font-size: ${scaledPx(18, s)};
  font-weight: 600;
  transition-duration: 80ms;
}

.rumo-bar-action-btn:hover,
.rumo-bar-action-btn:active {
  background-color: ${rgba(c.barActionHoverBackground)};
}

.rumo-bar-action-btn-active {
  background-color: ${rgba(c.barActionActiveBackground)};
  color: ${rgba(c.barActionActiveForeground)};
}

.rumo-bar-action-btn:insensitive {
  color: ${rgba(c.barActionDisabledForeground)};
  background-color: ${rgba(c.barActionDisabledBackground)};
}

.rumo-toolbar-box {
  spacing: 6px;
  padding: 0 2px;
}

.rumo-toolbar-toggle-btn {
  min-width: 34px;
  padding: 2px 6px;
}

.rumo-toolbar-btn {
  padding: 2px 10px;
  font-size: ${scaledPx(14, s)};
  font-weight: 600;
}

.rumo-toolbar-btn-content {
  spacing: 6px;
}

.rumo-toolbar-icon {
  icon-size: ${scaledPx(18, s)};
}

.rumo-toolbar-label {
  font-size: ${scaledPx(14, s)};
  font-weight: 600;
}

.rumo-hide-icon {
  icon-size: ${scaledPx(20, s)};
}

/* Expanded all-candidates drawer */
.rumo-drawer {
  spacing: 8px;
  padding-top: 2px;
}

.rumo-drawer-scroll {
  padding-right: 4px;
}

.rumo-drawer-grid {
  spacing: 2px;
}

.rumo-drawer-row {
  spacing: 0;
  border-bottom: 1px solid ${rgba(c.drawerRowBorder)};
}

.rumo-drawer-cand-btn {
  background-color: transparent;
  color: ${rgba(c.candidateForeground)};
  border-radius: 8px;
  padding: 6px 10px;
  min-height: 38px;
  font-size: ${scaledPx(16, s)};
  font-weight: 400;
  transition-duration: 70ms;
}

.rumo-drawer-cand-btn:hover,
.rumo-drawer-cand-btn:active {
  background-color: ${rgba(c.candidateHoverBackground)};
  color: ${rgba(c.candidatePrimaryForeground)};
}

.rumo-drawer-cand-btn-primary {
  color: ${rgba(c.preeditForeground)};
  font-weight: 600;
}

.rumo-drawer-more-btn {
  background-color: ${rgba(c.drawerMoreBackground)};
  color: ${rgba(c.drawerMoreForeground)};
  border-radius: 8px;
  padding: 6px 12px;
  margin-top: 4px;
  min-height: 34px;
  font-size: ${scaledPx(14, s)};
  font-weight: 500;
}

.rumo-drawer-more-btn:hover,
.rumo-drawer-more-btn:active {
  background-color: ${rgba(c.drawerMoreHoverBackground)};
  color: ${rgba(c.candidatePrimaryForeground)};
}

.rumo-drawer-sidebar {
  width: 72px;
  spacing: 6px;
  padding-left: 8px;
  border-left: 1px solid ${rgba(c.drawerSidebarBorder)};
}

.rumo-drawer-side-btn {
  background-color: ${rgba(c.drawerSideButtonBackground)};
  color: ${rgba(c.drawerSideButtonForeground)};
  border-radius: 10px;
  font-size: ${scaledPx(18, s)};
  font-weight: 600;
  min-height: 38px;
  transition-duration: 80ms;
}

.rumo-drawer-side-btn:hover,
.rumo-drawer-side-btn:active {
  background-color: ${rgba(c.drawerSideButtonHoverBackground)};
}

.rumo-drawer-back-btn {
  background-color: ${rgba(c.accent)};
  color: ${rgba(c.accentForeground)};
}

.rumo-drawer-back-btn:hover,
.rumo-drawer-back-btn:active {
  background-color: ${rgba(c.accentHoverBackground)};
}

/* Main key grid */
.rumo-key-grid {
  spacing: 7px;
  padding-top: 2px;
}

.rumo-key-row {
  spacing: 6px;
}

.rumo-key {
  background-color: ${rgba(c.keyBackground)};
  color: ${rgba(c.keyForeground)};
  border-radius: ${geometry.keyRadius}px;
  border: none;
  border-bottom: ${keyBorderRule};
  font-size: ${scaledPx(18, s)};
  font-weight: 500;
  padding: 4px;
  transition-duration: 70ms;
}

.rumo-key:hover {
  background-color: ${rgba(c.keyHoverBackground)};
}

.rumo-key-special {
  background-color: ${rgba(c.specialKeyBackground)};
  color: ${rgba(c.specialKeyForeground)};
  font-size: ${scaledPx(15, s)};
  font-weight: 600;
}

.rumo-key-special:hover {
  background-color: ${rgba(c.specialKeyHoverBackground)};
}

.rumo-key-alt-fg {
  background-color: ${rgba(c.altKeyBackground)};
  color: ${rgba(c.altKeyForeground)};
  font-size: ${scaledPx(16, s)};
  font-weight: 600;
}

.rumo-key-alt-fg:hover {
  background-color: ${rgba(c.keyHoverBackground)};
}

.rumo-key-space {
  font-size: ${scaledPx(14, s)};
  color: ${rgba(c.spaceForeground)};
}

.rumo-key-numpad-digit {
  font-size: ${scaledPx(24, s)};
  font-weight: 500;
}

.rumo-key-active,
.rumo-key-active:hover {
  background-color: ${rgba(c.activeKeyBackground)};
  color: ${rgba(c.activeKeyForeground)};
  border: 1px solid ${rgba(c.activeKeyBorder)};
}

.rumo-key:active,
.rumo-key-pressed,
.rumo-key-special:active,
.rumo-key-special.rumo-key-pressed,
.rumo-key-alt-fg:active,
.rumo-key-alt-fg.rumo-key-pressed,
.rumo-key-active:active,
.rumo-key-active.rumo-key-pressed {
  background-color: ${rgba(c.keyPressedBackground)};
  color: ${rgba(c.keyPressedForeground)};
}

.rumo-key:active .rumo-key-main-label,
.rumo-key-pressed .rumo-key-main-label {
  color: ${rgba(c.keyPressedForeground)};
}

.rumo-key-accent {
  background-color: ${rgba(c.accent)};
  color: ${rgba(c.accentForeground)};
  font-size: ${scaledPx(15, s)};
  font-weight: 700;
}

.rumo-key-accent:hover,
.rumo-key-accent:active,
.rumo-key-accent.rumo-key-pressed {
  background-color: ${rgba(c.accentHoverBackground)};
  color: ${rgba(c.accentForeground)};
}

.rumo-key-icon {
  icon-size: ${scaledPx(20, s)};
}

.rumo-key-main-label {
  font-size: ${scaledPx(18, s)};
  font-weight: 500;
  color: ${rgba(c.keyForeground)};
}

.rumo-key-secondary-label {
  font-size: ${scaledPx(11, s)};
  font-weight: 600;
  color: ${rgba(c.secondaryLabelForeground)};
  padding: 2px 5px 0 0;
}

.rumo-key-secondary-active .rumo-key-secondary-label {
  color: ${rgba(c.secondaryLabelActiveForeground)};
  font-size: ${scaledPx(13, s)};
  font-weight: 700;
}

/* Symbol picker tabs & grid */
.rumo-symbol-tabs {
  spacing: 4px;
  padding: 0 2px;
}

.rumo-symbol-tab {
  background-color: transparent;
  color: ${rgba(c.symbolTabForeground)};
  border-radius: 8px;
  padding: 2px 6px;
  min-height: ${candBtnHeight}px;
  height: ${candBtnHeight}px;
  font-size: ${scaledPx(14, s)};
  font-weight: 600;
  transition-duration: 70ms;
}

.rumo-symbol-tab:hover,
.rumo-symbol-tab:active {
  background-color: ${rgba(c.symbolTabHoverBackground)};
  color: ${rgba(c.keyForeground)};
}

.rumo-symbol-tab-active {
  background-color: ${rgba(c.symbolTabActiveBackground)};
  color: ${rgba(c.keyForeground)};
  border-bottom: 2px solid ${rgba(c.paginationThumb)};
}

.rumo-symbol-tab-icon {
  icon-size: ${scaledPx(18, s)};
}

.rumo-symbol-picker {
  spacing: 4px;
  padding-top: 2px;
}

.rumo-symbol-grid {
  spacing: 6px;
}

.rumo-symbol-row {
  spacing: 6px;
}

.rumo-symbol-key {
  font-size: ${scaledPx(17, s)};
  font-weight: 500;
}

.rumo-symbol-empty-label {
  color: ${rgba(c.symbolEmptyForeground)};
  font-size: ${scaledPx(14, s)};
}

.rumo-pagination-track {
  height: 3px;
  background-color: ${rgba(c.paginationTrack)};
  border-radius: 2px;
  margin: 1px 0;
}

.rumo-pagination-thumb {
  height: 3px;
  background-color: ${rgba(c.paginationThumb)};
  border-radius: 2px;
}
`;
}
