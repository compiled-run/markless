// Builds a copy of a CSR fixture with one source edit applied, so two builds can be compared file by file.
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { build } from 'vite';
import { markless } from '../../src/vite/index.ts';

const [name, workDir, variant, filesJson] = process.argv.slice(2);
if (!name || !workDir || !variant)
	throw new Error('usage: <fixture> <workDir> <off|packs> [files]');
const fixture = resolve(import.meta.dirname, '../../fixtures', name);
const root = resolve(workDir, 'app');
await rm(root, { force: true, recursive: true });
await mkdir(root, { recursive: true });
await cp(resolve(fixture, 'src'), resolve(root, 'src'), { recursive: true });
await cp(resolve(fixture, 'index.html'), resolve(root, 'index.html'));
await symlink(resolve(fixture, 'node_modules'), resolve(root, 'node_modules'));
for (const [file, source] of Object.entries(
	JSON.parse(filesJson ?? '{}') as Record<string, string>,
))
	await writeFile(resolve(root, file), source);

await build({
	configFile: false,
	root,
	logLevel: 'error',
	build: { outDir: resolve(workDir, 'dist'), emptyOutDir: true },
	plugins: [markless(variant === 'off' ? { packing: false } : {})],
});
