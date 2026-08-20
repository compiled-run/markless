import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A composite expression (ternary, comparison, template literal) over a shared
// instance read has to become one synthetic computed exactly like the same
// expression over a component-local state cell, or nothing subscribes it to the
// shared cell and the rendered value never follows a write.
const compositeSource = `
import { computed, shared, state } from '@markless/core';

export const box = shared(
	() => {
		const inner = state({ checked: false });
		const label = computed(() => (inner.checked === true ? 'on' : 'off'));

		return {
			...inner,
			label,
			toggle() {
				inner.checked = inner.checked === true ? false : true;
			},
		};
	},
	{ scope: 'widget' },
);

export function App() @{
	const handle = box();

	<div>
		<button
			type="button"
			data-raw={handle.checked}
			data-attr={handle.checked === true ? 'yes' : 'no'}
			data-derived={handle.label}
			onClick={() => handle.toggle()}
		>go</button>
		<output>{handle.checked === true ? 'yes' : 'no'}</output>
	</div>
}
`;

async function compile(source: string, filename = 'src/box.tsrx') {
	return compileTsrxModule({ filename, source, buildId: 'build', resolverId: 'resolver', symbols: [] });
}

const sharedCell = 'shared:src/box.tsrx#box/state:inner';
const sharedComputed = 'shared:src/box.tsrx#box/computed:label';

test('a composite text expression over a shared read subscribes to the shared cell', async () => {
	const compiled = await compile(compositeSource);
	const update = compiled.protocolView.domUpdates.find(
		(candidate) => candidate.target.kind === 'text',
	);

	expect(update?.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(update?.path).toEqual([]);

	const node = compiled.protocolState.computed.find(
		(candidate) => candidate.graphNodeId === update?.graphNodeId,
	);
	expect(node?.dependencies).toEqual([{ graphNodeId: sharedCell, path: ['checked'] }]);
});

test('a composite attribute expression over a shared read subscribes to the shared cell', async () => {
	const compiled = await compile(compositeSource);
	const update = compiled.protocolView.domUpdates.find(
		(candidate) => candidate.target.kind === 'attribute' && candidate.target.name === 'data-attr',
	);
	const node = compiled.protocolState.computed.find(
		(candidate) => candidate.graphNodeId === update?.graphNodeId,
	);

	expect(update?.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(update?.path).toEqual([]);
	expect(node?.dependencies).toEqual([{ graphNodeId: sharedCell, path: ['checked'] }]);
});

test('the synthetic computed reads the shared cell through the graph, not the factory local', async () => {
	const compiled = await compile(compositeSource);
	const derives = compiled.symbolModules.modules.filter(
		(module) => module.kind === 'sync-computed-derive',
	);
	const templateDerives = derives.filter((module) => module.source.includes('yes'));

	expect(templateDerives.length).toBeGreaterThan(0);
	for (const module of templateDerives) {
		// The authored source line quotes the original expression; the emitted
		// function body is what runs, and it may not name the instance local.
		const body = module.source.slice(module.source.indexOf('export function'));
		expect(body).toContain(JSON.stringify(sharedCell));
		expect(body).not.toMatch(/(^|[^\w$."])handle\./);
	}
});

test('a plain read of a shared computed keeps its own node, not a field of the cell', async () => {
	const compiled = await compile(compositeSource);
	const update = compiled.protocolView.domUpdates.find(
		(candidate) =>
			candidate.target.kind === 'attribute' && candidate.target.name === 'data-derived',
	);

	expect(update?.graphNodeId).toBe(sharedComputed);
	expect(update?.path).toEqual([]);
});

test('a plain shared field read still lowers to the cell itself', async () => {
	const compiled = await compile(compositeSource);
	const update = compiled.protocolView.domUpdates.find(
		(candidate) => candidate.target.kind === 'attribute' && candidate.target.name === 'data-raw',
	);

	expect(update?.graphNodeId).toBe(sharedCell);
	expect(update?.path).toEqual(['checked']);
});

test('a composite attribute expression over component-local state also subscribes', async () => {
	const compiled = await compile(
		`
import { state } from '@markless/core';

export function App() @{
	const flags = state({ open: false });

	<button
		type="button"
		aria-expanded={flags.open === true ? 'true' : 'false'}
		onClick={() => { flags.open = !flags.open; }}
	>go</button>
}
`,
		'src/local.tsrx',
	);
	const update = compiled.protocolView.domUpdates.find(
		(candidate) =>
			candidate.target.kind === 'attribute' && candidate.target.name === 'aria-expanded',
	);
	const node = compiled.protocolState.computed.find(
		(candidate) => candidate.graphNodeId === update?.graphNodeId,
	);

	expect(update?.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(node?.dependencies).toEqual([{ graphNodeId: 'state:flags', path: ['open'] }]);
});

test('an attribute expression over props alone stays out of the payload', async () => {
	const compiled = await compile(
		`
export function Badge({ marker }) @{
	<span data-graph={marker === 'graph'} data-literal={marker === 'literal'}>{marker}</span>
}
`,
		'src/badge.tsrx',
	);

	// Nothing can write a prop after the render that read it, so a record here
	// would be payload no interaction can ever wake.
	expect(
		compiled.protocolView.domUpdates.filter(
			(candidate) => candidate.target.kind === 'attribute',
		),
	).toEqual([]);
	expect(compiled.protocolState.computed).toEqual([]);
});

test('a component-body computed over a shared read binds the instance in the SSR body', async () => {
	const compiled = await compile(
		`
import { computed, shared, state } from '@markless/core';

export const cell = shared(() => {
	const inner = state({ checked: false });
	return { ...inner };
}, { scope: 'widget' });

export function Label() @{
	const seat = cell();
	const caption = computed(() => (seat.checked === true ? 'on' : 'off'));

	<output>{caption}</output>
}
`,
		'src/label.tsrx',
	);

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const seat = {"checked": marklessSsrReadPublicPath(',
	);
	expect(compiled.semanticGraph.diagnostics).toEqual([]);
});
