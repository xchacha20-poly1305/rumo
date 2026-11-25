import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
  MAX_HEIGHT_RATIO,
  MIN_HEIGHT_RATIO,
  normalizeDisplayMode,
  percentToRatio,
  ratioToPercent,
} from './core/settings.js';

export default class RumoPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window: any): void {
    const settings = this.getSettings();
    const signalIds: number[] = [];

    const page = new Adw.PreferencesPage({
      title: _('General'),
      icon_name: 'preferences-system-symbolic',
    });

    const displayGroup = new Adw.PreferencesGroup({
      title: _('Display & Layout'),
    });

    const displayModeModel = Gtk.StringList.new([
      _('Overlay on top'),
      _('Push screen up'),
    ]);
    const displayModeRow = new Adw.ComboRow({
      title: _('Display mode'),
      subtitle: _(
        'Choose whether the keyboard floats over windows or pushes windows upward.',
      ),
      model: displayModeModel,
    });

    let syncingDisplayMode = false;
    const syncDisplayModeFromSettings = () => {
      const mode = normalizeDisplayMode(settings.get_string('display-mode'));
      syncingDisplayMode = true;
      displayModeRow.set_selected(mode === 'push' ? 1 : 0);
      syncingDisplayMode = false;
    };
    syncDisplayModeFromSettings();

    displayModeRow.connect('notify::selected', () => {
      if (syncingDisplayMode) return;
      const nextMode = displayModeRow.get_selected() === 1 ? 'push' : 'overlay';
      settings.set_string('display-mode', nextMode);
    });
    signalIds.push(
      settings.connect('changed::display-mode', syncDisplayModeFromSettings),
    );
    displayGroup.add(displayModeRow);

    const minPct = Math.round(MIN_HEIGHT_RATIO * 100);
    const maxPct = Math.round(MAX_HEIGHT_RATIO * 100);
    const initialPct = ratioToPercent(
      settings.get_double('keyboard-height-ratio'),
    );

    const heightRow = new Adw.ActionRow({
      title: _('Keyboard height'),
      subtitle: _('Height of the keyboard as a percentage of the screen height.'),
    });

    const adjustment = new Gtk.Adjustment({
      lower: minPct,
      upper: maxPct,
      step_increment: 1,
      page_increment: 5,
      value: initialPct,
    });
    const heightScale = new Gtk.Scale({
      orientation: Gtk.Orientation.HORIZONTAL,
      adjustment,
      draw_value: false,
      digits: 0,
      hexpand: true,
      width_request: 180,
      valign: Gtk.Align.CENTER,
    });
    const heightLabel = new Gtk.Label({
      label: `${initialPct}%`,
      width_chars: 4,
      xalign: 1,
      valign: Gtk.Align.CENTER,
    });

    const heightBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      valign: Gtk.Align.CENTER,
    });
    heightBox.append(heightScale);
    heightBox.append(heightLabel);
    heightRow.add_suffix(heightBox);

    let syncingHeight = false;
    heightScale.connect('value-changed', () => {
      const pct = Math.round(heightScale.get_value());
      heightLabel.set_label(`${pct}%`);
      if (syncingHeight) return;
      settings.set_double('keyboard-height-ratio', percentToRatio(pct));
    });
    signalIds.push(
      settings.connect('changed::keyboard-height-ratio', () => {
        const pct = ratioToPercent(
          settings.get_double('keyboard-height-ratio'),
        );
        heightLabel.set_label(`${pct}%`);
        syncingHeight = true;
        heightScale.set_value(pct);
        syncingHeight = false;
      }),
    );
    displayGroup.add(heightRow);

    const integrationGroup = new Adw.PreferencesGroup({
      title: _('Integration'),
    });

    const indicatorRow = new Adw.SwitchRow({
      title: _('Show top bar toggle indicator'),
      subtitle: _('Show a keyboard toggle button in the GNOME Shell top bar.'),
    });
    settings.bind(
      'show-panel-indicator',
      indicatorRow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    integrationGroup.add(indicatorRow);

    const clipboardRow = new Adw.SwitchRow({
      title: _('Enable XWayland clipboard paste fallback'),
      subtitle: _(
        'Temporarily paste via clipboard when a window lacks native text-input support.',
      ),
    });
    settings.bind(
      'xwayland-clipboard-fallback',
      clipboardRow,
      'active',
      Gio.SettingsBindFlags.DEFAULT,
    );
    integrationGroup.add(clipboardRow);

    page.add(displayGroup);
    page.add(integrationGroup);
    window.add(page);

    window.connect('close-request', () => {
      for (const id of signalIds) {
        settings.disconnect(id);
      }
      signalIds.length = 0;
      return false;
    });
  }
}
