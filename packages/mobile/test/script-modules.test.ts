import { describe, expect, it } from 'vitest';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

// What a handler running as JavaScript takes from other modules: only the statements it reaches, JSON as its value, and
// an ES module build; each refusal names the module and the place.

const files: Record<string, string> = {
	'app/helpers.ts': `export function shout(text: string): string {
	let out = '';
	for (const char of text) out += char.toUpperCase();
	return out + '!';
}
export function retitle(text: string) {
	document.title = text;
}
`,
	'app/drafts.ts': `export function siteFrom(form: HTMLFormElement): string {
	const data = new FormData(form);
	let out = '';
	for (const char of String(data.get('site') ?? '')) out += char.toUpperCase();
	return out;
}
`,
	'app/words.json': '{ "greeting": "hello", "count": 2 }',
	'app/legacy.js': `exports.twice = function (value) { return value * 2; };\n`,
	'app/entries.ts': `export function addEntry(saved: string, site: string): { saved: string; id: string } {
	const id = Date.now().toString(36);
	return { saved: JSON.stringify([{ site, id }, ...JSON.parse(saved)]), id };
}
`,
};
const readModule = (specifier: string) => {
	const filename = `app/${specifier.replace('./', '')}`;
	return filename in files ? { filename, source: files[filename]! } : undefined;
};
const build = (body: string, imports: string) =>
	compileNativeComponent({
		filename: 'app/App.tsrx',
		source: `import { state } from '@markless/core';
${imports}
export default function App() @{
	let text = state('none');
	<button onClick={() => { ${body} }}>{text}</button>
}
`,
		readModule,
	});

describe('modules a JavaScript handler imports', () => {
	it('keeps only what the handler reaches: a helper beside one that touches document is fine', async () => {
		const { payload, diagnostics } = await build(
			'text = shout(words.greeting) + words.count;',
			"import { shout } from './helpers.ts';\nimport words from './words.json';",
		);
		expect(diagnostics).toEqual([]);
		expect(payload!.script!.source).not.toContain('retitle');
		const runtime = createNativeRuntime(payload!, new Map(), {}, undefined, undefined, nodeScriptHost());
		expect(runtime.dispatch({ event: 'activate', host: payload!.events[0]!.host })).toEqual([
			{ op: 'text', node: 'h0:text0', value: 'HELLO!2' },
		]);
	});

	it('refuses the helper that touches document once the handler reaches it, at its own line', async () => {
		const { payload, diagnostics } = await build(
			"retitle('x');",
			"import { retitle } from './helpers.ts';",
		);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => [d.code, d.message, d.primarySpan?.filename])).toEqual([
			[
				'MARKLESS_NATIVE_JAVASCRIPT',
				'app/helpers.ts uses `document`: the web page, which a phone does not have',
				'app/helpers.ts',
			],
		]);
	});

	it('runs the app helper a submit handler calls, through a callback of a child form, as the browser runs it', async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'app/App.tsrx',
			source: `import { state } from '@markless/core';
import { addEntry } from './entries.ts';
function EntryForm({ onSave }: { readonly onSave: (site: string) => void }) @{
	<form
		onSubmit={(event) => {
			event.preventDefault();
			onSave(String(new FormData(event.currentTarget).get('site')));
		}}
	>
		<input name="site" value="North yard" />
		<button>Add</button>
	</form>
}
export default function App() @{
	let saved = state('[]');
	let last = state('');
	<main>
		<EntryForm
			onSave={(site) => {
				const added = addEntry(saved, site);
				saved = added.saved;
				last = added.id;
			}}
		/>
		<p>{last}</p>
		<p>{saved}</p>
	</main>
}
`,
			readModule,
		});
		expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
		const runtime = createNativeRuntime(
			payload!,
			new Map(),
			{},
			undefined,
			undefined,
			nodeScriptHost(),
		);
		const button = payload!.events.find((event) => event.event === 'activate')!.host;
		const before = Date.now();
		const journal = runtime.dispatch({ event: 'activate', host: button });
		const texts = journal.flatMap((entry) => (entry.op === 'text' ? [entry.value] : []));
		expect(texts).toHaveLength(2);
		const [id, saved] = texts as [string, string];
		expect(JSON.parse(saved)).toEqual([{ site: 'North yard', id }]);
		expect(parseInt(id, 36)).toBeGreaterThanOrEqual(before);
	});

	it("reads the submitted form through an app helper that builds FormData from it, as the browser does", async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'app/App.tsrx',
			source: `import { state } from '@markless/core';
import { siteFrom } from './drafts.ts';
export default function App() @{
	let last = state('none');
	<main>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				last = siteFrom(event.currentTarget);
			}}
		>
			<input name="site" value="North yard" />
			<button>Add</button>
		</form>
		<p>{last}</p>
	</main>
}
`,
			readModule,
		});
		expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
		const runtime = createNativeRuntime(payload!, new Map(), {}, undefined, undefined, nodeScriptHost());
		const button = payload!.events.find((event) => event.event === 'activate')!.host;
		const texts = runtime
			.dispatch({ event: 'activate', host: button })
			.flatMap((entry) => (entry.op === 'text' ? [entry.value] : []));
		expect(texts).toEqual(['NORTH YARD']);
	});

	it('builds FormData in a page that is not the first to run its script in a shared engine, as each browser page does', async () => {
		const first = await build("text = String(JSON.parse(text === 'none' ? '1' : '2'));", '');
		const second = await compileNativeComponent({
			filename: 'app/App.tsrx',
			source: `import { state } from '@markless/core';
import { siteFrom } from './drafts.ts';
export default function App() @{
	let last = state('none');
	<main>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				last = siteFrom(event.currentTarget);
			}}
		>
			<input name="site" value="North yard" />
			<button>Add</button>
		</form>
		<p>{last}</p>
	</main>
}
`,
			readModule,
		});
		expect(second.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
		const engine = nodeScriptHost();
		const press = (payload: NonNullable<typeof first.payload>) =>
			createNativeRuntime(payload, new Map(), {}, undefined, undefined, engine)
				.dispatch({ event: 'activate', host: payload.events.find((event) => event.event === 'activate')!.host })
				.flatMap((entry) => (entry.op === 'text' ? [entry.value] : []));
		expect(press(first.payload!)).toEqual(['1']);
		expect(press(second.payload!)).toEqual(['NORTH YARD']);
	});

	it('still refuses that helper where no form is submitted, from a click', async () => {
		const { payload, diagnostics } = await build(
			"text = siteFrom(text as unknown as HTMLFormElement);",
			"import { siteFrom } from './drafts.ts';",
		);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain(
			'app/drafts.ts uses `FormData`: an HTML form, which a phone does not have',
		);
	});

	it('refuses a CommonJS module by name', async () => {
		const { payload, diagnostics } = await build(
			'text = String(twice(2));',
			"import { twice } from './legacy.js';",
		);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			"app/legacy.js is a CommonJS module, which a phone's script does not load; use its ES module build",
		]);
	});
});
