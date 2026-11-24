import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const UUID = 'rumo@io.github.xchacha20-poly1305';
const GETTEXT_DOMAIN = 'rumo';
const rootDir = resolve('.');
const outDir = join(rootDir, 'dist', UUID);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(rootDir, 'src', 'extension.ts')],
  outdir: outDir,
  naming: 'extension.js',
  format: 'esm',
  target: 'browser',
  external: ['gi://*', 'resource://*'],
  minify: false,
  sourcemap: 'none',
  banner: '// Rumo (如梦输入法) — Compiled from TypeScript for GNOME Shell GJS ESM',
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

cpSync(join(rootDir, 'metadata.json'), join(outDir, 'metadata.json'));
cpSync(join(rootDir, 'stylesheet.css'), join(outDir, 'stylesheet.css'));
cpSync(join(rootDir, 'icons'), join(outDir, 'icons'), { recursive: true });
cpSync(join(rootDir, 'schemas'), join(outDir, 'schemas'), { recursive: true });

try {
  execFileSync('glib-compile-schemas', [join(outDir, 'schemas')], { stdio: 'inherit' });
} catch {
  console.warn('Warning: glib-compile-schemas not found or failed; schemas were not compiled.');
}

const poDir = join(rootDir, 'po');
const linguasPath = join(poDir, 'LINGUAS');
if (existsSync(linguasPath)) {
  const locales = readFileSync(linguasPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  for (const locale of locales) {
    const poFile = join(poDir, `${locale}.po`);
    if (!existsSync(poFile)) {
      console.warn(`Warning: Missing translation file ${poFile}`);
      continue;
    }
    const moDir = join(outDir, 'locale', locale, 'LC_MESSAGES');
    mkdirSync(moDir, { recursive: true });
    try {
      execFileSync('msgfmt', ['-o', join(moDir, `${GETTEXT_DOMAIN}.mo`), poFile], {
        stdio: 'inherit',
      });
    } catch {
      console.warn(`Warning: msgfmt not found or failed for locale ${locale}.`);
    }
  }
}

if (process.argv.includes('--install')) {
  const targetDir = join(homedir(), '.local', 'share', 'gnome-shell', 'extensions', UUID);
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(join(homedir(), '.local', 'share', 'gnome-shell', 'extensions'), { recursive: true });
  cpSync(outDir, targetDir, { recursive: true });
  console.log(`Installed extension to ${targetDir}`);
}

console.log(`Built ${UUID} -> ${outDir}`);
