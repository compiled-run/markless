import { describe, expect, it } from 'vitest';
import { compileFiles, entryFile } from './compile.ts';
import { firstSentence } from './editor.ts';
import { exportTarget } from './frame-runtime.ts';
import { createLinker, moduleKey, type LinkHost } from './link.ts';
import type { CompiledModule } from './protocol.ts';
import { groupProblems } from './session.ts';

const panel = `import { state } from '@markless/core';
import { twice } from './math.ts';

export default function Panel() @{
	let n = state(1);

	<section class="panel">
		<output>{n}</output>
		<button onClick={() => (n = twice(n))}>Double</button>
		<style>.panel { color: teal; }</style>
	</section>
}
`;
const math = 'export function twice(value: number): number {\n\treturn value * 2;\n}\n';

/** A host whose URLs are the module text itself, so a test can read what was linked. */
function textHost(): LinkHost & { readonly made: string[] } {
	const made: string[] = [];
	return {
		made,
		url(code) {
			made.push(code);
			return `mod:${made.length - 1}`;
		},
		runtime: (specifier) =>
			specifier.startsWith('@markless/')
				? Promise.resolve(`runtime:${specifier}`)
				: undefined,
		dynamicImport: (specifier) => `load(${JSON.stringify(specifier)})`,
	};
}

describe('compileFiles', () => {
	it('compiles the .tsrx entry, its virtual modules, its styles and a stripped .ts helper', async () => {
		const outcome = await compileFiles(
			[
				{ name: 'Panel.tsrx', code: panel },
				{ name: 'math.ts', code: math },
			],
			'test',
		);
		if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
		expect(outcome.entry).toBe('Panel.tsrx');
		const ids = outcome.modules.map((module) => module.id);
		expect(ids).toContain('math.ts');
		expect(outcome.modules.find((module) => module.id === 'math.ts')?.code).not.toContain(
			': number',
		);
		const style = outcome.modules.find((module) => module.kind === 'style');
		expect(style?.code).toContain('color: teal');
		const specifiers = outcome.modules.flatMap((module) =>
			module.imports.map((site) => site.specifier),
		);
		expect(specifiers).toContain('./math.ts');
	});

	it('reports a build error with the file, line and column it names', async () => {
		const outcome = await compileFiles(
			[{ name: 'Panel.tsrx', code: panel.replace('state(1)', '1') }],
			'test',
		);
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		const stale = outcome.diagnostics.find((problem) =>
			problem.message.startsWith('MARKLESS_STATE_STALE_LOCAL_WRITE'),
		);
		expect(stale).toMatchObject({ file: 'Panel.tsrx', line: 9 });
		expect(stale?.column).toBeGreaterThan(1);
	});

	it('reports a syntax error and a broken helper against their own files', async () => {
		const syntax = await compileFiles(
			[{ name: 'Panel.tsrx', code: panel.replace('</section>', '') }],
			'test',
		);
		expect(syntax.ok).toBe(false);
		if (!syntax.ok) expect(syntax.diagnostics[0]?.message).toMatch(/^MARKLESS_PARSE_ERROR/);
		const helper = await compileFiles(
			[
				{ name: 'Panel.tsrx', code: panel },
				{ name: 'math.ts', code: 'export const = ;' },
			],
			'test',
		);
		expect(helper.ok).toBe(false);
		if (!helper.ok) expect(helper.diagnostics[0]?.file).toBe('math.ts');
	});

	it('asks for a .tsrx entry when a block has none', async () => {
		expect(entryFile([{ name: 'a.ts', code: '' }])).toBeUndefined();
		const outcome = await compileFiles([{ name: 'a.ts', code: 'export {};' }], 'test');
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.diagnostics[0]?.message).toMatch(/one \.tsrx file/);
	});
});

describe('createLinker', () => {
	it('rewrites every reachable specifier to a URL, runtime imports included, and collects styles', async () => {
		const outcome = await compileFiles(
			[
				{ name: 'Panel.tsrx', code: panel },
				{ name: 'math.ts', code: math },
			],
			'test',
		);
		if (!outcome.ok) throw new Error('compile failed');
		const host = textHost();
		const linker = createLinker(outcome.modules, host);
		const url = await linker.url(outcome.entry);
		const entry = host.made[Number(url.slice('mod:'.length))] ?? '';
		expect(entry).toMatch(/from "(mod:\d+|runtime:@markless\/[^"]+)"/);
		expect(entry).not.toMatch(/from "virtual:/);
		expect(linker.styles.join('')).toContain('color: teal');
		for (const code of host.made)
			expect(code).not.toMatch(/(from|import) ["']\.\/math\.ts["']/);
	});

	it('turns a dynamic import into the host call and links each module once', async () => {
		const code =
			'import a from "./a.ts"; import b from "/code/a.ts"; const later = import("./a.ts");';
		const span = (text: string, from = 0) => ({
			start: code.indexOf(text, from),
			end: code.indexOf(text, from) + text.length,
		});
		const modules: CompiledModule[] = [
			{
				id: 'App.tsrx',
				kind: 'script',
				code,
				imports: [
					{ ...span('import("./a.ts")'), specifier: './a.ts', dynamic: true },
					{ ...span('"/code/a.ts"'), specifier: '/code/a.ts', dynamic: false },
					{ ...span('"./a.ts"'), specifier: './a.ts', dynamic: false },
				],
			},
			{ id: 'a.ts', kind: 'script', code: 'export default 1;', imports: [] },
		];
		const host = textHost();
		await createLinker(modules, host).url('App.tsrx');
		expect(host.made).toEqual([
			'export default 1;',
			'import a from "mod:0"; import b from "mod:0"; const later = load("./a.ts");',
		]);
	});

	it('names a missing module and a cycle', async () => {
		const host = textHost();
		const missing: CompiledModule[] = [
			{
				id: 'A.tsrx',
				kind: 'script',
				code: 'import "./b.ts";',
				imports: [{ start: 7, end: 15, specifier: './b.ts', dynamic: false }],
			},
		];
		await expect(createLinker(missing, host).url('A.tsrx')).rejects.toThrow(
			/Cannot import "\.\/b\.ts"/,
		);
		const cycle: CompiledModule[] = [
			{
				id: 'a.ts',
				kind: 'script',
				code: 'import "./b.ts";',
				imports: [{ start: 7, end: 15, specifier: './b.ts', dynamic: false }],
			},
			{
				id: 'b.ts',
				kind: 'script',
				code: 'import "./a.ts";',
				imports: [{ start: 7, end: 15, specifier: './a.ts', dynamic: false }],
			},
		];
		await expect(createLinker(cycle, host).url('a.ts')).rejects.toThrow(/cycle/);
	});

	it('reads ./x, /code/x and x?query as the same module', () => {
		expect(['./a.ts', '/code/a.ts', 'a.ts?markless-symbols', 'a.ts'].map(moduleKey)).toEqual(
			Array(4).fill('a.ts'),
		);
		expect(moduleKey('virtual:markless:payload:A.tsrx')).toBe(
			'virtual:markless:payload:A.tsrx',
		);
	});
});

describe('exportTarget', () => {
	it('maps exact and starred package exports', () => {
		const exports = {
			'.': './src/index.ts',
			'./fns/*': './src/fns/*.ts',
			'./a/*/b': './src/a/*.ts',
		};
		expect(exportTarget(exports, '.')).toBe('./src/index.ts');
		expect(exportTarget(exports, './fns/direct')).toBe('./src/fns/direct.ts');
		expect(exportTarget(exports, './a/x/b')).toBe('./src/a/x.ts');
		expect(exportTarget(exports, './missing')).toBeUndefined();
	});
});

describe('problem display', () => {
	it('groups one message reported on several lines', () => {
		const at = (line: number, message = 'M: one.') => ({
			file: 'A.tsrx',
			line,
			column: 1,
			message,
		});
		const groups = groupProblems([at(3), at(5), at(3, 'N: two.')]);
		expect(groups.map((group) => group.places.map((place) => place.line))).toEqual([
			[3, 5],
			[3],
		]);
	});

	it('keeps the code and first sentence for the note under a line', () => {
		expect(firstSentence('CODE: Cannot write to "cups". Move it.')).toBe(
			'CODE: Cannot write to "cups".',
		);
		expect(firstSentence('No full stop')).toBe('No full stop');
		expect(firstSentence('Reads a.b first. Then more.')).toBe('Reads a.b first.');
	});
});
