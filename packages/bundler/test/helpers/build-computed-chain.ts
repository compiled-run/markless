// Builds the computed-chain benchmark app at one depth in its own process and prints the bytes of every JavaScript file it emitted.
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { build } from 'vite';
import { generateFixtureFiles } from '../../../../demos/computed-chain/gen.mjs';
import { markless } from '../../src/vite/index.ts';

const [workDir, levelsArg, ownersArg] = process.argv.slice(2);
if (!workDir || !levelsArg || !ownersArg) throw new Error('usage: <workDir> <levels> <owner,owner,...>');

const fixture = resolve(import.meta.dirname, '../../fixtures/vite-csr');
const root = resolve(workDir, 'app');
await rm(root, { force: true, recursive: true });
await mkdir(resolve(root, 'src'), { recursive: true });
await symlink(resolve(fixture, 'node_modules'), resolve(root, 'node_modules'));
await writeFile(resolve(root, 'index.html'), await readFile(resolve(fixture, 'index.html'), 'utf8'));
await writeFile(
	resolve(root, 'src/main.ts'),
	"import { render } from '@markless/core';\nimport App from './app.tsrx';\n\nawait render(App, { target: document.querySelector('#app')! });\n",
);
const files = generateFixtureFiles({ levels: Number(levelsArg), owners: ownersArg.split(',').map(Number) });
for (const [name, source] of files) await writeFile(resolve(root, 'src', name), source);

const outDir = resolve(workDir, 'dist');
await build({
	configFile: false,
	cacheDir: resolve(workDir, 'vite-cache'),
	root,
	logLevel: 'error',
	build: { outDir, emptyOutDir: true },
	plugins: [markless({ executionLog: 'never' })],
});

let bytes = 0;
for (const entry of await readdir(outDir, { recursive: true }))
	if (entry.endsWith('.js')) bytes += (await readFile(resolve(outDir, entry))).length;
console.log(JSON.stringify({ bytes }));
