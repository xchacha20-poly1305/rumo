declare module 'gi://Clutter' {
  const Clutter: any;
  export default Clutter;
}

declare module 'gi://Gio' {
  const Gio: any;
  export default Gio;
}

declare module 'gi://GLib' {
  const GLib: any;
  export default GLib;
}

declare module 'gi://GObject' {
  const GObject: any;
  export default GObject;
}

declare module 'gi://Graphene' {
  const Graphene: any;
  export default Graphene;
}

declare module 'gi://Meta' {
  const Meta: any;
  export default Meta;
}

declare module 'gi://Pango' {
  const Pango: any;
  export default Pango;
}

declare module 'gi://St' {
  const St: any;
  export default St;
}

declare module 'resource:///org/gnome/shell/extensions/extension.js' {
  export class Extension {
    constructor(metadata: any);
    uuid: string;
    path: string;
    metadata: any;
    getSettings(schema?: string): any;
    enable(): void;
    disable(): void;
  }
  export function gettext(msgid: string): string;
  export function ngettext(msgid: string, msgidPlural: string, n: number): string;
  export function pgettext(context: string, msgid: string): string;
}

declare module 'resource:///org/gnome/shell/ui/main.js' {
  export const keyboard: any;
  export const inputMethod: any;
  export const layoutManager: any;
  export const panel: any;
}

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
  export const Button: any;
}

declare module 'resource:///org/gnome/shell/misc/ibusManager.js' {
  export function getIBusManager(): any;
}

declare const global: any;
