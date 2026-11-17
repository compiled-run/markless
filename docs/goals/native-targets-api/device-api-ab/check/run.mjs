// Type-checks answer code against one signature sheet with the repo's Markless-aware tsc.
// usage: node check/run.mjs <sheet-label> <out-name> <markdown files...>
// Each fenced block becomes a file: named by a first-line `// file: taskN/name.ext` or `// src/name.ext` comment, else taskN/App.tsrx.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '../../../../..');
const [label, outName, ...files] = process.argv.slice(2);
const work = join(here, 'work', outName);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'device'), { recursive: true });
writeFileSync(join(work, 'device', 'index.d.ts'), readFileSync(join(here, '..', 'sheets', `${label}.d.ts`), 'utf8'));

for (const file of files) {
	const text = readFileSync(file, 'utf8');
	let task = basename(file).match(/task(\d)/)?.[1];
	const sections = text.split(/^#+ .*?Task (\d)\b.*$/im);
	const chunks = task ? [[task, text]] : [];
	if (!task) for (let i = 1; i < sections.length; i += 2) chunks.push([sections[i], sections[i + 1]]);
	for (const [t, body] of chunks) {
		let n = 0;
		for (const m of body.matchAll(/```(tsrx|tsx|ts|typescript)?\n([\s\S]*?)```/g)) {
			const code = m[2];
			const first = code.split('\n')[0];
			const named = first.match(/\/\/\s*(?:file:\s*)?(?:task\d\/)?(?:src\/)?([\w.-]+\.(?:tsrx|ts))\s*$/);
			const ext = m[1] === 'ts' || m[1] === 'typescript' ? 'ts' : 'tsrx';
			const name = named ? named[1] : n++ === 0 ? `App.${ext}` : `Extra${n}.${ext}`;
			mkdirSync(join(work, `task${t}`), { recursive: true });
			writeFileSync(join(work, `task${t}`, name), code);
		}
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
			paths: { '@markless/device': ['./device/index.d.ts'], '@markless/core': [join(root, 'packages/core/src/index.ts')] },
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
