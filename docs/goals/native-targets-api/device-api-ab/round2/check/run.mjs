// Type-checks answer code against one signature sheet with the repo's Markless-aware tsc.
// usage: node check/run.mjs <sheet-label> <out-name> <markdown files...>
// Each fenced block becomes a file: named by a first-line `// file: taskN/name.ext` or `// src/name.ext` comment, else taskN/App.tsrx.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../../../../../..');
const [label, outName, ...files] = process.argv.slice(2);
const work = join(here, 'work', outName);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'device'), { recursive: true });
writeFileSync(join(work, 'device', 'index.d.ts'), readFileSync(join(here, '..', 'sheets', `${label}.d.ts`), 'utf8'));

for (const file of files) {
	const text = readFileSync(file, 'utf8');
	const fixedTask = file.match(/task(\d)\.md$/)?.[1];
	let task = fixedTask;
	let fence = null;
	let count = {};
	for (const line of text.split('\n')) {
		const heading = !fence && line.match(/^#+ .*?Task (\d)\b/i);
		if (heading && !fixedTask) task = heading[1];
		const marker = line.match(/^```(\S*)\s*$/);
		if (marker && !fence) { fence = { lang: marker[1], lines: [] }; continue; }
		if (marker && fence && marker[1] === '') {
			const { lang, lines } = fence;
			fence = null;
			if (!task || !['tsrx', 'tsx', 'ts', 'typescript', ''].includes(lang)) continue;
			const first = lines[0] ?? '';
			if (/\.(json|md)\s*$/.test(first)) continue;
			const named = first.match(/\/\/\s*(?:file:\s*)?(?:task\d\/)?(?:src\/)?([\w.-]+\.(?:tsrx|ts))\s*$/);
			const ext = lang === 'ts' || lang === 'typescript' ? 'ts' : 'tsrx';
			count[task] = (count[task] ?? 0) + 1;
			const name = named ? named[1] : count[task] === 1 ? `App.${ext}` : `Extra${count[task]}.${ext}`;
			mkdirSync(join(work, `task${task}`), { recursive: true });
			writeFileSync(join(work, `task${task}`, name), lines.join('\n'));
			continue;
		}
		if (fence) fence.lines.push(line);
	}
}
const result = {};
for (const t of ['1', '2', '3', '4', '5', '6', '7', '8']) {
	if (!existsSync(join(work, `task${t}`))) { result[t] = { missing: true }; continue; }
	const config = join(work, `tsconfig.task${t}.json`);
	writeFileSync(config, JSON.stringify({
		contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'], options: { compiler: '@markless/typescript-plugin/volar-strict' } }],
		compilerOptions: {
			allowImportingTsExtensions: true, jsx: 'preserve', lib: ['ES2023', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'Bundler',
			noEmit: true, plugins: [{ name: '@markless/typescript-plugin' }], skipLibCheck: true, strict: true, target: 'ES2022', types: [],
			paths: { '@markless/device': ['./device/index.d.ts'], '@markless/core': [join(root, 'packages/core/src/index.ts')], '@markless/router': [join(root, 'packages/router/src/index.ts')] },
		},
		include: [`task${t}/**/*`, 'device/*.d.ts'],
	}, null, '\t'));
	let out = '';
	try {
		out = execFileSync('node', [join(root, 'packages/typescript-plugin/src/tsc.ts'), '-p', config], { cwd: root, encoding: 'utf8' });
	} catch (error) {
		out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
	}
	const lines = out.split('\n').filter((line) => line.includes(`/task${t}/`) && line.includes('error'));
	writeFileSync(join(work, `tsc.task${t}.txt`), lines.join('\n'));
	result[t] = { parse: lines.filter((line) => line.includes('TS91001')).length, type: lines.filter((line) => !line.includes('TS91001')).length };
}
writeFileSync(join(work, 'result.json'), JSON.stringify(result));
console.log(JSON.stringify({ label, outName, result }));
