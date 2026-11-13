import { beforeAll, expect, test } from 'vitest';
import { renderSettledArm } from '../../../web/src/settle-kernel.ts';
import { renderPrerenderBoundary as renderThroughEntry } from '../../../web/src/fns/prerender-resume.ts';
import { renderPrerenderBoundary as renderThroughEvaluator } from '../../../web/src/prerender/evaluator.ts';
import {
	installMarklessComposedArmRecords,
	marklessInstancePath,
	marklessInstanceScopedGraph,
} from '../../../web/src/fns/instance-scope.ts';
import { branchOwnerPlacement } from '../../../web/src/prerender/owner-placement.ts';
import { composedArmRecordQualifier } from '../../../web/src/resume-handle-qualifier.ts';
import './lists.tsrx';
import './twins.tsrx';
import './deep.tsrx';
import './arm.tsrx';

// The kernel and the evaluator settle the same arm of a component placed below the module root; through
// the qualifier that re-spells both in page space, they must commit the same markup and records.

type Edge = {
	readonly childComponentName: string;
	readonly symbolPrefix: string;
	readonly hostPrefix: string;
	readonly props?: ReadonlyArray<{
		readonly name: string;
		readonly kind: string;
		readonly graphNodeId?: string;
		readonly path?: ReadonlyArray<string>;
	}>;
};
type Definition = {
	readonly name: string;
	readonly edges?: ReadonlyArray<Edge>;
	readonly boundaries?: ReadonlyArray<{ readonly boundaryId: string }>;
	readonly view: { readonly asyncBoundaries?: ReadonlyArray<{ readonly id: string; readonly updateSymbolId?: string }> };
	readonly initializers?: Readonly<Record<string, unknown>>;
};
type Surface = {
	readonly rootComponentName: string;
	readonly components: Readonly<Record<string, Definition>>;
};

// The page composes each fixture's module root here.
const MODULE_ROOT = 'c0:';
const rows = [
	{ id: 1, name: 'Dune 0' },
	{ id: 2, name: 'Emma 0' },
];
const answered = (value: unknown) => ({ status: 'fulfilled', version: 2, key: null, value });

async function renderData(file: string): Promise<Surface> {
	const id = `/@id/__x00__virtual:markless:render-data:${encodeURIComponent(`browser/kernel-placed-rows/${file}`)}`;
	return ((await import(/* @vite-ignore */ id)) as { marklessPrerenderData: Surface }).marklessPrerenderData;
}

// The owner's path from the module root, read off the compiled edges; `rows` names the row segment an edge sits in.
function ownerPaths(surface: Surface, chain: ReadonlyArray<string>, rowsBefore: Readonly<Record<string, string>> = {}) {
	let symbols = MODULE_ROOT;
	let hosts = MODULE_ROOT;
	let parentSymbols = MODULE_ROOT;
	let edge: Edge | undefined;
	for (let index = 1; index < chain.length; index++) {
		edge = surface.components[chain[index - 1]!]!.edges!.find((one) => one.childComponentName === chain[index])!;
		const row = rowsBefore[chain[index]!] ?? '';
		parentSymbols = symbols;
		symbols += row + edge.symbolPrefix;
		hosts += row + edge.hostPrefix;
	}
	return { symbols, hosts, parentSymbols, edge: edge! };
}

type Fixture = {
	readonly file: string;
	readonly chain: ReadonlyArray<string>;
	readonly rowsBefore?: Readonly<Record<string, string>>;
	// Page-space values the live graph holds when the answer lands, keyed by instance path then local id.
	readonly values: (paths: { readonly symbols: string; readonly parentSymbols: string }) => Readonly<Record<string, unknown>>;
	readonly shows: ReadonlyArray<string>;
};

const fixtures: ReadonlyArray<Fixture> = [
	{
		file: 'lists.tsrx',
		chain: ['Root', 'App', 'Todos'],
		rowsBefore: { Todos: 'r:10:' },
		values: ({ symbols, parentSymbols }) => ({
			[`${MODULE_ROOT}state:rate`]: 3,
			[`${parentSymbols}state:reload`]: 0,
			[`${parentSymbols}state:views`]: [
				{ id: 10, filter: '' },
				{ id: 20, filter: 'a' },
			],
			[`${symbols}state:picked`]: '',
			[`${symbols}state:filter`]: '',
			[`${symbols}computed:data`]: answered(rows),
		}),
		shows: ['Dune 0', 'Emma 0'],
	},
	{
		file: 'lists.tsrx',
		chain: ['Root', 'App', 'Todos'],
		rowsBefore: { Todos: 'r:20:' },
		values: ({ symbols, parentSymbols }) => ({
			[`${MODULE_ROOT}state:rate`]: 3,
			[`${parentSymbols}state:reload`]: 0,
			[`${parentSymbols}state:views`]: [
				{ id: 10, filter: '' },
				{ id: 20, filter: 'a' },
			],
			[`${symbols}state:picked`]: '',
			[`${symbols}state:filter`]: 'a',
			[`${symbols}computed:data`]: answered([rows[1]]),
		}),
		shows: ['Emma 0'],
	},
	{
		file: 'twins.tsrx',
		chain: ['Pair', 'Shelf'],
		values: ({ symbols, parentSymbols }) => ({
			[`${parentSymbols}state:poll`]: 1,
			[`${symbols}computed:books`]: answered(rows),
		}),
		shows: ['Dune 0', 'Emma 0'],
	},
	{
		file: 'deep.tsrx',
		chain: ['Outer', 'Middle', 'Board'],
		values: ({ symbols }) => ({
			[`${MODULE_ROOT}state:round`]: 0,
			[`${symbols}state:query`]: '',
			[`${symbols}computed:cards`]: answered(rows),
		}),
		shows: ['Dune 0', 'Emma 0'],
	},
	{
		// The parent renamed the topic after the arm opened and before the answer landed; the prop cell follows it.
		file: 'arm.tsrx',
		chain: ['Toggle', 'Picker'],
		values: ({ symbols }) => ({
			[`${MODULE_ROOT}state:open`]: true,
			[`${MODULE_ROOT}state:heading`]: 'second',
			[`${symbols}prop:props`]: { topic: 'second' },
			[`${symbols}computed:matches`]: answered(rows),
		}),
		shows: ['Dune 0', 'Emma 0'],
	},
];

beforeAll(() => installMarklessComposedArmRecords());

function pageGraph(values: Readonly<Record<string, unknown>>) {
	return {
		read(graphNodeId: string, path: ReadonlyArray<string> = []) {
			let value = values[graphNodeId];
			for (const segment of path) value = (value as Record<string, unknown> | undefined)?.[segment];
			return value;
		},
		write() {},
		subscribe: () => () => {},
	};
}

type Rendered = {
	readonly html: string;
	readonly armRecords: Record<string, ReadonlyArray<Record<string, unknown>> | undefined>;
	readonly computed?: ReadonlyArray<{ readonly graphNodeId: string }>;
};

// The fields commit reads, as page-space facts.
function committed(update: Rendered, ownerPath: string) {
	const records = update.armRecords;
	return {
		html: update.html,
		locators: records.locators,
		events: records.events,
		domUpdates: records.domUpdates,
		keyedRepeats: (records.keyedRepeats ?? []).map((repeat) => ({
			id: repeat.id,
			parentHostNodeId: repeat.parentHostNodeId,
			collectionGraphNodeId: repeat.collectionGraphNodeId,
			collectionPath: repeat.collectionPath,
			rowEventSymbolIds: (repeat.rowEvents as ReadonlyArray<{ readonly symbolIds: ReadonlyArray<string> }>).map(
				(event) => event.symbolIds,
			),
		})),
		ownerComputedIds: (update.computed ?? [])
			.map((computed) => computed.graphNodeId)
			.filter((graphNodeId) => graphNodeId.startsWith(ownerPath))
			.sort(),
	};
}

for (const fixture of fixtures)
	test(`kernel and evaluator commit the same arm for ${fixture.chain.at(-1)} in ${fixture.file}${fixture.rowsBefore ? ` (${Object.values(fixture.rowsBefore).join('')})` : ''}`, async () => {
		const surface = await renderData(fixture.file);
		const owner = surface.components[fixture.chain.at(-1)!]!;
		const boundaryId = owner.boundaries![0]!.boundaryId;
		const paths = ownerPaths(surface, fixture.chain, fixture.rowsBefore);
		const graph = marklessInstanceScopedGraph(pageGraph(fixture.values(paths)) as never, paths.symbols);
		const loadSymbol = async (symbolId: string) => {
			const local = symbolId.slice(marklessInstancePath(symbolId).length);
			return Object.values(surface.components).find((definition) => definition.initializers?.[local])
				?.initializers?.[local];
		};
		const updateSymbolId = owner.view.asyncBoundaries!.find((one) => one.id === boundaryId)!.updateSymbolId;
		const boundary = {
			id: paths.hosts + boundaryId,
			...(updateSymbolId && { updateSymbolId: paths.symbols + updateSymbolId }),
			composedInstancePath: paths.symbols,
			composedGraphProps: (paths.edge.props ?? []).flatMap((prop) =>
				prop.kind === 'graph-reference' && prop.graphNodeId
					? [{ name: prop.name, graphNodeId: paths.parentSymbols + prop.graphNodeId, path: prop.path ?? [] }]
					: [],
			),
		};
		const qualify = composedArmRecordQualifier()!.boundaryUpdate!;

		const kernel = renderSettledArm({
			surface: surface as never,
			boundaryId,
			status: 'fulfilled',
			read: (graphNodeId, path = []) => graph.read(graphNodeId, path),
			placement: (name) => branchOwnerPlacement(surface as never, name, graph as never),
		});
		const evaluated = await renderThroughEvaluator(
			surface as never,
			boundaryId,
			'fulfilled',
			graph as never,
			loadSymbol,
			boundary.id,
		);
		const viaKernel = {
			html: kernel.html,
			...qualify(
				boundary as never,
				{ armRecords: kernel.armRecords, computed: kernel.computed, moduleRootPath: kernel.moduleRootPath } as never,
				graph as never,
			),
		} as unknown as Rendered;
		const viaEvaluator = {
			html: evaluated.html,
			...qualify(boundary as never, evaluated as never, graph as never, evaluated.renderedBoundaryId),
		} as unknown as Rendered;

		for (const text of fixture.shows) expect(viaKernel.html).toContain(text);
		expect(kernel.moduleRootPath).toBe(MODULE_ROOT);
		expect(committed(viaKernel, paths.symbols)).toEqual(committed(viaEvaluator, paths.symbols));
	});

// An arm that writes the renamed prop into its own markup binds it to the @if; the kernel refuses and the evaluator draws it.
test('a placed arm showing a prop its @if feeds stays with the evaluator, which draws the renamed value', async () => {
	const surface = await renderData('arm.tsrx');
	const owner = surface.components.Panel!;
	const boundaryId = owner.boundaries![0]!.boundaryId;
	const paths = ownerPaths(surface, ['Toggle', 'Panel']);
	const graph = marklessInstanceScopedGraph(
		pageGraph({
			[`${MODULE_ROOT}state:open`]: true,
			[`${MODULE_ROOT}state:heading`]: 'second',
			[`${paths.symbols}prop:props`]: { heading: 'second' },
			[`${paths.symbols}computed:items`]: answered(rows),
		}) as never,
		paths.symbols,
	);
	expect(() =>
		renderSettledArm({
			surface: surface as never,
			boundaryId,
			status: 'fulfilled',
			read: (graphNodeId, path = []) => graph.read(graphNodeId, path),
			placement: (name) => branchOwnerPlacement(surface as never, name, graph as never),
		}),
	).toThrow(/bound symbol id/);
	const viaEntry = await renderThroughEntry(surface as never, boundaryId, 'fulfilled', graph as never, async () => undefined, paths.hosts + boundaryId);
	expect(viaEntry.html).toContain('<h2>second</h2>');
});
