import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	compileNativeComponent,
	createNativeRuntime,
	nativeAppConformance,
	nativeConformance,
	nativeStyleInput,
} from '../src/index.ts';
import { APP_CONFORMANCE_CASES, CONFORMANCE_CASES } from './conformance-cases.ts';
import { scrollVectors } from '../src/scroll.ts';
import { SCROLL_CASES } from './scroll-cases.ts';
import { appCaseVector, caseVector, CONFORMANCE_ENGINE_FILES } from './conformance-build.ts';

const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const committed = (name: string) =>
	JSON.parse(readFileSync(new URL(`../conformance/${name}`, import.meta.url), 'utf8')) as unknown;

describe('native conformance vectors', () => {
	it('the committed scroll-into-view vectors are what the reference computes (ladder-web checks them against Chrome)', () => {
		expect(committed('scroll/scroll-into-view.json')).toEqual(scrollVectors(SCROLL_CASES));
	});

	it('the committed counter vectors are what the compiler and the reference runtime produce today', async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'src/counter.tsrx',
			source: fixture('Counter.tsrx'),
		});
		expect(diagnostics).toEqual([]);
		const vectors = nativeConformance(payload!, CONFORMANCE_CASES[0]!.actions);
		expect(vectors.initial).toEqual([
			['h1:text0', 'Counter'],
			['h2:text0', 'Count 0'],
		]);
		expect(vectors.steps.map((step) => step.journal)).toEqual([
			[{ op: 'text', node: 'h2:text0', value: 'Count 1' }],
			[{ op: 'text', node: 'h2:text0', value: 'Count 2' }],
		]);
		expect(committed('counter.json')).toEqual(vectors);
	});

	it('every committed vector file matches a fresh build (rewrite with test/write-conformance.ts)', async () => {
		for (const entry of CONFORMANCE_CASES)
			expect(committed(`${entry.name}.json`), entry.name).toEqual(await caseVector(entry));
	});

	it('every committed navigation vector file matches a fresh build of its app', async () => {
		for (const entry of APP_CONFORMANCE_CASES)
			expect(committed(`${entry.name}.json`), entry.name).toEqual(await appCaseVector(entry));
	});

	it('the committed engine files are the engine the hosts put back in each vector', () => {
		for (const [name, text] of Object.entries(CONFORMANCE_ENGINE_FILES))
			expect(readFileSync(new URL(`../conformance/${name}`, import.meta.url), 'utf8'), name).toBe(text);
	});

	it('navigation: a row link opens its row, Back shows the list as it was left, replace drops the screen it leaves', () => {
		const orders = committed('navigation.json') as ReturnType<typeof nativeAppConformance>;
		expect(orders.steps.map((step) => step.stack)).toEqual([
			['/orders'],
			['/orders', '/orders/42'],
			['/orders'],
			['/orders', '/orders/108'],
		]);
		expect(orders.steps.map((step) => step.title)).toEqual([
			'Orders',
			'Order 42',
			'Orders',
			'Order 108',
		]);
		expect(orders.steps[2]!.journal).toEqual([]);
		const replaced = committed('navigation-replace.json') as ReturnType<
			typeof nativeAppConformance
		>;
		expect(replaced.steps.map((step) => step.stack)).toEqual([
			['/', '/welcome'],
			['/', '/dashboard'],
			['/'],
		]);
		const deep = committed('navigation-deep-link.json') as ReturnType<
			typeof nativeAppConformance
		>;
		expect(deep.initial.stack).toEqual(['/', '/orders', '/orders/42']);
	});

	it('contextmenu: a long press reaches the element pressed, then each element it is inside, with its place', () => {
		const vectors = committed('contextmenu.json') as ReturnType<typeof nativeConformance>;
		expect(vectors.steps.map((step) => step.journal)).toEqual([
			[
				{ op: 'text', node: 'h1:text0', value: 'Apple at 40,120' },
				{ op: 'text', node: 'h6:text0', value: ' list:inner@900' },
			],
			[{ op: 'text', node: 'h6:text0', value: ' list:inner@900 list:self@1500' }],
			[
				{
					op: 'text',
					node: 'h6:text0',
					value: ' list:inner@900 list:self@1500 pad:52.5 pad:300',
				},
			],
			[
				{ op: 'text', node: 'h1:text0', value: 'Pear at 41,160' },
				{
					op: 'text',
					node: 'h6:text0',
					value: ' list:inner@900 list:self@1500 pad:52.5 pad:300 list:inner@2600',
				},
			],
		]);
	});

	it('journals only the text nodes whose string changed, in document order', () => {
		const runtime = createNativeRuntime({
			version: 'markless.native-view/0',
			component: 'Pair',
			cells: [
				{ id: 'state:a', name: 'a', initial: 1 },
				{ id: 'state:b', name: 'b', initial: 'fixed' },
			],
			nodes: [
				{ kind: 'element', id: 'h0', element: 'div', parent: null },
				{ kind: 'text', id: 'h0:text0', parent: 'h0', parts: [{ cell: 'state:b' }] },
				{
					kind: 'text',
					id: 'h0:text1',
					parent: 'h0',
					parts: [{ text: 'a=' }, { cell: 'state:a' }],
				},
			],
			events: [{ host: 'h0', event: 'activate', handler: 'handler:x' }],
			handlers: [
				{
					id: 'handler:x',
					ops: [
						{
							op: 'assign',
							cell: 'state:a',
							value: {
								binary: '-',
								left: { cell: 'state:a' },
								right: { literal: 1 },
							},
						},
						{
							op: 'assign',
							cell: 'state:a',
							value: {
								binary: '-',
								left: { cell: 'state:a' },
								right: { literal: 1 },
							},
						},
					],
				},
			],
		});
		expect(runtime.dispatch({ event: 'activate', host: 'h0' })).toEqual([
			{ op: 'text', node: 'h0:text1', value: 'a=-1' },
		]);
	});
});

describe('native style input', () => {
	it('hands Dragon the counter tree, its first texts and the scoped CSS the compiler wrote', async () => {
		const build = await compileNativeComponent({
			filename: 'src/counter.tsrx',
			source: fixture('Counter.tsrx'),
		});
		const input = nativeStyleInput(build.payload!, build.styles);
		expect(input.nodes.filter((node) => node.kind === 'text')).toEqual([
			{ kind: 'text', id: 'h1:text0', parent: 'h1', text: 'Counter' },
			{ kind: 'text', id: 'h2:text0', parent: 'h2', text: 'Count 0' },
		]);
		const scope = build.styles[0]!.scopeId;
		expect(input.nodes[3]).toMatchObject({
			id: 'h2',
			element: 'button',
			attributes: { class: `tap ${scope}` },
		});
		expect(input.css).toContain(`.tap.${scope}`);
	});
});

describe('imported components', () => {
	it('builds a component imported from another file in place, its callback resolved to the caller', async () => {
		const read = (specifier: string) => {
			const filename = join(import.meta.dirname, 'fixtures', specifier);
			return { filename, source: readFileSync(filename, 'utf8') };
		};
		const build = await compileNativeComponent({
			filename: join(import.meta.dirname, 'fixtures', 'Basket.tsrx'),
			source: fixture('Basket.tsrx'),
			readModule: read,
		});
		expect(build.diagnostics).toEqual([]);
		const runtime = createNativeRuntime(build.payload!);
		expect(runtime.texts().map(([, text]) => text)).toEqual(['Apples 0', 'Add one Apples']);
		const button = build.payload!.events[0]!.host;
		expect(runtime.dispatch({ event: 'activate', host: button })).toEqual([
			{ op: 'text', node: 'component-edge:0/h1:text0', value: 'Apples 1' },
		]);
	});

	it('refuses an imported component when the build cannot read its module', async () => {
		const build = await compileNativeComponent({
			filename: 'src/Basket.tsrx',
			source: fixture('Basket.tsrx'),
		});
		expect(build.payload).toBeNull();
		expect(build.diagnostics.map((d) => d.message)).toContain(
			'<Stepper>, a component from another module',
		);
	});
});

describe('@else if chains and @switch', () => {
	const arms = async (source: string, clicks: number) => {
		const build = await compileNativeComponent({ filename: 'src/Pick.tsrx', source });
		expect(build.diagnostics).toEqual([]);
		const runtime = createNativeRuntime(build.payload!);
		const shown = [
			runtime
				.texts()
				.map(([, text]) => text)
				.join(' | '),
		];
		for (let i = 0; i < clicks; i++) {
			runtime.dispatch({ event: 'activate', host: build.payload!.events[0]!.host });
			shown.push(
				runtime
					.texts()
					.map(([, text]) => text)
					.join(' | '),
			);
		}
		return shown;
	};

	it('shows the first arm whose test holds, and none when a chain has no @else', async () => {
		expect(
			await arms(
				`import { state } from '@markless/core';
export function Pick() @{
	let n = state(0);
	<div>
		<button onClick={() => n++}>Next</button>
		@if (n === 1) { <p>one</p> } @else if (n === 2) { <p>two</p> } @else if (n < 1) { <p>none yet</p> }
	</div>
}`,
				3,
			),
		).toEqual(['Next | none yet', 'Next | one', 'Next | two', 'Next']);
	});

	it('matches @switch cases with ===, and falls to @default wherever it is written', async () => {
		expect(
			await arms(
				`import { state } from '@markless/core';
export function Pick() @{
	let tab = state('a');
	<div>
		<button onClick={() => (tab = tab === 'a' ? 'b' : tab === 'b' ? 'z' : 'a')}>Next</button>
		@switch (tab) {
			@default: {
				<p>other</p>
			}
			@case 'a': {
				<p>first</p>
			}
			@case 'b': {
				<p>second</p>
			}
		}
	</div>
}`,
				3,
			),
		).toEqual(['Next | first', 'Next | second', 'Next | other', 'Next | first']);
	});
});

describe('state inside child components', () => {
	it('gives each instance its own cells', async () => {
		const build = await compileNativeComponent({
			filename: 'src/Panels.tsrx',
			source: `import { state } from '@markless/core';
function Panel({ title }) @{
	let open = state(false);
	<section>
		<p>{title}</p>
		<button onClick={() => (open = !open)}>{open ? 'open' : 'shut'}</button>
	</section>
}
export function Panels() @{
	<main>
		<Panel title="A" />
		<Panel title="B" />
	</main>
}`,
		});
		expect(build.diagnostics).toEqual([]);
		expect(build.payload!.cells.map((cell) => cell.id)).toEqual([
			'component-edge:0/state:open',
			'component-edge:1/state:open',
		]);
		const runtime = createNativeRuntime(build.payload!);
		runtime.dispatch({ event: 'activate', host: build.payload!.events[1]!.host });
		expect(runtime.texts().map(([, text]) => text)).toEqual(['A', 'shut', 'B', 'open']);
	});
});

describe('several expressions in one text run', () => {
	it('builds each part, as the web joins them', async () => {
		const build = await compileNativeComponent({
			filename: 'src/Joined.tsrx',
			source: `import { state } from '@markless/core';
function Panel({ title }) @{
	let open = state(false);
	<button onClick={() => (open = !open)}>{title} is {open ? 'open' : 'shut'}{open && '!'}{open ? null : '.'}</button>
}
export function Page() @{
	<main><Panel title="Door" /></main>
}`,
		});
		expect(build.diagnostics).toEqual([]);
		const runtime = createNativeRuntime(build.payload!);
		expect(runtime.texts().map(([, text]) => text)).toEqual(['Door is shutfalse.']);
		runtime.dispatch({ event: 'activate', host: build.payload!.events[0]!.host });
		expect(runtime.texts().map(([, text]) => text)).toEqual(['Door is open!']);
	});
});

describe('computed values', () => {
	it('inlines a sync computed wherever it is read, a computed of a computed included', async () => {
		const build = await compileNativeComponent({
			filename: 'src/Cart.tsrx',
			source: `import { computed, state } from '@markless/core';
export function Cart() @{
	let items = state(1);
	const total = computed(() => items * 3);
	const label = computed(() => {
		return total > 5 ? 'big' : 'small';
	});
	<main>
		<p>{total} {label}</p>
		@if (total > 5) { <p>Free shipping</p> }
		<button onClick={() => items++}>Add</button>
	</main>
}`,
		});
		expect(build.diagnostics).toEqual([]);
		const runtime = createNativeRuntime(build.payload!);
		expect(runtime.texts().map(([, text]) => text)).toEqual(['3 small', 'Add']);
		runtime.dispatch({ event: 'activate', host: build.payload!.events[0]!.host });
		expect(runtime.texts().map(([, text]) => text)).toEqual(['6 big', 'Free shipping', 'Add']);
	});

	it('refuses an async computed by name', async () => {
		const build = await compileNativeComponent({
			filename: 'src/Late.tsrx',
			source: `import { computed, state } from '@markless/core';
export function Late() @{
	let n = state(1);
	const later = computed(async () => n + 1);
	<p>{n}</p>
	<button onClick={() => n++}>Add {later}</button>
}`,
		});
		expect(build.payload).toBeNull();
	});
});
