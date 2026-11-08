import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';

// An `@else if` chain and a condition-case `@switch` are one branch site each, picked by arm index and rebuilt from markup without escalating.

const chainSource = `
import { state } from '@markless/core';

export default function Battery() @{
	let charge = state(80);

	<section>
		@if (charge > 50) {
			<p>Good for hours</p>
		} @else if (charge > 15) {
			<p>Low battery</p>
		} @else {
			<p>Charge now</p>
		}
		<button onClick={() => (charge -= 20)}>Use some</button>
	</section>
}
`;

// Same structure, every name, element, and operator changed: nothing may key off the first fixture.
const alternateChainSource = `
import { state } from '@markless/core';

export function Forecast({ city }: { city: string }) @{
	let temperature = state(12);
	let windy = state(false);

	<article>
		@if (temperature < 0 && !windy) {
			<strong>{city}: freezing</strong>
		} @else if (temperature < 0) {
			<strong>{city}: freezing and windy</strong>
		} @else if (temperature < 18) {
			<em>{city}: cool</em>
		}
		<button onClick={() => (temperature += 10)}>Warmer</button>
		<button onClick={() => (windy = !windy)}>Wind</button>
	</article>
}
`;

const conditionSwitchSource = `
import { state } from '@markless/core';

export default function Battery() @{
	let charge = state(80);

	<section>
		@switch (true) {
			@case charge > 50: { <p>Good for hours</p> }
			@case charge > 15: { <p>Low battery</p> }
			@default: { <p>Charge now</p> }
		}
		<button onClick={() => (charge -= 20)}>Use some</button>
	</section>
}
`;

async function flipModule(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	expect(result.symbolModules.armEscalationCandidates ?? []).toEqual([]);
	const branchModule = result.symbolModules.modules.find(
		(module) => module.kind === 'branch-update',
	);
	expect(branchModule).toBeDefined();
	const imported = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(branchModule!.source)}`
	)) as Record<string, (context: unknown) => { arm: number; html: string; resolved: boolean }>;
	const run = imported[branchModule!.exportName]!;
	const pick = (index: number) => run({ graph: { read: () => index } });
	return { result, pick };
}

test('an @else if chain is one branch site picked by an index computed over every test', async () => {
	const graph = await buildSemanticGraph({ filename: 'src/Battery.tsrx', source: chainSource });
	expect(graph.branchSites).toHaveLength(1);
	const [site] = graph.branchSites;
	expect(site).toMatchObject({
		kind: 'if',
		armCount: 3,
		armTests: [0, 1, 2],
		testSource: 'charge > 50, charge > 15',
		armIndexSource: '(charge > 50) ? 0 : (charge > 15) ? 1 : 2',
	});
	const computed = graph.graphBindings.find((binding) => binding.id === site!.testComputedGraphNodeId);
	expect(computed).toMatchObject({
		kind: 'computed',
		functionSource: '() => (charge > 50) ? 0 : (charge > 15) ? 1 : 2',
		dependencies: [{ source: 'charge', graphNodeId: 'state:charge', path: [] }],
	});
	const slot = graph.markup.chunks
		.flatMap((chunk) => chunk.slots)
		.find((candidate) => candidate.kind === 'branch');
	expect(slot).toMatchObject({
		armTemplateIds: [
			`branch:${site!.id}:arm:0`,
			`branch:${site!.id}:arm:1`,
			`branch:${site!.id}:arm:2`,
		],
	});
	expect(
		graph.markup.chunks
			.filter((chunk) => chunk.id.startsWith(`branch:${site!.id}:arm:`))
			.map((chunk) => chunk.statics.join('')),
	).toEqual(['<p>Good for hours</p>', '<p>Low battery</p>', '<p>Charge now</p>']);
});

test('the chain flip module rebuilds the indexed arm from compiled markup, never by escalation', async () => {
	const { result, pick } = await flipModule('src/Battery.tsrx', chainSource);
	expect(result.protocolView.branches?.[0]).toEqual(
		expect.objectContaining({
			armTests: [0, 1, 2],
			testReads: [expect.objectContaining({ graphNodeId: 'computed:templateExpression:0' })],
		}),
	);
	expect(pick(0)).toEqual({ arm: 0, html: '<p>Good for hours</p>', resolved: true });
	expect(pick(1)).toEqual({ arm: 1, html: '<p>Low battery</p>', resolved: true });
	expect(pick(2)).toEqual({ arm: 2, html: '<p>Charge now</p>', resolved: true });
});

test('a chain with no final @else ends in an empty arm the index computed answers when every test fails', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Forecast.tsrx',
		source: alternateChainSource,
	});
	expect(graph.branchSites).toHaveLength(1);
	const [site] = graph.branchSites;
	expect(site).toMatchObject({
		kind: 'if',
		armCount: 3,
		armTests: [0, 1, 2, 3],
		armIndexSource:
			'(temperature < 0 && !windy) ? 0 : (temperature < 0) ? 1 : (temperature < 18) ? 2 : 3',
	});
	const computed = graph.graphBindings.find((binding) => binding.id === site!.testComputedGraphNodeId);
	expect(computed?.dependencies?.map((dependency) => dependency.graphNodeId)).toEqual([
		'state:temperature',
		'state:windy',
	]);
	const { result, pick } = await flipModule('src/Forecast.tsrx', alternateChainSource);
	expect(result.renderData?.branches[0]).toEqual(
		expect.objectContaining({ declaredEmptyArms: [3] }),
	);
	expect(pick(2).html).toContain(': cool</em>');
	expect(pick(3)).toEqual({ arm: 3, html: '', resolved: true });
});

test('a @switch whose case tests are expressions is picked by an index computed, like switch compares them', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Battery.tsrx',
		source: conditionSwitchSource,
	});
	expect(graph.branchSites).toHaveLength(1);
	const [site] = graph.branchSites;
	expect(site).toMatchObject({
		kind: 'switch',
		armCount: 3,
		armTests: [0, 1, 2],
		testSource: 'true',
		armIndexSource: '(true) === (charge > 50) ? 0 : (true) === (charge > 15) ? 1 : 2',
	});
	expect(site!.propTest).toBeUndefined();
	const computed = graph.graphBindings.find((binding) => binding.id === site!.testComputedGraphNodeId);
	expect(computed?.dependencies).toEqual([
		{ source: 'charge', graphNodeId: 'state:charge', path: [] },
	]);
	const { result, pick } = await flipModule('src/Battery.tsrx', conditionSwitchSource);
	expect(result.protocolView.branches?.[0]).toEqual(
		expect.objectContaining({ armTests: [0, 1, 2] }),
	);
	expect(pick(1)).toEqual({ arm: 1, html: '<p>Low battery</p>', resolved: true });
	expect(pick(2)).toEqual({ arm: 2, html: '<p>Charge now</p>', resolved: true });
});

test('a @switch with no @default and a non-literal case answers one past the last arm when nothing matches', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Mode.tsrx',
		source: `
import { state } from '@markless/core';
const NIGHT = 'night';
export function Mode() @{
	let mode = state('day');
	<div>
		@switch (mode) {
			@case NIGHT: { <i>night</i> }
			@case 'day': { <b>day</b> }
		}
	</div>
}
`,
	});
	expect(graph.branchSites[0]).toMatchObject({
		kind: 'switch',
		armTests: [0, 1],
		armIndexSource: "(mode) === (NIGHT) ? 0 : (mode) === ('day') ? 1 : 2",
	});
});

test('a plain @if/@else and a literal-case @switch keep their value-picked arms', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Plain.tsrx',
		source: `
import { state } from '@markless/core';
export function Plain() @{
	let open = state(false);
	let kind = state('a');
	<div>
		@if (open) { <p>open</p> } @else { <p>closed</p> }
		@switch (kind) {
			@case 'a': { <p>A</p> }
			@default: { <p>D</p> }
		}
	</div>
}
`,
	});
	expect(graph.branchSites).toHaveLength(2);
	expect(graph.branchSites[0]).toMatchObject({ kind: 'if', armCount: 2, testSource: 'open' });
	expect(graph.branchSites[0]!.armTests).toBeUndefined();
	expect(graph.branchSites[0]!.armIndexSource).toBeUndefined();
	expect(graph.branchSites[1]).toMatchObject({ kind: 'switch', armTests: ['a', null] });
	expect(graph.branchSites[1]!.armIndexSource).toBeUndefined();
});

test('a @switch whose index computed cannot be minted never reads the bare discriminant against arm indexes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Tabs.tsrx',
		source: `
import { state } from '@markless/core';
export function Tabs() @{
	let tab = state('b');
	const first = () => 'a';
	<nav>
		@switch (tab) {
			@case first(): { <i>first</i> }
			@case 'b': { <b>second</b> }
			@default: { <u>other</u> }
		}
	</nav>
}
`,
		symbols: [],
	});
	const [site] = result.semanticGraph.branchSites;
	expect(site).toMatchObject({ armTests: [0, 1, 2], testSource: 'tab' });
	expect(site!.testComputedGraphNodeId).toBeUndefined();
	expect(result.protocolView.branches?.[0]?.testReads ?? []).toEqual([]);
	expect(result.renderData?.branches[0]).toEqual(
		expect.objectContaining({
			testReads: [],
			armIndexSource: "(tab) === (first()) ? 0 : (tab) === ('b') ? 1 : 2",
		}),
	);
});
