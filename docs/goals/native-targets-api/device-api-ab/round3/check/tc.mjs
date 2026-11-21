// Type-checks answer code against a signature sheet with the repo's Markless-aware tsc.
// usage: node check/tc.mjs <device-sheet.d.ts> <ui-sheet.d.ts or -> <work-name> <answer .md or .tsrx files...>
// Fenced tsrx/ts blocks in .md files become files named by their first-line `// file: <name>` comment.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../../../../../..');
const [sheet, ui, name, ...files] = process.argv.slice(2);
const work = join('/tmp/devab3/tc', name);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'src'), { recursive: true });
writeFileSync(join(work, 'device.d.ts'), readFileSync(sheet, 'utf8'));
if (ui !== '-') writeFileSync(join(work, 'ui.d.ts'), readFileSync(ui, 'utf8'));
let n = 0;
for (const file of files) {
	const text = readFileSync(file, 'utf8');
	if (!file.endsWith('.md')) { writeFileSync(join(work, 'src', basename(file)), text); continue; }
	let fence = null;
	for (const line of text.split('\n')) {
		const marker = line.match(/^\s*```(\S*)\s*$/);
		if (marker && !fence) { fence = { lang: marker[1], lines: [] }; continue; }
		if (marker && fence && marker[1] === '') {
			const { lang, lines } = fence;
			fence = null;
			if (!['tsrx', 'tsx', 'ts', 'typescript', ''].includes(lang)) continue;
			const named = (lines[0] ?? '').match(/\/\/\s*file:\s*(?:\S*\/)?([\w.-]+\.(?:tsrx|ts))\s*$/);
			n += 1;
			const fname = named ? named[1] : `Block${n}.${lang === 'ts' || lang === 'typescript' ? 'ts' : 'tsrx'}`;
			writeFileSync(join(work, 'src', fname), lines.join('\n'));
			continue;
		}
		if (fence) fence.lines.push(line);
	}
}
const config = join(work, 'tsconfig.json');
writeFileSync(config, JSON.stringify({
	contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'], options: { compiler: '@markless/typescript-plugin/volar-strict' } }],
	compilerOptions: {
		allowImportingTsExtensions: true, jsx: 'preserve', lib: ['ES2023', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'Bundler',
		noEmit: true, plugins: [{ name: '@markless/typescript-plugin' }], skipLibCheck: true, strict: true, target: 'ES2022', types: [],
		paths: { '@markless/device': ['./device.d.ts'], '@markless/ui': ['./ui.d.ts'], '@markless/core': [join(root, 'packages/core/src/index.ts')] },
	},
	include: ['src/**/*', '*.d.ts'],
}, null, '\t'));
let out = '';
try {
	out = execFileSync('node', [join(root, 'packages/typescript-plugin/src/tsc.ts'), '-p', config], { cwd: root, encoding: 'utf8' });
} catch (error) {
	out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
}
const errors = out.split('\n').filter((line) => line.includes(work) && /error/.test(line)).map((line) => line.replace(work + '/', ''));
writeFileSync(join(work, 'tsc.txt'), errors.join('\n'));
console.log(JSON.stringify({ name, errors }));
