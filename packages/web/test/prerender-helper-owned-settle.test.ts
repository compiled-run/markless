import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { renderPrerenderBoundary } from '../src/prerender/evaluator.ts';

// A @try owned by a helper in the page's own module, settled on an unscoped page graph: the child its arm places is new.
const source = `import { computed, state } from '@markless/core';

function Tally() @{
	let count = state(5);
	<button type="button">{count}</button>
}

function Card() @{
	const label = computed(async () => 'card');
	@try {
		<div>
			<p>{label}</p>
			<Tally />
		</div>
	} @pending {
		<p>Loading</p>
	}
}

export default function Page() @{
	<main><Card /></main>
}`;

type Definition = {
	readonly name: string;
	readonly boundaries?: ReadonlyArray<{ readonly boundaryId: string }>;
	readonly edges?: ReadonlyArray<{
		readonly childComponentName: string;
		readonly symbolPrefix: string;
	}>;
	readonly state: {
		readonly cells: ReadonlyArray<{ readonly graphNodeId: string }>;
		readonly computed: ReadonlyArray<{
			readonly graphNodeId: string;
			readonly async?: boolean;
		}>;
	};
};

function helperOwnedPage() {
	return compileTsrxModule({ filename: 'src/page.tsrx', source, symbols: [] }).then(
		(compiled) => {
			const definitions = compiled.publicRenderModule
				.componentDefinitions as ReadonlyArray<Definition>;
			const named = (name: string) =>
				definitions.find((definition) => definition.name === name)!;
			const edge = (from: string, to: string) =>
				named(from).edges!.find((one) => one.childComponentName === to)!.symbolPrefix;
			const surface = {
				rootComponentName: compiled.renderData.root!.componentName,
				renderData: compiled.renderData,
				components: Object.fromEntries(
					definitions.map((definition) => [definition.name, definition]),
				),
				imports: {},
			};
			return { named, edge, surface };
		},
	);
}

const settled = { status: 'fulfilled', version: 1, key: null, value: 'card' };
const at = (value: unknown, path: ReadonlyArray<string>) =>
	path.reduce(
		(current, segment) => (current as Record<string, unknown> | undefined)?.[segment],
		value,
	);

test("a child a same-module helper's @try places afresh sends its state values", async () => {
	const { named, edge, surface } = await helperOwnedPage();
	const boundaryId = named('Card').boundaries![0]!.boundaryId;
	const label = named('Card').state.computed.find((computed) => computed.async)!;
	const cardPath = edge('Page', 'Card');
	// The settle symbol of a helper's @try runs scoped to the helper's instance.
	const graph = {
		marklessInstancePath: cardPath,
		read: (graphNodeId: string, path: ReadonlyArray<string> = []) =>
			graphNodeId.endsWith(label.graphNodeId) ? at(settled, path) : undefined,
	};

	const rendered = await renderPrerenderBoundary(
		surface as never,
		boundaryId,
		'fulfilled',
		graph as never,
		async () => undefined,
		`${cardPath}${boundaryId}`,
	);

	expect(rendered.html).toContain('<p>card</p>');
	expect(rendered.cells?.map((cell) => cell.value)).toEqual([5]);
	expect(
		rendered.cells?.[0]?.graphNodeId.endsWith(named('Tally').state.cells[0]!.graphNodeId),
	).toBe(true);
});

test("a helper's @try settled with no instance to stand at refuses rather than drawing from the module root", async () => {
	const { named, edge, surface } = await helperOwnedPage();
	const boundaryId = named('Card').boundaries![0]!.boundaryId;
	const graph = {
		read: (_graphNodeId: string, path: ReadonlyArray<string> = []) => at(settled, path),
	};

	await expect(
		renderPrerenderBoundary(
			surface as never,
			boundaryId,
			'fulfilled',
			graph as never,
			async () => undefined,
			`${edge('Page', 'Card')}${boundaryId}`,
		),
	).rejects.toThrow('MARKLESS_PRERENDER_OWNER_UNPLACED');
});
