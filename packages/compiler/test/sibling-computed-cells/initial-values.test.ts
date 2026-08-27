import { expect, test } from 'vitest';
import { compileModule } from './support.ts';

/**
 * The browser evaluator seeds a component's render from the initial-value list
 * keyed by graph node id. When two components declared one state name, that list
 * spelled one id twice and a positional partition had to hand each definition the
 * right half. With a distinct id per declaring component the partition has an
 * unambiguous key; each definition must still carry only its own value.
 */

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

test('same-named sibling state keeps its own initial value under its own key', async () => {
	const compiled = await compileModule(
		'pages/same-name.tsrx',
		`import { state } from '@markless/core';

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
	);
	const definitions = compiled.publicRenderModule.componentDefinitions;

	expect(constantsFor(definitions, 'SameNameLeft', 'state:SameNameLeft.report')).toEqual([0]);
	expect(constantsFor(definitions, 'SameNameRight', 'state:SameNameRight.report')).toEqual([10]);
});

// A definition carrying an initial value it never declared is the module's
// standing behaviour for any id only one component spells, and seeding a cell
// nothing on that definition reads is idempotent. The value that matters is that
// neither component can be seeded from the OTHER one's declaration.
test('neither sibling can be seeded from the other declaration', async () => {
	const compiled = await compileModule(
		'pages/same-name.tsrx',
		`import { state } from '@markless/core';

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
	);
	const initialValues = compiled.renderData.initialValues.map((initial) => initial.graphNodeId);

	expect(initialValues).toContain('state:SameNameLeft.report');
	expect(initialValues).toContain('state:SameNameRight.report');
	expect(initialValues).not.toContain('state:report');
});
