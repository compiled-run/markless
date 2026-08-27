import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Two components of one module may each declare the same state name. Each such
// name mints its own graph node id under the declaring component, and the
// browser evaluator seeds its render from this list keyed by that id, so a
// component definition must carry the initial value it declared under its own key.

type InitialValue = {
	readonly graphNodeId: string;
	readonly value:
		| { readonly kind: 'constant'; readonly value: unknown }
		| { readonly kind: 'symbol-function'; readonly symbolId: string };
};

function constantsFor(
	definitions: ReadonlyArray<Readonly<Record<string, unknown>>>,
	componentName: string,
	graphNodeId: string,
): unknown[] {
	const definition = definitions.find((candidate) => candidate.name === componentName);
	if (!definition) throw new Error(`Expected a definition for ${componentName}.`);
	return ((definition.initialValues ?? []) as ReadonlyArray<InitialValue>).flatMap((initial) =>
		initial.graphNodeId === graphNodeId && initial.value.kind === 'constant'
			? [initial.value.value]
			: [],
	);
}

test('same-module components declaring one state name keep their own initial value', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/same-name.tsrx',
		source: `import { state } from '@markless/core';

function SameNameLeft() @{
	let report = state(0);
	<button type="button" onClick={() => { report++; }}>{report}</button>
}

function SameNameRight() @{
	let report = state(10);
	<button type="button" onClick={() => { report += 2; }}>{report}</button>
}

export default function SameNamePage() @{
	<section><SameNameLeft /><SameNameRight /></section>
}`,
		symbols: [],
	});
	const definitions = result.publicRenderModule.componentDefinitions;

	expect(constantsFor(definitions, 'SameNameLeft', 'state:SameNameLeft.report')).toEqual([0]);
	expect(constantsFor(definitions, 'SameNameRight', 'state:SameNameRight.report')).toEqual([
		10,
	]);
});

// Same structural pattern, different names, element, value kinds, declaration
// order, and component count: the separation must come from the declaring
// component, not from anything spelled in the fixture above.
test('each initial value stays with its own part in a differently shaped module', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/alternate.tsrx',
		source: `import { state } from '@markless/core';

function AlternateThird() @{
	let label = state('gamma');
	let onlyHere = state(7);
	<span onClick={() => { label = 'delta'; }}>{label}{onlyHere}</span>
}

function AlternateSecond() @{
	let label = state('beta');
	<span onClick={() => { label = 'epsilon'; }}>{label}</span>
}

function AlternateFirst() @{
	let label = state('alpha');
	<span onClick={() => { label = 'zeta'; }}>{label}</span>
}

export default function AlternatePage() @{
	<article><AlternateThird /><AlternateSecond /><AlternateFirst /></article>
}`,
		symbols: [],
	});
	const definitions = result.publicRenderModule.componentDefinitions;

	expect(constantsFor(definitions, 'AlternateThird', 'state:AlternateThird.label')).toEqual([
		'gamma',
	]);
	expect(constantsFor(definitions, 'AlternateSecond', 'state:AlternateSecond.label')).toEqual([
		'beta',
	]);
	expect(constantsFor(definitions, 'AlternateFirst', 'state:AlternateFirst.label')).toEqual([
		'alpha',
	]);
	// A name only one component spells keeps its bare key.
	expect(constantsFor(definitions, 'AlternateThird', 'state:onlyHere')).toEqual([7]);
});
