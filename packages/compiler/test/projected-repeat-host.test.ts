import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import type { ModuleGraphInterfaceArtifact } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A construct written inside a child's `{children}` is markup the consumer
// renders and the child splices into its own element. A `@for` there has rows
// that belong to an element the consumer never wrote, so the record has to say
// so: resume finds the rows by looking their parent up, and pointed at the
// consumer's enclosing element it keys no served row and grows the list beside
// the child instead of into it. A branch locates by its own comment anchors,
// which travel inside the projection, so it needs no retarget. Both spellings
// of the tag (an identifier, or a member off a barrel) reach the same child.

type Hole = {
	readonly name: string;
	readonly child: string;
	readonly parentHostNodeId: string;
	readonly rowStartOffset: number | undefined;
	readonly insideConstruct: boolean;
};

const holes: ReadonlyArray<Hole> = [
	{
		name: 'a hole at the root of the element',
		child: `export function Panel({ children, ...rest }) @{
	<ol {...rest} ui-panel="">{children}</ol>
}`,
		parentHostNodeId: 'c0:h0',
		rowStartOffset: undefined,
		insideConstruct: false,
	},
	{
		name: 'a hole behind elements the child renders first',
		child: `export function Panel({ children, ...rest }) @{
	<ol {...rest} ui-panel=""><li ui-heading="">rows</li>{children}</ol>
}`,
		parentHostNodeId: 'c0:h0',
		rowStartOffset: 1,
		insideConstruct: false,
	},
	{
		name: 'a hole inside a construct of the child',
		child: `import { state } from '@markless/core';
export function Panel({ children, ...rest }) @{
	const box = state({ open: true });
	<div {...rest} ui-panel=""><p>lead</p>@if (box.open) { <ol ui-list="">{children}</ol> } @else { <p>closed</p> }</div>
}`,
		parentHostNodeId: 'c0:h2',
		rowStartOffset: undefined,
		insideConstruct: true,
	},
];

const constructs = {
	'@for': `@for (const row of box.rows; key row.id) { <li>{row.id}</li> }`,
	'@if': `@if (box.open) { <li>open</li> } @else { <li>shut</li> }`,
	'@switch': `@switch (box.kind) {
				@case 'x': { <li>x</li> }
				@default: { <li>other</li> }
			}`,
} as const;

const spellings = {
	identifier: { importLine: `import { Panel } from './panel.tsrx';`, tag: 'Panel' },
	member: { importLine: `import { ui } from './index.ts';`, tag: 'ui.panel' },
} as const;

function pageWith(spelling: keyof typeof spellings, body: string, enclosed = true) {
	const tag = `<${spellings[spelling].tag}>
			${body}
		</${spellings[spelling].tag}>`;
	return `${spellings[spelling].importLine}
import { state } from '@markless/core';

export function Page() @{
	const box = state({ rows: [{ id: 'a' }, { id: 'b' }], open: true, kind: 'x' });

	${enclosed ? `<main>${tag}</main>` : tag}
}`;
}

async function compileConsumer(
	hole: Hole,
	spelling: keyof typeof spellings,
	body: string,
	enclosed = true,
) {
	const consumer = await compileConsumerModule(hole.child, spelling, body, enclosed);
	expect(
		consumer.semanticGraph.diagnostics.filter((entry) => entry.severity === 'error'),
	).toEqual([]);
	return consumer;
}

async function compileConsumerModule(
	child: string,
	spelling: keyof typeof spellings,
	body: string,
	enclosed = true,
) {
	const [panel] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/panel.tsrx', source: child, importSource: './panel.tsrx' },
	]);
	// The barrel is what makes `ui` an object of components: `<ui.panel>` links to `Panel`.
	const barrel: ModuleGraphInterfaceArtifact = {
		passId: 'module-graph-interface',
		filename: 'src/index.ts',
		exports: [],
		linkedComponents: [
			{
				exportPath: ['ui', 'panel'],
				source: './panel.tsrx',
				importKind: 'named',
				importedName: 'Panel',
				componentName: 'Panel',
			},
		],
		render: { version: 1, components: [] },
	};
	return compileTsrxModule({
		filename: 'src/page.tsrx',
		source: pageWith(spelling, body, enclosed),
		symbols: [],
		importedModuleInterfaces: {
			'./panel.tsrx': panel!.moduleGraphInterface,
			'./index.ts': barrel,
		},
	});
}

function projectionSlotKinds(consumer: Awaited<ReturnType<typeof compileConsumer>>) {
	return consumer.semanticGraph.markup.chunks
		.filter((chunk) => chunk.kind === 'component-projection')
		.map((chunk) => chunk.slots.map((slot) => slot.kind));
}

for (const hole of holes) {
	for (const spelling of Object.keys(spellings) as ReadonlyArray<keyof typeof spellings>) {
		test(`@for under an ${spelling} tag, ${hole.name}: rows anchor on the element the child wraps its hole in`, async () => {
			const consumer = await compileConsumer(hole, spelling, constructs['@for']);
			expect(projectionSlotKinds(consumer)).toEqual([['repeat']]);
			const [repeat] = consumer.protocolView.keyedRepeats ?? [];
			expect(repeat?.parentHostNodeId).toBe(hole.parentHostNodeId);
			expect(repeat?.ownerHostNodeId).toBe('h0');
			expect(repeat?.rowStartOffset).toBe(hole.rowStartOffset);
		});

		for (const construct of ['@if', '@switch'] as const) {
			test(`${construct} under an ${spelling} tag, ${hole.name}: the branch anchors inside the projection`, async () => {
				const consumer = await compileConsumer(hole, spelling, constructs[construct]);
				expect(projectionSlotKinds(consumer)).toEqual([['branch']]);
				expect(consumer.protocolView.branches).toHaveLength(1);
				expect(consumer.protocolView.keyedRepeats ?? []).toEqual([]);
			});
		}
	}
}

const repeatedHoles = {
	'a row element around the hole': `import { state } from '@markless/core';
export function Panel({ children, ...rest }) @{
	const box = state({ slots: [{ id: 's1' }, { id: 's2' }] });
	<ol {...rest} ui-panel="">@for (const slot of box.slots; key slot.id) { <li ui-slot="">{children}</li> }</ol>
}`,
	'a heading before the hole in each row': `import { state } from '@markless/core';
export function Panel({ children, ...rest }) @{
	const cells = state([{ key: 'x' }]);
	<section {...rest} ui-panel=""><h2 ui-title="">rows</h2>@for (const cell of cells; key cell.key) { <div ui-cell=""><p ui-lead="">{cell.key}</p>{children}</div> }</section>
}`,
} as const;

for (const [shape, child] of Object.entries(repeatedHoles)) {
	for (const spelling of Object.keys(spellings) as ReadonlyArray<keyof typeof spellings>) {
		test(`@for under an ${spelling} tag into ${shape} the child repeats is refused by name`, async () => {
			const consumer = await compileConsumerModule(child, spelling, constructs['@for']);
			const refusals = consumer.semanticGraph.diagnostics.filter(
				(entry) => entry.code === 'MARKLESS_PROJECTED_REPEAT_HOLE_REPEATED',
			);
			expect(refusals).toHaveLength(1);
			expect(refusals[0]?.severity).toBe('error');
			expect(refusals[0]?.message).toContain('<Panel>');
			expect(refusals[0]?.message).toContain('box.rows');
			expect(refusals[0]?.primarySpan).toBeDefined();
			const [repeat] = consumer.semanticGraph.keyedRepeats;
			expect(repeat?.parentHostNodeId).toBe('h0');
			expect(repeat?.ownerHostNodeId).toBeUndefined();
		});
	}
}

test('a @for projected into a hole the child does not repeat raises no refusal', async () => {
	const consumer = await compileConsumer(holes[2]!, 'identifier', constructs['@for']);
	expect(consumer.semanticGraph.diagnostics.map((entry) => entry.code)).not.toContain(
		'MARKLESS_PROJECTED_REPEAT_HOLE_REPEATED',
	);
});

// A sibling the CONSUMER writes before the loop, inside the same children, is
// counted from the projection chunk. A plain element counts as one; a component
// part's element count is only known while rendering, so `rowStartOffset` comes
// out 'unknown' and `resumableKeyedRepeats` (protocol-view.ts) drops the record
// rather than pair a key with the wrong element. The rows the server sent then
// render and never grow, and nothing says so. Red until the prefix is counted
// (or the drop is announced).
test.fails('a part written before a projected repeat leaves the repeat in the protocol view', async () => {
	const consumer = await compileConsumer(
		holes[0]!,
		'identifier',
		`<Panel data-lead="">lead</Panel>
			${constructs['@for']}`,
	);
	expect(consumer.protocolView.keyedRepeats ?? []).toHaveLength(1);
});

test('a plain element written before a projected repeat stands in front of the rows', async () => {
	const consumer = await compileConsumer(
		holes[0]!,
		'identifier',
		`<p>lead</p>
		${constructs['@for']}`,
	);
	const [repeat] = consumer.protocolView.keyedRepeats ?? [];
	expect(repeat?.parentHostNodeId).toBe('c0:h0');
	expect(repeat?.rowStartOffset).toBe(1);
});

test('a repeat under the consumer’s own element inside the projection keeps that element', async () => {
	const consumer = await compileConsumer(
		holes[0]!,
		'identifier',
		`<ul>@for (const row of box.rows; key row.id) { <li>{row.id}</li> }</ul>`,
	);
	const [repeat] = consumer.protocolView.keyedRepeats ?? [];
	expect(repeat?.parentHostNodeId).toBe('h1');
	expect(repeat?.ownerHostNodeId).toBeUndefined();
});

for (const spelling of Object.keys(spellings) as ReadonlyArray<keyof typeof spellings>) {
	test(`@for under an ${spelling} tag that is the component root: rows anchor on the child's element`, async () => {
		const consumer = await compileConsumer(holes[0]!, spelling, constructs['@for'], false);
		expect(projectionSlotKinds(consumer)).toEqual([['repeat']]);
		const [repeat] = consumer.protocolView.keyedRepeats ?? [];
		expect(repeat?.parentHostNodeId).toBe('c0:h0');
		expect(repeat?.ownerHostNodeId).toBeUndefined();
	});
}
