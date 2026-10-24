/**
 * A template expression that names a module constant beside a graph read is
 * still a graph read: the module binding is a value the derive symbol carries,
 * not a dependency. Several interpolations in one host's text ship ONE update
 * carrying the joined text instead of one whole-text write each.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

function updatesFor(
	result: Awaited<ReturnType<typeof compile>>,
	targetName: string,
): ReadonlyArray<{ readonly graphNodeId: string; readonly symbolId?: string }> {
	return result.protocolView.domUpdates.filter(
		(update) => update.target?.kind === 'attribute' && update.target.name === targetName,
	);
}

function deriveSourceOf(result: Awaited<ReturnType<typeof compile>>, graphNodeId: string): string {
	const computed = result.protocolState.computed?.find(
		(record) => record.graphNodeId === graphNodeId,
	);
	const module = result.symbolModules.modules.find(
		(candidate) => candidate.symbolId === computed?.deriveSymbolId,
	);
	if (!module) throw new Error(`No derive symbol for ${graphNodeId}.`);
	return module.source;
}

test('an attribute comparing state against an imported constant member updates', async () => {
	const result = await compile(`import { state } from '@markless/core';
import { TABS } from './data.ts';
export function Tabs() @{
	let selected = state('first');
	<button aria-selected={selected === TABS[1].id ? 'true' : 'false'} onClick={() => (selected = TABS[1].id)}>go</button>
}
`);
	const [update] = updatesFor(result, 'aria-selected');
	expect(update?.graphNodeId).toMatch(/^computed:templateExpression:/);
	const derive = deriveSourceOf(result, update!.graphNodeId);
	expect(derive).toContain('import { TABS }');
	expect(derive).toContain('context.graph.read("state:selected")');
});

test('same-file constants in attributes are values, not dependencies', async () => {
	const result = await compile(`import { state } from '@markless/core';
const LIMIT: number = 3;
const LABELS = { full: 'yes', open: 'no' };
export function Stepper() @{
	let steps = state(0);
	<button data-full={steps >= LIMIT ? LABELS.full : LABELS.open} data-left={LIMIT - steps} onClick={() => steps++}>+</button>
}
`);
	for (const name of ['data-full', 'data-left']) {
		const [update] = updatesFor(result, name);
		expect(update?.graphNodeId).toMatch(/^computed:templateExpression:/);
		const computed = result.protocolState.computed?.find(
			(record) => record.graphNodeId === update!.graphNodeId,
		);
		expect(computed?.dependencies).toEqual([{ graphNodeId: 'state:steps', path: [] }]);
		expect(deriveSourceOf(result, update!.graphNodeId)).toContain('const LIMIT = 3;');
	}
});

test('an imported constant in a joined text stays out of the dependencies', async () => {
	const result = await compile(`import { state } from '@markless/core';
import { UNIT } from './units.ts';
export function Meter() @{
	let level = state(2);
	<meter onClick={() => level++}>{level} {UNIT} of {level * 10}</meter>
}
`);
	const texts = result.protocolView.domUpdates.filter((update) => update.target?.kind === 'text');
	expect(texts).toHaveLength(1);
	const derive = deriveSourceOf(result, texts[0]!.graphNodeId);
	expect(derive).toContain('import { UNIT }');
	expect(derive).toContain(`\`\${context.graph.read("state:level") ?? ''} \${UNIT ?? ''} of `);
});

test('several interpolations in one host text ship one joined update', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Triple() @{
	let first = state(1);
	let second = state('b');
	let third = state(3);
	<p onClick={() => { first++; third++; }}>{first}|{second} \`$ and {third}</p>
}
`);
	const texts = result.protocolView.domUpdates.filter((update) => update.target?.kind === 'text');
	expect(texts).toHaveLength(1);
	const [text] = texts;
	expect(text!.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(text!.target).toEqual({ kind: 'text' });
	const computed = result.protocolState.computed?.find(
		(record) => record.graphNodeId === text!.graphNodeId,
	);
	expect(computed?.dependencies).toEqual([
		{ graphNodeId: 'state:first', path: [] },
		{ graphNodeId: 'state:second', path: [] },
		{ graphNodeId: 'state:third', path: [] },
	]);
});

async function refusals(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	return result.semanticGraph.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_TEMPLATE_EXPRESSION_UNSUPPORTED',
	);
}

test('a helper call over state in an attribute or text is refused, not rendered once', async () => {
	const found = await refusals(`import { state } from '@markless/core';
import { normalize, label } from './names.ts';
export function Editor() @{
	let draft = state('x');
	<form onInput={(event) => (draft = event.target.value)}>
		<button disabled={normalize(draft) === ''}>save</button>
		<output>{label(draft)}</output>
	</form>
}
`);
	expect(found.map((diagnostic) => [diagnostic.severity, diagnostic.message])).toEqual([
		['error', expect.stringContaining("`normalize(draft) === ''`")],
		['error', expect.stringContaining('`label(draft)`')],
	]);
});

test('a reassignable component local beside state is refused; a const local and a module lookup keyed by state are routed', async () => {
	const found = await refusals(`import { state } from '@markless/core';
const LABELS: Record<string, string> = { on: 'On', off: 'Off' };
export function Toggle() @{
	let mode = state('on');
	let suffix = '!';
	<button data-label={LABELS[mode]} title={mode + suffix} onClick={() => (mode = 'off')}>go</button>
}
`);
	expect(found.map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('`mode + suffix`'),
	]);
	const result = await compile(`import { state } from '@markless/core';
const LABELS: Record<string, string> = { on: 'On', off: 'Off' };
export function Toggle() @{
	let mode = state('on');
	const suffix = '!';
	<button data-label={LABELS[mode]} title={mode + suffix} onClick={() => (mode = 'off')}>go</button>
}
`);
	expect(updatesFor(result, 'data-label')[0]?.graphNodeId).toMatch(
		/^computed:templateExpression:/,
	);
	const title = updatesFor(result, 'title')[0]?.graphNodeId;
	expect(title).toMatch(/^computed:templateExpression:/);
	expect(deriveSourceOf(result, title!)).toContain(`context.graph.read("state:mode") + '!'`);
});

test('projected children beside an interpolation are markup, never joined into its text', async () => {
	const result = await compile(`import { computed, state } from '@markless/core';
export function Box({ children }) @{
	const code = state({ value: '' });
	const char = computed(() => code.value.slice(0, 1));
	<div onClick={() => (code.value = 'x')}>{char}{children}</div>
}
`);
	const texts = result.protocolView.domUpdates.filter((update) => update.target?.kind === 'text');
	expect(texts.find((update) => update.source === 'char')?.graphNodeId).toBe('computed:char');
	expect(
		texts.some((update) => update.graphNodeId.startsWith('computed:templateExpression:')),
	).toBe(false);
});

test('a standard global conversion called on state is a read the page keeps current', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Menu() @{
	let open = state(false);
	let count = state(2);
	<button aria-expanded={String(open)} data-count={Number(count) + 1} onClick={() => (open = !open)}>{encodeURIComponent(String(count))}</button>
}
`);
	const [expanded] = updatesFor(result, 'aria-expanded');
	expect(expanded?.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(deriveSourceOf(result, expanded!.graphNodeId)).toContain(
		'String(context.graph.read("state:open"))',
	);
	expect(updatesFor(result, 'data-count')[0]?.graphNodeId).toMatch(
		/^computed:templateExpression:/,
	);
	const texts = result.protocolView.domUpdates.filter((update) => update.target?.kind === 'text');
	expect(texts[0]?.graphNodeId).toMatch(/^computed:templateExpression:/);
});

test('a local function named like a global conversion is still refused', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
function String(value: unknown) { return value ? 'yes' : 'no'; }
export function Menu() @{
	let open = state(false);
	<button aria-expanded={String(open)} onClick={() => (open = !open)}>menu</button>
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_TEMPLATE_EXPRESSION_UNSUPPORTED',
	);
});

test('top-level markup indexing a body const by state is routed, as it is inside an @if', async () => {
	const result = await compile(`import { state } from '@markless/core';
const SWATCHES: Record<string, { tone: string }> = { bar: { tone: 'warm' }, area: { tone: 'cool' } };
export function Chart() @{
	const classes: Record<string, string> = { bar: 'is-bar', area: 'is-area' };
	const legends: Record<string, { caption: string }> = { bar: { caption: 'Bars' }, area: { caption: 'Areas' } };
	const grid: Record<string, string[]> = { bar: ['b0', 'b1'], area: ['a0', 'a1'] };
	const order = ['one', 'two'];
	let kind = state('bar');
	let index = state(0);
	let picks = state(['x', 'y']);
	<figure class={classes[kind]} title={legends[kind].caption} data-opt={classes?.[kind]} data-cell={grid[kind][index]} data-join={order[index] + '!'} data-tone={SWATCHES[kind].tone} data-pick={picks[index]} onClick={() => (kind = 'area')}>{classes[kind]}</figure>
}
`);
	const expected: Record<string, ReadonlyArray<string>> = {
		class: ['state:kind'],
		title: ['state:kind'],
		'data-opt': ['state:kind'],
		'data-cell': ['state:kind', 'state:index'],
		'data-join': ['state:index'],
		'data-tone': ['state:kind'],
		'data-pick': ['state:picks', 'state:index'],
	};
	const updates = result.protocolView.domUpdates;
	for (const [name, dependencies] of Object.entries(expected)) {
		const update = updates.find((candidate) =>
			name === 'class'
				? candidate.target?.kind === 'class'
				: candidate.target?.kind === 'attribute' && candidate.target.name === name,
		);
		expect(update?.graphNodeId, name).toMatch(/^computed:templateExpression:/);
		const computed = result.protocolState.computed?.find(
			(record) => record.graphNodeId === update!.graphNodeId,
		);
		expect(
			computed?.dependencies.map((dependency) => dependency.graphNodeId),
			name,
		).toEqual(dependencies);
	}
	expect(
		deriveSourceOf(result, updates.find((u) => u.target?.kind === 'class')!.graphNodeId),
	).toContain(`{ bar: 'is-bar', area: 'is-area' }[context.graph.read("state:kind")]`);
	const text = updates.find((update) => update.target?.kind === 'text');
	expect(text?.graphNodeId).toMatch(/^computed:templateExpression:/);
});

test('a reassignable body local indexed by state is still refused', async () => {
	const found = await refusals(`import { state } from '@markless/core';
export function Chart() @{
	let classes: Record<string, string> = { bar: 'is-bar', area: 'is-area' };
	let kind = state('bar');
	<figure class={classes[kind]} data-caption={classes[kind].length} onClick={() => (kind = 'area')}>x</figure>
}
`);
	expect(found.map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('`classes[kind]`'),
		expect.stringContaining('`classes[kind].length`'),
	]);
});
