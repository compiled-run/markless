import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A `@for` over a collection that is not on the graph renders its rows on the
 * server. A row handler needs its item in the browser, and the item comes from
 * the collection the repeat reads on the graph - so a collection the browser can
 * recompute (module values, props, and body-local consts built from them) is lifted
 * onto the graph, and one it cannot fails the compile instead of leaving every row
 * but the first unwired.
 */
async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/rows.tsrx', source, symbols: [] });
}

const preamble = `import { state } from '@markless/core';\n`;

test('rows over a module constant carry their handler on the repeat record', async () => {
	const result = await compile(`${preamble}
const TONES = [{ id: 'warm', name: 'Warm' }, { id: 'cool', name: 'Cool' }];
export function Tones() @{
	let picked = state('');
	<nav>
		@for (const tone of TONES; key tone.id) {
			<a data-tone={tone.id} onClick={() => (picked = tone.name)}>{tone.name}</a>
		}
		<output>{picked}</output>
	</nav>
}
`);
	const [repeat] = result.protocolView.keyedRepeats ?? [];
	expect(repeat?.collectionGraphNodeId).toMatch(/^computed:/);
	expect(repeat?.rowEvents).toEqual([
		{ hostPath: [], eventName: 'click', symbolIds: ['symbol:0'] },
	]);
	expect(result.semanticGraph.diagnostics).toEqual([]);
});

test('rows over a prop path carry their handler on the repeat record', async () => {
	const result = await compile(`${preamble}
type Group = { readonly entries?: ReadonlyArray<{ readonly key: string; readonly text: string }> };
export function Menu({ group }: { readonly group: Group }) @{
	let chosen = state('');
	<ul>
		@for (const entry of group.entries!; key entry.key) {
			<li><button onClick={() => (chosen = entry.text)}>{entry.text}</button></li>
		}
	</ul>
	<p>{chosen}</p>
}
`);
	const [repeat] = result.protocolView.keyedRepeats ?? [];
	expect(repeat?.collectionGraphNodeId).toMatch(/^computed:/);
	expect(repeat?.rowEvents).toEqual([
		{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:0'] },
	]);
});

test('static rows with no handler stay off the graph', async () => {
	const result = await compile(`
const LINKS = [{ href: '/a', title: 'A' }];
export function Links() @{
	<ul>@for (const link of LINKS; key link.href) { <li><a href={link.href}>{link.title}</a></li> }</ul>
}
`);
	expect(result.protocolView.keyedRepeats ?? []).toEqual([]);
	expect(result.semanticGraph.keyedRepeats[0]).not.toHaveProperty('collectionGraphNodeId');
});

async function load(source: string) {
	const loaded = await import(
		'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
	);
	return Object.values(loaded)[0] as (context: unknown) => unknown;
}

function propReader(props: Record<string, unknown>) {
	return {
		graph: {
			read: (graphNodeId: string, path: ReadonlyArray<string> = []) =>
				graphNodeId.startsWith('prop:')
					? path.reduce<unknown>(
							(value, key) => (value as Record<string, unknown>)?.[key],
							props,
						)
					: undefined,
		},
	};
}

test('rows over a collection read through body-local consts are lifted with those definitions', async () => {
	const result = await compileTsrxModule({
		filename: 'src/rows.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source: `${preamble}
const STORIES = [
	{ id: 'a', people: [{ name: 'Ann' }, { name: 'Bo' }] },
	{ id: 'b', people: [{ name: 'Cy' }] },
];
export function People({ storyId }: { readonly storyId: string }) @{
	const story = STORIES.find((candidate) => candidate.id === storyId)!;
	const cast = story.people;
	let said = state('');
	<div>
		@for (const person of cast; key person.name) {
			<button onClick={() => (said = person.name)}>{person.name}</button>
		}
		<p>{said}</p>
	</div>
}
`,
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const [repeat] = result.protocolView.keyedRepeats ?? [];
	expect(repeat?.collectionGraphNodeId).toMatch(/^computed:/);
	expect(repeat?.rowEvents).toEqual([
		{ hostPath: [], eventName: 'click', symbolIds: ['symbol:0'] },
	]);
	const derive = result.symbolModules.modules.find(
		(module) => module.kind === 'sync-computed-derive' && module.source.includes('STORIES'),
	)!;
	expect(derive.source).not.toMatch(/\b(story|cast)\b/);
	expect((await load(derive.source))(propReader({ storyId: 'b' }))).toEqual([{ name: 'Cy' }]);
});

test('a hand-written computed over a body-local const derives from its definition', async () => {
	const result = await compileTsrxModule({
		filename: 'src/label.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source: `import { computed, state } from '@markless/core';
const SHELVES = [{ key: 'x', title: 'Ex' }, { key: 'y', title: 'Why' }];
export function Shelf({ shelfKey }: { readonly shelfKey: string }) @{
	const shelf = SHELVES.find((entry) => entry.key === shelfKey)!;
	let count = state(0);
	const label = computed(() => \`\${shelf.title} \${count}\`);
	<button onClick={() => count++}>{label}</button>
}
`,
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const derive = result.symbolModules.modules.find(
		(module) => module.kind === 'sync-computed-derive' && module.source.includes('SHELVES'),
	)!;
	expect(derive.source).not.toMatch(/\bshelf\b/);
	const context = {
		graph: {
			read: (graphNodeId: string, path: ReadonlyArray<string> = []) =>
				graphNodeId.startsWith('prop:')
					? path.at(-1) === 'shelfKey'
						? 'y'
						: undefined
					: 3,
		},
	};
	expect((await load(derive.source))(context)).toBe('Why 3');
});

test('a computed over a body local with no recomputable definition fails the compile', async () => {
	const result = await compile(`import { computed, state } from '@markless/core';
export function Clock({ start }: { readonly start: number }) @{
	let offset = start * 2;
	let ticks = state(0);
	const shown = computed(() => ticks + offset);
	<button onClick={() => ticks++}>{shown}</button>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_COMPUTED_READS_RENDER_LOCAL',
			severity: 'error',
			message: expect.stringContaining('`offset`'),
		}),
	]);
});

test('rows whose collection reads a non-recomputable body local fail the compile', async () => {
	const result = await compile(`${preamble}
export function Queue({ seed }: { readonly seed: ReadonlyArray<{ readonly id: string }> }) @{
	let pending = seed.slice();
	let picked = state('');
	<ol>
		@for (const job of pending; key job.id) {
			<li><button onClick={() => (picked = job.id)}>{job.id}</button></li>
		}
	</ol>
	<p>{picked}</p>
}
`);
	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_ROW_HANDLERS_UNWIRED',
			severity: 'error',
			message: expect.stringContaining('`pending`'),
		}),
	]);
});
