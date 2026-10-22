import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A handler runs in the browser as its own symbol, with no component body around it.
 * A body `const` it reads is recomputed there from its definition; a local that cannot
 * be recomputed fails the compile instead of emitting a reference to nothing.
 */
async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/story.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source,
	});
}

const webFns = new URL('../../web/src/fns/', import.meta.url).href;

async function load(source: string) {
	const resolved = source.replace(/"@markless\/web\/fns\/([\w-]+)"/g, (_, name: string) =>
		JSON.stringify(`${webFns}${name}.ts`),
	);
	const loaded = await import(
		'data:text/javascript;base64,' + Buffer.from(resolved).toString('base64')
	);
	return Object.values(loaded).find((value) => typeof value === 'function') as (
		context: unknown,
		...args: unknown[]
	) => unknown;
}

function recordingContext(props: Record<string, unknown>) {
	const writes: Array<{ graphNodeId: string; value: unknown }> = [];
	return {
		writes,
		context: {
			graph: {
				read: (graphNodeId: string, path: ReadonlyArray<string> = []) =>
					graphNodeId.startsWith('prop:')
						? path.reduce<unknown>(
								(value, key) => (value as Record<string, unknown>)?.[key],
								props,
							)
						: undefined,
				write: (write: { graphNodeId: string; value: unknown }) => {
					writes.push({ graphNodeId: write.graphNodeId, value: write.value });
				},
			},
		},
	};
}

const preamble = `import { state } from '@markless/core';
const TALES = [{ key: 'a', title: 'Ay' }, { key: 'b', title: 'Bee' }];
`;

test('an event handler reading a body-local const recomputes it from its definition', async () => {
	const result = await compile(`${preamble}
export function Tale({ taleKey }: { readonly taleKey: string }) @{
	const tale = TALES.find((candidate) => candidate.key === taleKey)!;
	const heading = tale.title;
	let said = state('');
	<div>
		<button onClick={() => (said = heading + ':' + tale.key)}>{tale.title}</button>
		<p>{said}</p>
	</div>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	expect(handler.source).not.toMatch(/\b(tale|heading)\b/);
	const { context, writes } = recordingContext({ taleKey: 'b' });
	await (
		await load(handler.source)
	)(context);
	expect(writes).toEqual([{ graphNodeId: 'state:said', value: 'Bee:b' }]);
});

test('a callback prop reading a body-local const recomputes it from its definition', async () => {
	const result = await compile(`${preamble}
function Chooser({ onChoose }: { readonly onChoose: (value: string) => void }) @{
	<button onClick={() => onChoose('!')}>choose</button>
}
export function Shelf({ taleKey }: { readonly taleKey: string }) @{
	const tale = TALES.find((candidate) => candidate.key === taleKey)!;
	let picked = state('');
	<>
		<Chooser onChoose={(mark) => (picked = tale.title + mark)} />
		<p>{picked}</p>
	</>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const callback = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'callback-prop',
	)!;
	expect(callback.source).not.toMatch(/\btale\b/);
	const module = result.symbolModules.modules.find(
		(candidate) => candidate.symbolId === callback.id,
	)!;
	expect(module.source).not.toMatch(/\btale\b/);
	const { context, writes } = recordingContext({ taleKey: 'a' });
	await (
		await load(module.source)
	)({ ...context, args: ['!'] });
	expect(writes).toEqual([{ graphNodeId: 'state:picked', value: 'Ay!' }]);
});

test('a row handler reads both its row item and a body-local const', async () => {
	const result = await compile(`${preamble}
export function Cast({ taleKey }: { readonly taleKey: string }) @{
	const tale = TALES.find((candidate) => candidate.key === taleKey)!;
	const people = state([{ id: 'p' }, { id: 'q' }]);
	let said = state('');
	<>
		<ul>
			@for (const person of people; key person.id) {
				<li><button onClick={() => (said = tale.title + person.id)}>{person.id}</button></li>
			}
		</ul>
		<p>{said}</p>
	</>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	expect(handler.source).not.toMatch(/\btale\b/);
	expect(handler.source).toContain('TALES');
});

test('a handler reading a body local with no recomputable definition fails the compile', async () => {
	for (const [declaration, handlerName] of [
		['let offset = start * 2;', 'onClick'],
		['const [offset] = [start];', 'onInput'],
	] as const) {
		const result = await compile(`import { state } from '@markless/core';
export function Dial({ start }: { readonly start: number }) @{
	${declaration}
	let ticks = state(0);
	<input ${handlerName}={() => (ticks = ticks + offset)} value={ticks} />
}
`);
		expect(result.semanticGraph.diagnostics).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_HANDLER_READS_RENDER_LOCAL',
				severity: 'error',
				message: expect.stringContaining('`offset`'),
			}),
		]);
	}
});

test('a callback prop reading a body local with no recomputable definition fails the compile', async () => {
	const result = await compile(`import { state } from '@markless/core';
function Chooser({ onChoose }: { readonly onChoose: () => void }) @{
	<button onClick={() => onChoose()}>choose</button>
}
export function Shelf({ seed }: { readonly seed: number }) @{
	let bump = seed + 1;
	let total = state(0);
	<>
		<Chooser onChoose={() => (total = total + bump)} />
		<p>{total}</p>
	</>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_HANDLER_READS_RENDER_LOCAL',
			severity: 'error',
			message: expect.stringContaining('`onChoose`'),
		}),
	]);
});

// A function declaration in the body follows the rule an arrow `const` does.
test('a handler named by a body function declaration runs that function in the browser', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Tally() @{
	let said = state('');
	const suffix = '!';
	function shout(event: Event) {
		said = event.type + suffix;
	}
	<div>
		<button onClick={shout}>shout</button>
		<p>{said}</p>
	</div>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
	expect(handler.source).not.toMatch(/\bsuffix\b/);
	const { context, writes } = recordingContext({});
	await (
		await load(handler.source)
	)({ ...context, event: { type: 'click' } });
	expect(writes).toEqual([{ graphNodeId: 'state:said', value: 'click!' }]);
});

test('a handler calling a body function fails the compile, whichever way the function is declared', async () => {
	for (const declaration of [
		'const bump = () => (ticks = ticks + 1);',
		'function bump() { ticks = ticks + 1; }',
	]) {
		const result = await compile(`import { state } from '@markless/core';
export function Dial() @{
	let ticks = state(0);
	${declaration}
	<button onClick={() => bump()}>{ticks}</button>
}
`);
		expect(result.captureAnalysis.diagnostics).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
				severity: 'error',
				message: expect.stringContaining('"bump"'),
			}),
		]);
	}
});
