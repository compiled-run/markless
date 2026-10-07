import { describe, expect, it } from 'vitest';
import { compileFiles, entryFile } from './compile.ts';
import { firstSentence } from './editor.ts';
import { exportTarget, runtimeImportCall } from './frame-runtime.ts';
import { blockStyles, createLinker, moduleKey, type LinkHost } from './link.ts';
import type { CompiledModule } from './protocol.ts';
import { nodeSourceHost } from './node-sources.ts';
import { groupProblems } from './session.ts';

const host = nodeSourceHost();

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
const badgeCounter = `import { state } from '@markless/core';

function Badge({ value }: { value: number }) @{
	<strong>{value}</strong>
}

export default function BadgeCounter() @{
	let count = state(0);
	<button onClick={() => count++}>Add</button>
	<Badge value={count} />
}
`;
// A run-shared global (`??=`) caching an import of the runtime, as the list and computed starters emit.
const notePanel = `import { computed, state } from '@markless/core';

export default function NotePanel() @{
	let note = state('');
	const long = computed(() => note.length > 20);

	<section>
		<input value={note} onInput={(event) => (note = event.currentTarget.value)} />
		@if (long) {
			<p>That is a long note.</p>
		} @else {
			<p>Short and sweet.</p>
		}
	</section>
}
`;
const shoppingList = `import { state } from '@markless/core';

export default function ShoppingList() @{
	let items = state([{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }]);

	<section>
		<ul>
			@for (const item of items; key item.id) {
				<li>{item.name}</li>
			} @empty {
				<li>Nothing.</li>
			}
		</ul>
		<button onClick={() => (items = [...items].sort((x, y) => x.name.localeCompare(y.name)))}>Sort</button>
	</section>
}
`;
const faq = (from: string, family: string) => `import { ${family} } from '${from}';

export default function Faq() @{
	const items = [{ value: 'a', q: 'One?', a: 'Yes.' }, { value: 'b', q: 'Two?', a: 'No.' }];
	<${family}.root value="a">
		@for (const item of items; key item.value) {
			<${family}.item value={item.value}>
				<${family}.itemlabel>
					<${family}.itemtrigger>{item.q}</${family}.itemtrigger>
				</${family}.itemlabel>
				<${family}.itemcontent>{item.a}</${family}.itemcontent>
			</${family}.item>;
		}
	</${family}.root>;
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
		dynamicImport: (specifier) => `load(${specifier})`,
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
			host,
		);
		if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
		expect(outcome.entry).toBe('/code/Panel.tsrx');
		const ids = outcome.modules.map((module) => module.id);
		expect(ids).toContain('/code/math.ts');
		expect(outcome.modules.find((module) => module.id === '/code/math.ts')?.code).not.toContain(
			': number',
		);
		const style = outcome.modules.find((module) => module.kind === 'style');
		expect(style?.code).toContain('color: teal');
		const specifiers = outcome.modules.flatMap((module) =>
			module.imports.map((site) => site.specifier),
		);
		expect(specifiers).toContain('/code/math.ts');
	});

	it('reports a build error with the file, line and column it names', async () => {
		const outcome = await compileFiles(
			[{ name: 'Panel.tsrx', code: panel.replace('state(1)', '1') }],
			'test',
			host,
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
			host,
		);
		expect(syntax.ok).toBe(false);
		if (!syntax.ok) expect(syntax.diagnostics[0]?.message).toMatch(/^MARKLESS_PARSE_ERROR/);
		const helper = await compileFiles(
			[
				{ name: 'Panel.tsrx', code: panel },
				{ name: 'math.ts', code: 'export const = ;' },
			],
			'test',
			host,
		);
		expect(helper.ok).toBe(false);
		if (!helper.ok) expect(helper.diagnostics[0]?.file).toBe('math.ts');
	});

	it('asks for a .tsrx entry when a block has none', async () => {
		expect(entryFile([{ name: 'a.ts', code: '' }])).toBeUndefined();
		const outcome = await compileFiles([{ name: 'a.ts', code: 'export {};' }], 'test', host);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.diagnostics[0]?.message).toMatch(/one \.tsrx file/);
	});
});

/** Links every compiled module, so a missing module or an import cycle fails the test. */
async function linkEveryModule(
	outcome: Extract<Awaited<ReturnType<typeof compileFiles>>, { ok: true }>,
) {
	const links = textHost();
	const linker = createLinker(outcome.modules, links);
	for (const module of outcome.modules) await linker.url(module.id);
	const entry = outcome.modules.find((module) => module.id === outcome.entry)!;
	return { links, entry };
}

describe('components from another file or package', () => {
	it('links an @markless/ui family imported from the package', async () => {
		const outcome = await compileFiles(
			[{ name: 'faq.tsrx', code: faq('@markless/ui', 'accordion') }],
			'test',
			host,
		);
		if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
		const { links, entry } = await linkEveryModule(outcome);
		expect(entry.code).toMatch(/renderData: marklessPrerenderData/);
		const ids = outcome.modules.map((module) => module.id);
		expect(ids.some((id) => id.endsWith('/accordion/accordion.tsrx?markless-symbols'))).toBe(
			true,
		);
		for (const code of links.made) expect(code).not.toMatch(/\bimport\s*\(/);
	});

	it("reports a family subpath import with the compiler's own fix", async () => {
		const outcome = await compileFiles(
			[{ name: 'faq.tsrx', code: faq('@markless/ui/accordion', 'accordion') }],
			'test',
			host,
		);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok)
			expect(outcome.diagnostics[0]).toMatchObject({
				file: 'faq.tsrx',
				line: 1,
				message: expect.stringMatching(/^MARKLESS_UI_IMPORT_SHAPE/),
			});
	});

	it('links a child component from a second .tsrx file of the block', async () => {
		const outcome = await compileFiles(
			[
				{
					name: 'Counter.tsrx',
					code: `import { state } from '@markless/core';
import Shown from './Shown.tsrx';

export default function Counter() @{
	let count = state(0);
	<section>
		<button onClick={() => count++}>Add</button>
		<Shown value={count} />
	</section>
}
`,
				},
				{
					name: 'Shown.tsrx',
					code: `export default function Shown({ value }: { value: number }) @{
	<output>{value}</output>
}
`,
				},
			],
			'test',
			host,
		);
		if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
		const { entry } = await linkEveryModule(outcome);
		expect(entry.code).toMatch(/renderData: marklessPrerenderData/);
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
			host,
		);
		if (!outcome.ok) throw new Error('compile failed');
		const links = textHost();
		const linker = createLinker(outcome.modules, links);
		const url = await linker.url(outcome.entry);
		const entry = links.made[Number(url.slice('mod:'.length))] ?? '';
		expect(entry).toMatch(/from "(mod:\d+|runtime:@markless\/[^"]+)"/);
		expect(entry).not.toMatch(/from "virtual:/);
		expect(linker.styles.join('')).toContain('color: teal');
		for (const code of links.made)
			expect(code).not.toMatch(/(from|import) ["']\.\/math\.ts["']/);
	});

	it('gives the frame the styles of a child component the runtime links on its own', async () => {
		const outcome = await compileFiles(
			[
				{
					name: 'Page.tsrx',
					code: "import Card from './Card.tsrx';\n\nexport default function Page() @{\n\t<Card />\n}\n",
				},
				{
					name: 'Card.tsrx',
					code: 'export default function Card() @{\n\t<p class="card">card<style>.card { color: plum; }</style></p>\n}\n',
				},
			],
			'test',
			host,
		);
		if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
		const linker = createLinker(outcome.modules, textHost());
		await linker.url(outcome.entry);
		expect(blockStyles(outcome.modules)).toContain('color: plum');
	});

	it('turns a dynamic import into the host call and links each module once', async () => {
		const code =
			'import a from "/code/a.ts"; import b from "\\0/code/a.ts"; const later = import("/code/a.ts");';
		const span = (text: string, from = 0) => ({
			start: code.indexOf(text, from),
			end: code.indexOf(text, from) + text.length,
		});
		const modules: CompiledModule[] = [
			{
				id: '/code/App.tsrx',
				kind: 'script',
				code,
				imports: [
					{ ...span('import("/code/a.ts")'), specifier: '/code/a.ts', dynamic: true },
					{ ...span('"\\0/code/a.ts"'), specifier: '\0/code/a.ts', dynamic: false },
					{ ...span('"/code/a.ts"'), specifier: '/code/a.ts', dynamic: false },
				],
			},
			{ id: '/code/a.ts', kind: 'script', code: 'export default 1;', imports: [] },
		];
		const links = textHost();
		await createLinker(modules, links).url('/code/App.tsrx');
		expect(links.made).toEqual([
			'export default 1;',
			'import a from "mod:0"; import b from "mod:0"; const later = load("/code/a.ts");',
		]);
	});

	it('routes every import(), computed ones included, through the host so no virtual id is fetched raw', async () => {
		const outcome = await compileFiles(
			[{ name: 'badge-counter.tsrx', code: badgeCounter }],
			'test',
			host,
		);
		if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
		const links = textHost();
		const linker = createLinker(outcome.modules, links);
		const pending = [outcome.entry];
		const seen = new Set<string>();
		while (pending.length > 0) {
			const specifier = pending.pop()!;
			if (seen.has(specifier)) continue;
			seen.add(specifier);
			await linker.url(specifier);
			for (const code of links.made) {
				for (const [, named] of code.matchAll(/"(virtual:markless:[^"]+)"/g))
					pending.push(named!);
			}
		}
		const resolver = links.made.find((code) => code.includes('loadBoundSymbol')) ?? '';
		expect(resolver).not.toBe('');
		for (const code of links.made) {
			expect(code).not.toMatch(/\bimport\s*\(/);
			expect(code).not.toMatch(/from\s*["']virtual:/);
		}
		expect(resolver).toMatch(/load\(\(moduleUrls\[row\[0\]\]\)\)/);
		expect([...seen].filter((id) => id.startsWith('virtual:markless:symbol:'))).toHaveLength(2);
	});

	it('imports the runtime through a loader every later run can still call', async () => {
		for (const [name, code] of [
			['note-panel.tsrx', notePanel],
			['shopping-list.tsrx', shoppingList],
		] as const) {
			const outcome = await compileFiles([{ name, code }], 'test', host);
			if (!outcome.ok) throw new Error(JSON.stringify(outcome.diagnostics));
			const made: string[] = [];
			const linker = createLinker(outcome.modules, {
				url: (text) => (made.push(text), `mod:${made.length - 1}`),
				runtime: (specifier) =>
					specifier.startsWith('@markless/')
						? Promise.resolve(`runtime:${specifier}`)
						: undefined,
				dynamicImport: (expression, specifier) =>
					runtimeImportCall(specifier) ?? `run0.load(${expression})`,
			});
			await linker.url(outcome.entry);
			const installs = made
				.flatMap((text) => text.split('\n'))
				.filter((line) => /globalThis\.__markless\w+ \?\?=/.test(line));
			expect(installs.length).toBeGreaterThan(0);
			for (const line of installs) expect(line).not.toContain('run0');
			expect(installs.join('\n')).toMatch(
				/__marklessCodeRuntimeImport\("@markless\/web\/fns\/[\w-]+"\)/,
			);
		}
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
				code: 'import "b.ts";',
				imports: [{ start: 7, end: 13, specifier: 'b.ts', dynamic: false }],
			},
			{
				id: 'b.ts',
				kind: 'script',
				code: 'import "a.ts";',
				imports: [{ start: 7, end: 13, specifier: 'a.ts', dynamic: false }],
			},
		];
		await expect(createLinker(cycle, host).url('a.ts')).rejects.toThrow(/cycle/);
	});

	it("reads a module id with or without the bundler's \\0 mark as the same module", () => {
		expect(
			['\0virtual:markless:payload:A.tsrx', 'virtual:markless:payload:A.tsrx'].map(moduleKey),
		).toEqual(Array(2).fill('virtual:markless:payload:A.tsrx'));
		expect(moduleKey('/code/a.ts?markless-symbols')).toBe('/code/a.ts?markless-symbols');
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
