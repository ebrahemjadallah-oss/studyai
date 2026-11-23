import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const root = process.cwd();
const webDir = new URL('../www/', import.meta.url);
const webPath = new URL('../www', import.meta.url).pathname;

await rm(webPath, { recursive: true, force: true });
await mkdir(webPath, { recursive: true });

const files = [
  'index.html',
  'study-engine.js',
  'manifest.json',
  'icon.svg',
  'sw.js',
  'privacy.html'
];

for (const file of files) {
  try {
    await cp(new URL('../' + file, import.meta.url), new URL('../www/' + file, import.meta.url));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await build({
  entryPoints: [new URL('../native-voice-entry.js', import.meta.url).pathname],
  outfile: new URL('../www/native-voice.js', import.meta.url).pathname,
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020']
});

const indexPath = new URL('../www/index.html', import.meta.url);
let html = await readFile(indexPath, 'utf8');
const engineTag = '<script src="study-engine.js"></script>';
if (!html.includes(engineTag)) throw new Error('study-engine.js script tag is missing from index.html');
html = html.replace(engineTag, '<script src="native-voice.js"></script>\n' + engineTag);
await writeFile(indexPath, html, 'utf8');

console.log('Prepared Capacitor web assets in www/.');
