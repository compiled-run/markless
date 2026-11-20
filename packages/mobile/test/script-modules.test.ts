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
	'app/words.json': '{ "greeting": "hello", "count": 2 }',
	'app/legacy.js': `exports.twice = function (value) { return value * 2; };\n`,
	'app/where.ts': `export function where(): string {
	if (import.meta.env.SSR) {
		void import('./server.ts');
		return 'server';
	}
	return import.meta.env.MODE + ' ' + import.meta.env.BASE_URL;
}
export function located(): string {
	return import.meta.url;
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
		const runtime = createNativeRuntime(
			payload!,
			new Map(),
			{},
			undefined,
			undefined,
			nodeScriptHost(),
		);
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

	it('reads import.meta.env as the web client build has it, and leaves out the server-only branch', async () => {
		const { payload, diagnostics } = await build(
			"text = where() + (import.meta.env.DEV ? ' dev' : ' prod') + (!import.meta.env.PROD || '!') + import.meta.env.VITE_UNSET;",
			"import { where } from './where.ts';",
		);
		expect(diagnostics).toEqual([]);
		expect(payload!.script!.source).not.toContain('import(');
		const runtime = createNativeRuntime(
			payload!,
			new Map(),
			{},
			undefined,
			undefined,
			nodeScriptHost(),
		);
		expect(runtime.dispatch({ event: 'activate', host: payload!.events[0]!.host })).toEqual([
			{ op: 'text', node: 'h0:text0', value: 'production / prod!undefined' },
		]);
	});

	it('refuses import.meta beyond its env by name, at its own line', async () => {
		const { payload, diagnostics } = await build(
			'text = located();',
			"import { located } from './where.ts';",
		);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => [d.message, d.primarySpan?.filename])).toEqual([
			["app/where.ts uses `import.meta`, which a phone's script cannot run", 'app/where.ts'],
		]);
	});
});
