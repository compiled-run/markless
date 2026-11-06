import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function errorsOf(source: string) {
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', symbols: [], source });
	return [
		...result.semanticGraph.diagnostics,
		...result.publicRenderPlan.diagnostics,
		...result.publicRenderModule.diagnostics,
		...result.symbolModules.diagnostics,
	]
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);
}

const handlers = {
	arrow: `const add = () => {
		drafts = [...drafts, text];
		text = '';
	};`,
	function: `function add() {
		drafts = [...drafts, text];
		text = '';
	}`,
	async: `const add = async () => {
		const next = await Promise.resolve(text);
		drafts = [...drafts, next];
		text = '';
	};`,

	demo: `const add = () => {
		const value = text.trim();
		if (!value) return;
		drafts = [...drafts, { id: crypto.randomUUID(), title: value }];
		text = '';
	};`,
	asyncDemo: `const add = async () => {
		const value = text.trim();
		if (!value) return;
		await Promise.resolve();
		drafts = [...drafts, value];
		text = '';
	};`,
};

const wrappers = {
	one: { declarations: '', tag: 'Button', imports: '' },
	two: {
		declarations: `function Toolbar({ onAdd }: { onAdd: () => void }) @{
	<div><Button onClick={onAdd}>Add</Button></div>
}`,
		tag: 'Toolbar',
		imports: '',
	},
	imported: { declarations: '', tag: 'Pressable', imports: "import Pressable from './pressable.tsrx';" },
};

function page(handler: string, wrapper: (typeof wrappers)[keyof typeof wrappers]) {
	const prop = wrapper.tag === 'Toolbar' ? 'onAdd' : 'onClick';
	return `import { state } from '@markless/core';
${wrapper.imports}

function Button({ onClick, children }: { onClick: () => void; children?: unknown }) @{
	<button onClick={onClick}>{children}</button>
}
${wrapper.declarations}

export default function Page() @{
	let drafts = state<string[]>([]);
	let text = state('');
	${handler}
	<main>
		<input value={text} onInput={(event) => (text = event.currentTarget.value)} />
		<${wrapper.tag} ${prop}={add}>Add</${wrapper.tag}>
		<p>{drafts.length}</p>
	</main>
}
`;
}

for (const [handlerName, handler] of Object.entries(handlers))
	for (const [wrapperName, wrapper] of Object.entries(wrappers))
		test(`a named ${handlerName} handler passed through ${wrapperName} wrapper compiles`, async () => {
			expect(await errorsOf(page(handler, wrapper))).toEqual([]);
		});

test('inline control: async read under await', async () => {
	expect(
		await errorsOf(
			page('', wrappers.one).replace(
				'onClick={add}',
				"onClick={async () => { const next = await Promise.resolve(text); drafts = [...drafts, next]; text = ''; }}",
			),
		),
	).toEqual([]);
});

async function adviceOf(source: string) {
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', symbols: [], source });
	return result.captureAnalysis.diagnostics
		.filter((diagnostic) => diagnostic.code === 'MARKLESS_CAPTURE_OPAQUE_PROP')
		.flatMap((diagnostic) => diagnostic.suggestions?.map((suggestion) => suggestion.message) ?? []);
}

test('a handler prop with no route says which handler shapes do route', async () => {
	const shapes = [
		page(`let add = () => { drafts = [...drafts, text]; };\n\tadd = () => { text = ''; };`, wrappers.one),
		page(`const make = (value: string) => () => { drafts = [...drafts, value]; };\n\tconst add = make('x');`, wrappers.one),
		page(handlers.arrow, wrappers.one).replace(
			'function Button({ onClick, children }: { onClick: () => void; children?: unknown }) @{\n\t<button onClick={onClick}>{children}</button>',
			'function Button(props: { onClick: () => void; children?: unknown }) @{\n\t<button onClick={props.onClick}>{props.children}</button>',
		),
	];
	for (const source of shapes) {
		const advice = await adviceOf(source);
		expect(advice.length).toBeGreaterThan(0);
		for (const message of advice) {
			expect(message).toContain('declared once in the component body');
			expect(message).not.toContain('constant data');
		}
	}
});
