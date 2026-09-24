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

test('a component local beside state is refused; a module lookup keyed by state is routed', async () => {
	const found = await refusals(`import { state } from '@markless/core';
const LABELS: Record<string, string> = { on: 'On', off: 'Off' };
export function Toggle() @{
	let mode = state('on');
	const suffix = '!';
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
	<button data-label={LABELS[mode]} onClick={() => (mode = 'off')}>go</button>
}
`);
	expect(updatesFor(result, 'data-label')[0]?.graphNodeId).toMatch(
		/^computed:templateExpression:/,
	);
});
