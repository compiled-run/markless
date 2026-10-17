// Runs one build in its own process so a native deadlock can be killed from outside.
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { build, type Plugin } from 'vite';
import { markless } from '../../src/vite/index.ts';

const [mode, workDir, countArg] = process.argv.slice(2);
if ((mode !== 'emit' && mode !== 'component') || !workDir || !countArg)
	throw new Error('usage: <emit|component> <workDir> <count>');
const count = Number(countArg);

const fixture = resolve(import.meta.dirname, '../../fixtures/vite-csr');
const root = resolve(workDir, 'app');
await rm(root, { force: true, recursive: true });
await mkdir(resolve(root, 'src'), { recursive: true });
// The fixture install is shared; cacheDir below keeps this build out of its .vite.
await symlink(resolve(fixture, 'node_modules'), resolve(root, 'node_modules'));

if (mode === 'emit') {
	await writeFile(resolve(root, 'index.html'), '<script type="module" src="/src/main.js"></script>');
	await writeFile(resolve(root, 'src/main.js'), 'export const main = 1;');
	const burst: Plugin = {
		name: 'emit-burst',
		resolveId: (id) => (id.startsWith('\0burst:') ? id : undefined),
		load: (id) => (id.startsWith('\0burst:') ? `export default ${JSON.stringify(id)};` : undefined),
		transform(_code, id) {
			if (!id.endsWith('/src/main.js')) return;
			for (let index = 0; index < count; index += 1)
				this.emitFile({ type: 'chunk', id: `\0burst:${index}` });
		},
	};
	await build({
		configFile: false,
		cacheDir: resolve(workDir, 'vite-cache'),
		root,
		logLevel: 'error',
		build: { outDir: resolve(workDir, 'dist'), emptyOutDir: true },
		plugins: [burst],
	});
} else {
	await cp(resolve(fixture, 'index.html'), resolve(root, 'index.html'));
	await cp(resolve(fixture, 'src/main.ts'), resolve(root, 'src/main.ts'));
	await writeFile(resolve(root, 'src/root.tsrx'), largeComponent(count));
	await build({
		configFile: false,
		cacheDir: resolve(workDir, 'vite-cache'),
		root,
		logLevel: 'error',
		build: { outDir: resolve(workDir, 'dist'), emptyOutDir: true },
		plugins: [markless()],
	});
}
console.log('built');

// One component holding every row unrolled: computeds and handlers per row, no `@for`.
function largeComponent(rows: number): string {
	const lines = [
		"import { computed, state } from '@markless/core';",
		'',
		'export default function App() @{',
		`\tlet rows = state(Array.from({ length: ${rows} }, (_, i) => ({ name: 'user' + i, active: i % 2 === 0, selected: false })));`,
		"\tlet filter = state('');",
	];
	for (let row = 0; row < rows; row += 1)
		lines.push(
			`\tconst name${row} = computed(() => rows[${row}].name.toUpperCase());`,
			`\tconst status${row} = computed(() => (rows[${row}].active ? 'active' : 'inactive') + filter);`,
			`\tconst label${row} = computed(() => (rows[${row}].selected ? 'on' : 'off'));`,
		);
	lines.push('\t<table>', '\t\t<tbody>');
	for (let row = 0; row < rows; row += 1)
		lines.push(
			`\t\t\t<tr data-row="${row}"><td>{name${row}}</td><td>{status${row}}</td><td><button type="button" onClick={() => { rows[${row}].selected = !rows[${row}].selected; filter = filter + 'x'; }}>{label${row}}</button></td></tr>`,
		);
	lines.push('\t\t</tbody>', '\t</table>', '}', '');
	return lines.join('\n');
}
